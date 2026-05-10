import type { APIRoute } from "astro";
import { YTNodes } from "youtubei.js";
import { getInnertube, invalidateInnertube } from "../../lib/youtube";
import { checkRateLimit } from "../../lib/rateLimit";

interface MessagePart {
  type: "text" | "emoji";
  text?: string;
  url?: string;
  alt?: string;
  emojiText?: string;
  isCustomEmoji?: boolean;
}

interface ChatMessage {
  id: string;
  author: string;
  authorChannelId?: string;
  authorAvatar?: string;
  badges?: Record<string, string>;
  parts: MessagePart[];
  timestamp: Date;
  messageType?: string;
  giftCount?: number;
  recipientName?: string;
  superchat?: {
    amount: string;
    color: string;
    sticker?: {
      url: string;
      alt: string;
    };
  };
}

/** Maximum number of concurrent YouTube live chat sessions held in memory. */
const MAX_ACTIVE_SESSIONS = 50;

/** Maximum idle time (ms) before a session is reaped. */
const MAX_IDLE_MS = 10 * 60_000;

/** Cooldown after a 403 block. */
const CHAT_FAILURE_COOLDOWN_MS = parseInt(
  process.env.YT_CHAT_COOLDOWN_MS || "60000",
  10,
);
const blockedChatFailures = new Map<string, number>();

setInterval(() => {
  const now = Date.now();
  for (const [key, expiresAt] of blockedChatFailures) {
    if (now > expiresAt) blockedChatFailures.delete(key);
  }
}, 120_000);

// SSE client waiting for messages
interface SSEClient {
  id: string;
  controller: ReadableStreamDefaultController;
  lastMessageId: string | null;
  connectedAt: number;
}

// Shared session for a videoId
interface ChatSession {
  chat: any;
  messages: ChatMessage[];
  clients: Map<string, SSEClient>;
  lastUpdate: number;
}

const activeLiveChats = new Map<string, ChatSession>();

function shutdownActiveSessions() {
  for (const [key, session] of activeLiveChats) {
    for (const client of session.clients.values()) {
      try {
        client.controller.close();
      } catch {}
    }
    try {
      session.chat?.stop();
    } catch {}
  }
  console.log(
    `[YouTube Chat] Graceful shutdown — stopped ${activeLiveChats.size} sessions`,
  );
  activeLiveChats.clear();
}
process.on("SIGTERM", shutdownActiveSessions);
process.on("SIGINT", shutdownActiveSessions);

// SSE helpers
function sseEvent(data: string, event?: string, id?: string): string {
  let out = "";
  if (event) out += `event: ${event}\n`;
  if (id) out += `id: ${id}\n`;
  out += `data: ${data}\n\n`;
  return out;
}

function broadcast(
  session: ChatSession,
  event: string,
  data: unknown,
  msgId?: string,
) {
  const payload = JSON.stringify(data);
  const deadClients: string[] = [];
  for (const [clientId, client] of session.clients) {
    try {
      client.controller.enqueue(sseEvent(payload, event, msgId));
    } catch {
      deadClients.push(clientId);
    }
  }
  for (const id of deadClients) {
    session.clients.delete(id);
  }
}
// Parsers
function ARGBtoHex(argb: number): string {
  const unsigned = argb >>> 0;
  const hex = (unsigned & 0xffffff).toString(16).padStart(6, "0");
  return `#${hex}`;
}

function parseMessageRuns(msg: any): MessagePart[] {
  const parts: MessagePart[] = [];
  const message = msg.message || msg.header_subtext;
  if (!message?.runs) return parts;

  for (const run of message.runs) {
    if (run.emoji) {
      const emoji = run.emoji;
      const name = emoji.shortcuts?.[0] || emoji.emoji_id || "emoji";
      const url = Array.isArray(emoji.image) ? emoji.image[0]?.url : undefined;
      const isCustom = !!emoji.is_custom;
      if (!isCustom) {
        if (emoji.emoji_id) parts.push({ type: "text", text: emoji.emoji_id });
        continue;
      }
      if (!url) continue;
      parts.push({
        type: "emoji",
        url,
        alt: name,
        emojiText: name,
        isCustomEmoji: true,
      });
    } else {
      parts.push({ type: "text", text: run.text || "" });
    }
  }
  return parts;
}

function parseTimestamp(msg: any): Date {
  const raw = parseInt(msg.timestamp || msg.timestamp_usec || "0");
  const asMs = new Date(raw);
  const asUs = new Date(raw / 1000);
  const now = new Date();
  return Math.abs(now.getTime() - asMs.getTime()) <
    Math.abs(now.getTime() - asUs.getTime())
    ? asMs
    : asUs;
}

function parseBadges(msg: any): Record<string, string> {
  const badges: Record<string, string> = {};
  if (msg.author?.badges) {
    for (const badge of msg.author.badges) {
      if (badge.thumbnails && badge.thumbnails[0]) {
        badges[badge.label || "badge"] = badge.thumbnails[0].url;
      }
    }
  }
  return badges;
}

function parseChatItem(item: any): ChatMessage | null {
  if (item.is(YTNodes.LiveChatTextMessage)) {
    return {
      id: item.id,
      author: item.author?.name?.toString() || "Unknown",
      authorChannelId: item.author?.id,
      authorAvatar: Array.isArray(item.author?.thumbnails)
        ? item.author.thumbnails[0]?.url
        : undefined,
      badges: parseBadges(item),
      parts: parseMessageRuns(item),
      timestamp: parseTimestamp(item),
    };
  }
  if (item.is(YTNodes.LiveChatPaidMessage)) {
    const base = parseChatItem(item)!;
    return {
      ...base,
      superchat: {
        amount: item.purchase_amount?.toString() || "Unknown",
        color: ARGBtoHex(
          item.body_background_color ||
            item.header_background_color ||
            item.card_background_color ||
            0,
        ),
      },
    };
  }
  if (item.is(YTNodes.LiveChatPaidSticker)) {
    const stickerUrl =
      item.sticker?.thumbnails?.[0]?.url || item.sticker?.image?.[0]?.url;
    return {
      id: item.id,
      author: item.author?.name?.toString() || "Unknown",
      authorChannelId: item.author?.id,
      authorAvatar: Array.isArray(item.author?.thumbnails)
        ? item.author.thumbnails[0]?.url
        : undefined,
      badges: parseBadges(item),
      parts: [],
      timestamp: parseTimestamp(item),
      superchat: {
        amount: item.purchase_amount?.toString() || "Unknown",
        color: ARGBtoHex(
          item.background_color || item.money_chip_background_color || 0,
        ),
        ...(stickerUrl && {
          sticker: {
            url: stickerUrl,
            alt: (item.author?.name?.toString() || "System") + " sticker",
          },
        }),
      },
    };
  }
  if (item.is(YTNodes.LiveChatMembershipItem)) {
    const base = parseChatItem(item)!;
    return {
      ...base,
      superchat: {
        amount: item.header_subtext?.toString() || "Member",
        color: "#0f9d58",
      },
    };
  }
  return null;
}


// Session management
function reapIdleSessions() {
  const nowMs = Date.now();
  for (const [key, session] of activeLiveChats) {
    if (nowMs - session.lastUpdate > MAX_IDLE_MS) {
      for (const client of session.clients.values()) {
        try {
          client.controller.close();
        } catch {}
      }
      try {
        session.chat?.stop();
      } catch {}
      activeLiveChats.delete(key);
      console.log("[YouTube Chat] Reaped idle session for", key);
    }
  }
}

async function ensureChatSession(videoId: string): Promise<ChatSession> {
  // Return existing session
  let session = activeLiveChats.get(videoId);
  if (session) {
    session.lastUpdate = Date.now();
    return session;
  }

  // Check 403 cooldown
  const blockedUntil = blockedChatFailures.get(videoId);
  if (blockedUntil && blockedUntil > Date.now()) {
    throw new Error("BLOCKED");
  }
  if (blockedUntil) blockedChatFailures.delete(videoId);

  // Evict LRU if at capacity
  if (activeLiveChats.size >= MAX_ACTIVE_SESSIONS) {
    let oldestKey = "";
    let oldestTime = Infinity;
    for (const [key, s] of activeLiveChats) {
      if (s.lastUpdate < oldestTime) {
        oldestTime = s.lastUpdate;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      const old = activeLiveChats.get(oldestKey)!;
      for (const c of old.clients.values()) {
        try {
          c.controller.close();
        } catch {}
      }
      try {
        old.chat?.stop();
      } catch {}
      activeLiveChats.delete(oldestKey);
    }
  }

  const yt = await getInnertube();
  const info = await yt.getInfo(videoId);
  const chat = info.getLiveChat();
  const messages: ChatMessage[] = [];

  const parse = (item: any): ChatMessage | null => {
    if (item.is(YTNodes.LiveChatTextMessage)) return parseChatItem(item);
    if (item.is(YTNodes.LiveChatPaidMessage)) return parseChatItem(item);
    if (item.is(YTNodes.LiveChatPaidSticker)) return parseChatItem(item);
    if (item.is(YTNodes.LiveChatMembershipItem)) return parseChatItem(item);
    if (item.is(YTNodes.LiveChatSponsorshipsGiftPurchaseAnnouncement)) return parseGiftPurchaseAnnouncement(item);
    if (item.is(YTNodes.LiveChatSponsorshipsGiftRedemptionAnnouncement)) return parseGiftRedemptionAnnouncement(item);
    return null;
  };

  chat.on("start", (initialData: any) => {
    console.log(
      `[YouTube Chat] Live chat started for video ${videoId}, viewer: ${initialData?.viewer_name || "Guest"}`,
    );
    if (initialData?.actions) {
      for (const action of initialData.actions) {
        if (!action?.is?.(YTNodes.AddChatItemAction)) continue;
        const item = action.as(YTNodes.AddChatItemAction)?.item;
        if (!item) continue;
        const msg = parse(item);
        if (msg && !messages.some((m) => m.id === msg.id)) {
          messages.push(msg);
          if (messages.length > 200) messages.shift();
        }
      }
    }
  });

  chat.on("chat-update", (action: any) => {
    if (!action?.is) return;
    try {
      if (action.is(YTNodes.AddChatItemAction)) {
        const item = action.as(YTNodes.AddChatItemAction)?.item;
        if (!item) return;
        const msg = parse(item);
        if (msg && !messages.some((m) => m.id === msg.id)) {
          messages.push(msg);
          if (messages.length > 200) messages.shift();
          broadcast(session!, "message", msg, msg.id);
        }
        return;
      }
      if (action.is(YTNodes.RemoveChatItemAction)) {
        const targetId = action.target_item_id;
        if (targetId) {
          const idx = messages.findIndex((m) => m.id === targetId);
          if (idx !== -1) messages.splice(idx, 1);
          broadcast(session!, "delete", { messageId: targetId });
        }
      }
    } catch (e) {
      console.warn(
        "[YouTube Chat] Failed to parse chat-update action:",
        e instanceof Error ? e.message : String(e),
      );
    }
  });

  chat.on("end", () => {
    console.log(`[YouTube Chat] Live stream ended for video ${videoId}`);
    try {
      chat.stop();
    } catch {}
    const s = activeLiveChats.get(videoId);
    if (s) {
      for (const c of s.clients.values()) {
        try {
          c.controller.enqueue(
            sseEvent(JSON.stringify({ reason: "ended" }), "end"),
          );
        } catch {}
        try {
          c.controller.close();
        } catch {}
      }
      activeLiveChats.delete(videoId);
    }
  });

  chat.on("error", (err: any) => {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("YouTube LiveChat error:", errMsg);

    const s = activeLiveChats.get(videoId);
    if (!s) return;

    if (errMsg.includes("403")) {
      blockedChatFailures.set(videoId, Date.now() + CHAT_FAILURE_COOLDOWN_MS);
      console.error(
        "[YouTube Chat] Blocked for",
        videoId,
        "— invalidating Innertube.",
      );
      invalidateInnertube();
      for (const c of s.clients.values()) {
        try {
          c.controller.enqueue(
            sseEvent(
              JSON.stringify({ error: "YouTube blocked this request" }),
              "error",
            ),
          );
        } catch {}
        try {
          c.controller.close();
        } catch {}
      }
      try {
        chat.stop();
      } catch {}
      activeLiveChats.delete(videoId);
      return;
    }

    // Non-403 error: wait 30s then clean up
    setTimeout(() => {
      const current = activeLiveChats.get(videoId);
      if (current?.chat === chat) {
        for (const c of current.clients.values()) {
          try {
            c.controller.enqueue(
              sseEvent(
                JSON.stringify({ error: "Chat connection lost" }),
                "error",
              ),
            );
          } catch {}
          try {
            c.controller.close();
          } catch {}
        }
        try {
          chat.stop();
        } catch {}
        activeLiveChats.delete(videoId);
      }
    }, 30000);
  });

  console.log(`[YouTube Chat] Starting live chat for video ${videoId}`);
  chat.start();

  session = { chat, messages, clients: new Map(), lastUpdate: Date.now() };
  activeLiveChats.set(videoId, session);
  return session;
}

// SSE endpoint
export const GET: APIRoute = async ({ url, clientAddress }) => {
  if (!checkRateLimit(`${clientAddress}:youtube-stream-chat`, 60, 60_000)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "60" },
    });
  }

  const videoId = url.searchParams.get("videoId");
  if (!videoId) {
    return new Response(
      JSON.stringify({ error: "videoId query parameter is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  if (!/^[\w-]{11}$/.test(videoId)) {
    return new Response(JSON.stringify({ error: "Invalid videoId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  reapIdleSessions();

  let session: ChatSession;
  try {
    session = await ensureChatSession(videoId);
  } catch (err: any) {
    if (err.message === "BLOCKED") {
      return new Response(
        JSON.stringify({
          error: "Live chat temporarily unavailable due to repeated failures",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("status code 403") || msg.includes("403")) {
      return new Response(
        JSON.stringify({
          error:
            "Live chat temporarily unavailable due to YouTube blocking (403)",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }
    if (msg.includes("not available")) {
      return new Response(
        JSON.stringify({
          error: "Live chat is not available for this video",
          videoId,
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }
    console.error("[YouTube Chat] Error setting up chat for", videoId, msg);
    return new Response(
      JSON.stringify({ error: "Failed to connect to YouTube chat" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const clientId = `${videoId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

  const stream = new ReadableStream({
    start(controller) {
      const client: SSEClient = {
        id: clientId,
        controller,
        lastMessageId: null,
        connectedAt: Date.now(),
      };
      session.clients.set(clientId, client);
      session.lastUpdate = Date.now();

      // Send initial batch
      if (session.messages.length > 0) {
        controller.enqueue(
          sseEvent(
            JSON.stringify({
              messages: session.messages,
              count: session.messages.length,
            }),
            "connected",
          ),
        );
      } else {
        controller.enqueue(
          sseEvent(JSON.stringify({ messages: [], count: 0 }), "connected"),
        );
      }

      console.log(
        `[YouTube Chat] SSE client connected: ${clientId} (${session.clients.size} total for ${videoId})`,
      );
    },
    cancel() {
      session.clients.delete(clientId);
      session.lastUpdate = Date.now();
      console.log(
        `[YouTube Chat] SSE client disconnected: ${clientId} (${session.clients.size} remaining for ${videoId})`,
      );

      // If no clients left, keep session alive for MAX_IDLE_MS (reaped by cleanup)
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
};

// Gift announcement parsers (from main branch)
function parseGiftPurchaseAnnouncement(msg: any): ChatMessage {
  const base = parseLiveChatMessage(msg);
  const giftCount = msg.gift_memberships?.count || msg.gift_count || 1;
  const amount = msg.purchase_amount?.toString() || `${giftCount} gift${giftCount > 1 ? 's' : ''}`;

  return {
    ...base,
    messageType: 'gift-purchase',
    superchat: {
      amount,
      color: '#9c27b0', // Purple for gift purchases
    },
    giftCount,
  };
}

function parseGiftRedemptionAnnouncement(msg: any): ChatMessage {
  const base = parseLiveChatMessage(msg);
  const recipientName = msg.recipient?.name?.toString() || msg.header_subtext?.toString() || '';

  return {
    ...base,
    messageType: 'gift-redemption',
    recipientName,
    superchat: {
      amount: 'Gift received',
      color: '#4caf50', // Green for gift redemptions
    },
  };
}

function parseLiveChatMessage(msg: any): ChatMessage {
  const parts: MessagePart[] = [];
  const message = msg.message || msg.header_subtext;

  if (message && message.runs) {
    for (const run of message.runs) {
      if (run.emoji) {
        const emoji = run.emoji;
        const name = emoji.shortcuts?.[0] || emoji.emoji_id || 'emoji';
        const url = Array.isArray(emoji.image) ? emoji.image[0]?.url : undefined;
        const isCustom = !!emoji.is_custom;

        if (!isCustom) {
          if (emoji.emoji_id) parts.push({ type: 'text', text: emoji.emoji_id });
          continue;
        }

        if (!url) continue;

        parts.push({
          type: 'emoji',
          url,
          alt: name,
          emojiText: name,
          isCustomEmoji: true,
        });
      } else {
        parts.push({ type: 'text', text: run.text || '' });
      }
    }
  }

  const badges: Record<string, string> = {};
  if (msg.author?.badges) {
    for (const badge of msg.author.badges) {
      if (badge.thumbnails && badge.thumbnails[0]) {
        badges[badge.label || 'badge'] = badge.thumbnails[0].url;
      }
    }
  }

  const rawTimestamp = parseInt(msg.timestamp || msg.timestamp_usec || '0');
  const asMillisecondsDirectly = new Date(rawTimestamp);
  const asUsToMs = new Date(rawTimestamp / 1000);
  const now = new Date();
  const msTimeDiff = Math.abs(now.getTime() - asMillisecondsDirectly.getTime());
  const usTimeDiff = Math.abs(now.getTime() - asUsToMs.getTime());
  const timestamp = msTimeDiff < usTimeDiff ? asMillisecondsDirectly : asUsToMs;

  return {
    id: msg.id,
    author: msg.author?.name?.toString() || 'Unknown',
    authorChannelId: msg.author?.id,
    authorAvatar: Array.isArray(msg.author?.thumbnails) ? msg.author.thumbnails[0]?.url : undefined,
    badges,
    parts,
    timestamp,
  };
}
