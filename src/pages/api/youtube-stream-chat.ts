import type { APIRoute } from "astro";
import { YTNodes } from "youtubei.js";
import { getInnertube } from "../../lib/youtube";
import { checkRateLimit } from "../../lib/rateLimit";
import { isPlayabilityError } from "./youtube-stream-chat.playability";

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
  isDeleted?: boolean;
  deletedByText?: string;
  authorIsModerator?: boolean;
  authorIsOwner?: boolean;
  authorIsMember?: boolean;
  superchat?: {
    amount: string;
    color: string;
    sticker?: {
      url?: string;
      alt?: string;
    };
  };
}

/** Maximum number of concurrent YouTube live chat sessions held in memory. */
const MAX_ACTIVE_SESSIONS = parseInt(process.env.YT_MAX_SESSIONS || "200", 10);

/** Maximum idle time (ms) before a session is reaped. */
const MAX_IDLE_MS = 10 * 60_000;

/** Cooldown after a 403 block. */
const CHAT_FAILURE_COOLDOWN_MS = parseInt(
  process.env.YT_CHAT_COOLDOWN_MS || "60000",
  10,
);
const blockedChatFailures = new Map<string, number>();

/**
 * Cooldown for terminal playability errors (video unavailable, private,
 * removed, etc.). These don't change with retries, so we cache the failure
 * for a few minutes to stop hammering YouTube.
 */
const PLAYABILITY_ERROR_COOLDOWN_MS = parseInt(
  process.env.YT_PLAYABILITY_COOLDOWN_MS || "100000",
  10,
);
const playabilityErrors = new Map<string, { message: string; until: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, expiresAt] of blockedChatFailures) {
    if (now > expiresAt) blockedChatFailures.delete(key);
  }
  for (const [key, entry] of playabilityErrors) {
    if (now > entry.until) playabilityErrors.delete(key);
  }
}, 120_000);

setInterval(() => {
  reapIdleSessions();
}, 60_000);

// SSE client waiting for messages
interface SSEClient {
  id: string;
  controller: ReadableStreamDefaultController;
  lastMessageId: string | null;
  connectedAt: number;
}

const SESSION_GRACE_PERIOD_MS = 30_000;

// Shared session for a videoId
interface ChatSession {
  chat: any;
  messages: ChatMessage[];
  seenIds: Set<string>;
  clients: Map<string, SSEClient>;
  lastUpdate: number;
  destroyTimer: ReturnType<typeof setTimeout> | null;
  ready: Promise<void>;
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

function parseRuns(runs: any[]): MessagePart[] {
  const parts: MessagePart[] = [];
  for (const run of runs) {
    if (run.emoji) {
      const emoji = run.emoji;
      const name = emoji.shortcuts?.[0] || emoji.emoji_id || "emoji";
      const url = Array.isArray(emoji.image) ? emoji.image[0]?.url : undefined;
      const isCustom = !!(emoji.is_custom ?? emoji.isCustomEmoji);
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

function parseMessageRuns(msg: any): MessagePart[] {
  const message = msg.message || msg.header_subtext;
  if (!message?.runs) return [];
  return parseRuns(message.runs);
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

function getBadgeLabel(badge: any): string {
  if (!badge) return "";
  if (typeof badge.label === "string") return badge.label;
  if (typeof badge.tooltip === "string") return badge.tooltip;
  if (typeof badge.icon_type === "string") return badge.icon_type;
  return "";
}

function getBadgeIconUrl(badge: any): string | undefined {
  if (!badge) return undefined;
  if (Array.isArray(badge.custom_thumbnail) && badge.custom_thumbnail[0]) {
    const first = badge.custom_thumbnail[0];
    if (Array.isArray(first?.thumbnails) && first.thumbnails[0]?.url) {
      return first.thumbnails[0].url;
    }
    if (first?.url) return first.url;
  }
  if (Array.isArray(badge.thumbnails) && badge.thumbnails[0]?.url) {
    return badge.thumbnails[0].url;
  }
  return undefined;
}

export function parseBadges(msg: any): Record<string, string> {
  const badges: Record<string, string> = {};
  if (msg.author?.badges) {
    for (const badge of msg.author.badges) {
      const url = getBadgeIconUrl(badge);
      if (url) {
        const label = getBadgeLabel(badge) || "badge";
        badges[label] = url;
      }
    }
  }
  return badges;
}

export function isAuthorModerator(msg: any): boolean {
  // youtubei.js exposes Author.is_moderator and LiveChatAuthorBadge.icon_type
  // for the authoritative moderator signal. Match the same rule used by
  // isAuthorOwner (icon_type === "OWNER" only) to avoid false positives from
  // community badges whose label happens to contain "moderator".
  if (!msg.author) return false;
  if (msg.author.is_moderator) return true;
  if (!msg.author.badges) return false;
  return msg.author.badges.some((b: any) => b?.icon_type === "MODERATOR");
}

export function isAuthorOwner(msg: any): boolean {
  // NOTE: A *verified* author is NOT the broadcaster. The live-chat owner badge
  // is identified by its icon type ("OWNER"); youtubei.js exposes no is_owner
  // flag. Treating verified/verified-artist as owner caused non-mods (any
  // verified channel) to be flagged as the broadcaster.
  if (!msg.author?.badges) return false;
  return msg.author.badges.some((b: any) => {
    if (b?.icon_type === "OWNER") return true;
    return getBadgeLabel(b).toLowerCase() === "owner";
  });
}

function isAuthorMember(msg: any): boolean {
  // The YouTube member badge is identified by its icon_type ("MEMBER" for new
  // streams, "SPONSOR" for legacy). Channel-level membership cannot be derived
  // from regular chat events — only from the badges YouTube attaches to the
  // author's row in the live chat panel.
  if (!msg.author?.badges) return false;
  return msg.author.badges.some((b: any) => {
    if (!b) return false;
    if (b.icon_type === "MEMBER" || b.icon_type === "SPONSOR") return true;
    const label = getBadgeLabel(b).toLowerCase();
    return label === "member" || label === "sponsor";
  });
}

/**
 * Extracts plain text from a youtubei.js `Text` node (used for
 * `deleted_state_message` on MarkChatItemAsDeletedAction and friends).
 * The Text node exposes `.toString()` for simple text and `.runs` for
 * styled segments; we concatenate both for a safe fallback.
 */
function extractDeletedByText(textNode: any): string | undefined {
  if (!textNode) return undefined;
  try {
    if (typeof textNode.toString === "function") {
      const s = textNode.toString();
      if (s && typeof s === "string") return s;
    }
  } catch {}
  if (Array.isArray(textNode.runs)) {
    const out = textNode.runs
      .map((r: any) => (typeof r?.text === "string" ? r.text : ""))
      .join("");
    if (out) return out;
  }
  if (typeof textNode.text === "string") return textNode.text;
  return undefined;
}

/**
 * Detects a "deleted" chat item delivered in the body of an
 * AddChatItemAction or ReplaceChatItemAction. InnerTube sometimes ships
 * a moderator-deleted message as a fresh LiveChatTextMessage whose
 * `message` text is the "deleted by" placeholder. When that pattern is
 * present we return the text; otherwise undefined.
 */
function detectDeletedReplacementText(item: any): string | undefined {
  if (!item) return undefined;
  // LiveChatTextMessage carries its content on `message` (a Text node).
  const text = extractDeletedByText(item.message);
  if (!text) return undefined;
  const lower = text.toLowerCase();
  if (
    lower.startsWith("message deleted by") ||
    lower.startsWith("message removed by") ||
    lower === "this message was deleted by the author." ||
    lower.includes("deleted by")
  ) {
    return text;
  }
  return undefined;
}

function parseTextMessageBase(item: any): ChatMessage {
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
    authorIsModerator: isAuthorModerator(item) || undefined,
    authorIsOwner: isAuthorOwner(item) || undefined,
    authorIsMember: isAuthorMember(item) || undefined,
  };
}

function parseChatItem(item: any): ChatMessage | null {
  if (item.is(YTNodes.LiveChatTextMessage)) {
    return parseTextMessageBase(item);
  }
  if (item.is(YTNodes.LiveChatPaidMessage)) {
    return {
      ...parseTextMessageBase(item),
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
      authorIsModerator: isAuthorModerator(item) || undefined,
      authorIsOwner: isAuthorOwner(item) || undefined,
      authorIsMember: isAuthorMember(item) || undefined,
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
    return {
      ...parseTextMessageBase(item),
      messageType: "membership",
      superchat: {
        amount: item.header_subtext?.toString() || "Member",
        color: "#0f9d58",
      },
    };
  }
  if (item.is(YTNodes.LiveChatSponsorshipsGiftPurchaseAnnouncement)) {
    return parseGiftPurchaseAnnouncement(item);
  }
  if (item.is(YTNodes.LiveChatSponsorshipsGiftRedemptionAnnouncement)) {
    return parseGiftRedemptionAnnouncement(item);
  }
  return null;
}

function parseBannerRedirect(banner: any, headerText?: string): ChatMessage | null {
  const contents = banner.contents;
  if (!contents?.is?.(YTNodes.LiveChatBannerRedirect)) return null;

  const parts: MessagePart[] = [];
  if (headerText) {
    parts.push({ type: "text", text: headerText });
  }
  if (contents.banner_message?.runs) {
    parts.push(...parseRuns(contents.banner_message.runs));
  } else if (contents.banner_message?.toString()) {
    parts.push({ type: "text", text: contents.banner_message.toString() });
  }

  const authorAvatar = Array.isArray(contents.author_photo)
    ? contents.author_photo[0]?.url
    : undefined;

  return {
    id: banner.action_id || `redirect-${Date.now()}`,
    author: "System",
    authorAvatar,
    parts,
    timestamp: new Date(),
    messageType: "redirect",
    superchat: {
      amount: contents.inline_action_button?.text || "Redirect",
      color: "#ff9800",
    },
  };
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

  // Check playability-error cooldown (video unavailable, private, etc.)
  const playability = playabilityErrors.get(videoId);
  if (playability && playability.until > Date.now()) {
    throw new Error(`PLAYABILITY: ${playability.message}`);
  }
  if (playability) playabilityErrors.delete(videoId);

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
  let info;
  try {
    info = await yt.getInfo(videoId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isPlayabilityError(msg)) {
      playabilityErrors.set(videoId, {
        message: msg,
        until: Date.now() + PLAYABILITY_ERROR_COOLDOWN_MS,
      });
    }
    throw err;
  }
  const chat = info.getLiveChat();
  const messages: ChatMessage[] = [];
  const seenIds = new Set<string>();
  /**
   * Sticky set of message ids that have been marked deleted by a moderator.
   * Survives the FIFO shift of the bounded `messages` buffer, so a deleted
   * message is never re-broadcast if InnerTube re-publishes it after the
   * buffer has cycled past it.
   */
  const deletedIds = new Map<string, string>();

  let resolveReady: () => void;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  const parse = (item: any): ChatMessage | null => parseChatItem(item);

  chat.on("start", (initialData: any) => {
    console.log(
      `[YouTube Chat] Live chat started for video ${videoId}, viewer: ${initialData?.viewer_name || "Guest"}`,
    );
    if (initialData?.actions) {
      for (const action of initialData.actions) {
        if (!action?.is) continue;
        if (action.is(YTNodes.AddChatItemAction)) {
          const item = action.as(YTNodes.AddChatItemAction)?.item;
          if (!item) continue;
          const msg = parse(item);
          if (!msg) continue;
          if (deletedIds.has(msg.id)) {
            broadcast(session!, "delete", {
              messageId: msg.id,
              deletedByText: deletedIds.get(msg.id),
            });
            continue;
          }
          const deletedByText = detectDeletedReplacementText(item);
          if (deletedByText) {
            deletedIds.set(msg.id, deletedByText);
            broadcast(session!, "delete", {
              messageId: msg.id,
              deletedByText,
            });
            continue;
          }
          if (!seenIds.has(msg.id)) {
            seenIds.add(msg.id);
            messages.push(msg);
            if (messages.length > 200) {
              const removed = messages.shift()!;
              seenIds.delete(removed.id);
            }
          }
          continue;
        }
        if (action.is(YTNodes.MarkChatItemAsDeletedAction)) {
          const targetId = action.target_item_id;
          if (!targetId) continue;
          const text = extractDeletedByText(action.deleted_state_message);
          deletedIds.set(targetId, text ?? "Message deleted by a moderator");
          broadcast(session!, "delete", {
            messageId: targetId,
            deletedByText: text,
          });
          continue;
        }
        if (action.is(YTNodes.ReplaceChatItemAction)) {
          const targetId = action.target_item_id;
          const replacement = action.replacement_item;
          if (!targetId || !replacement) continue;
          const text = detectDeletedReplacementText(replacement);
          if (text) {
            deletedIds.set(targetId, text);
            broadcast(session!, "delete", {
              messageId: targetId,
              deletedByText: text,
            });
          }
          continue;
        }
        if (action.is(YTNodes.AddBannerToLiveChatCommand)) {
          const banner = action.banner;
          if (!banner) continue;
          const headerText = banner.header?.text?.toString();
          const msg = parseBannerRedirect(banner, headerText);
          if (!msg) continue;
          if (!seenIds.has(msg.id)) {
            seenIds.add(msg.id);
            messages.push(msg);
            if (messages.length > 200) {
              const removed = messages.shift()!;
              seenIds.delete(removed.id);
            }
          }
          continue;
        }
      }
    }
    resolveReady();
  });

  chat.on("chat-update", (action: any) => {
    if (!action?.is) return;
    try {
      if (action.is(YTNodes.AddChatItemAction)) {
        const item = action.as(YTNodes.AddChatItemAction)?.item;
        if (!item) return;
        const msg = parse(item);
        if (!msg) return;
        if (deletedIds.has(msg.id)) {
          // Re-published after a delete. Don't re-broadcast; if any client
          // missed the original delete, send one now so they stay in sync.
          broadcast(session!, "delete", {
            messageId: msg.id,
            deletedByText: deletedIds.get(msg.id),
          });
          return;
        }
        // InnerTube sometimes delivers a deleted message as a fresh
        // LiveChatTextMessage whose `message` text is the "deleted by"
        // placeholder and whose `author` is the moderator. Detect that
        // shape and treat it as a delete event so the client tombstone
        // sticks.
        const deletedByText = detectDeletedReplacementText(item);
        if (deletedByText) {
          deletedIds.set(msg.id, deletedByText);
          const idx = messages.findIndex((m) => m.id === msg.id);
          if (idx !== -1) {
            messages[idx] = { ...messages[idx], isDeleted: true, deletedByText };
          }
          broadcast(session!, "delete", { messageId: msg.id, deletedByText });
          return;
        }
        if (!seenIds.has(msg.id)) {
          seenIds.add(msg.id);
          messages.push(msg);
          if (messages.length > 200) {
            const removed = messages.shift()!;
            seenIds.delete(removed.id);
            // The shifted message is still in deletedIds if it was
            // marked deleted — leave the sticky entry in place.
          }
          broadcast(session!, "message", msg, msg.id);
        }
        return;
      }
      if (action.is(YTNodes.RemoveChatItemAction)) {
        const targetId = action.target_item_id;
        if (targetId) {
          const idx = messages.findIndex((m) => m.id === targetId);
          if (idx !== -1) messages.splice(idx, 1);
          seenIds.delete(targetId);
          deletedIds.delete(targetId);
          broadcast(session!, "delete", { messageId: targetId });
        }
        return;
      }
      if (action.is(YTNodes.MarkChatItemAsDeletedAction)) {
        const targetId = action.target_item_id;
        if (!targetId) return;
        const text = extractDeletedByText(action.deleted_state_message);
        deletedIds.set(targetId, text ?? "Message deleted by a moderator");
        const idx = messages.findIndex((m) => m.id === targetId);
        if (idx !== -1) {
          messages[idx] = {
            ...messages[idx],
            isDeleted: true,
            deletedByText: text,
          };
        }
        broadcast(session!, "delete", {
          messageId: targetId,
          deletedByText: text,
        });
        return;
      }
      if (action.is(YTNodes.MarkChatItemsByAuthorAsDeletedAction)) {
        const ids = Array.isArray(action.target_item_ids)
          ? action.target_item_ids
          : [];
        const text = extractDeletedByText(action.deleted_state_message);
        const deletedByText = text ?? "Message deleted by a moderator";
        for (const id of ids) {
          deletedIds.set(id, deletedByText);
          const idx = messages.findIndex((m) => m.id === id);
          if (idx !== -1) {
            messages[idx] = { ...messages[idx], isDeleted: true, deletedByText };
          }
          broadcast(session!, "delete", { messageId: id, deletedByText });
        }
        return;
      }
      if (action.is(YTNodes.ReplaceChatItemAction)) {
        const targetId = action.target_item_id;
        const replacement = action.replacement_item;
        if (!targetId || !replacement) return;
        const text = detectDeletedReplacementText(replacement);
        if (text) {
          deletedIds.set(targetId, text);
          const idx = messages.findIndex((m) => m.id === targetId);
          if (idx !== -1) {
            messages[idx] = { ...messages[idx], isDeleted: true, deletedByText: text };
          }
          broadcast(session!, "delete", { messageId: targetId, deletedByText: text });
        }
        return;
      }
      if (action.is(YTNodes.AddBannerToLiveChatCommand)) {
        const banner = action.banner;
        if (!banner) return;
        const headerText = banner.header?.text?.toString();
        const msg = parseBannerRedirect(banner, headerText);
        if (!msg) return;
        if (!seenIds.has(msg.id)) {
          seenIds.add(msg.id);
          messages.push(msg);
          if (messages.length > 200) {
            const removed = messages.shift()!;
            seenIds.delete(removed.id);
          }
          broadcast(session!, "message", msg, msg.id);
        }
        return;
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
        "— cleaning up session ( Innertube left intact for other videos )",
      );
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

  session = {
    chat,
    messages,
    seenIds,
    clients: new Map(),
    lastUpdate: Date.now(),
    destroyTimer: null,
    ready,
  };
  activeLiveChats.set(videoId, session);
  return session;
}

// SSE endpoint
export const GET: APIRoute = async ({ request, url }) => {
  const clientAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
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
    const rawMsg = err instanceof Error ? err.message : String(err);
    if (rawMsg === "BLOCKED") {
      return new Response(
        JSON.stringify({
          error: "Live chat temporarily unavailable due to repeated failures",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }
    if (rawMsg.startsWith("PLAYABILITY: ")) {
      const innerMsg = rawMsg.slice("PLAYABILITY: ".length);
      return new Response(
        JSON.stringify({
          error: `Live chat is not available for this video (${innerMsg})`,
          videoId,
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }
    if (rawMsg.includes("status code 403") || rawMsg.includes("403")) {
      return new Response(
        JSON.stringify({
          error:
            "Live chat temporarily unavailable due to YouTube blocking (403)",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }
    if (isPlayabilityError(rawMsg)) {
      // Fallback for the rare case where isPlayabilityError matches but we
      // didn't pre-cache the entry (e.g. someone added a new pattern).
      playabilityErrors.set(videoId, {
        message: rawMsg,
        until: Date.now() + PLAYABILITY_ERROR_COOLDOWN_MS,
      });
      return new Response(
        JSON.stringify({
          error: `Live chat is not available for this video (${rawMsg})`,
          videoId,
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }
    console.error("[YouTube Chat] Error setting up chat for", videoId, rawMsg);
    return new Response(
      JSON.stringify({ error: "Failed to connect to YouTube chat" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const clientId = `${videoId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const client: SSEClient = {
        id: clientId,
        controller,
        lastMessageId: null,
        connectedAt: Date.now(),
      };
      session.clients.set(clientId, client);
      session.lastUpdate = Date.now();

      // Cancel pending destroy if a new client arrived during grace period
      if (session.destroyTimer) {
        clearTimeout(session.destroyTimer);
        session.destroyTimer = null;
      }

      // Send initial batch after chat session is ready
      try {
        await Promise.race([
          session.ready,
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error("start timeout")), 10000),
          ),
        ]);
      } catch {
        // If start event never fires or times out, proceed with whatever messages we have
      }

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

      // Heartbeat every 15s to keep proxies/CDN from closing idle HTTP/2 streams
      heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(
            sseEvent(JSON.stringify({ ping: true }), "heartbeat"),
          );
        } catch {
          // Stream already closed
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
          }
        }
      }, 15000);

      console.log(
        `[YouTube Chat] SSE client connected: ${clientId} (${session.clients.size} total for ${videoId})`,
      );
    },
    cancel() {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      session.clients.delete(clientId);
      session.lastUpdate = Date.now();
      console.log(
        `[YouTube Chat] SSE client disconnected: ${clientId} (${session.clients.size} remaining for ${videoId})`,
      );

      if (session.clients.size === 0) {
        console.log(
          `[YouTube Chat] No clients left for ${videoId} — grace period ${SESSION_GRACE_PERIOD_MS / 1000}s`,
        );
        session.destroyTimer = setTimeout(() => {
          const s = activeLiveChats.get(videoId);
          if (s && s.clients.size === 0) {
            console.log(
              `[YouTube Chat] Grace period expired for ${videoId} — stopping chat session`,
            );
            try {
              s.chat?.stop();
            } catch {}
            activeLiveChats.delete(videoId);
          }
        }, SESSION_GRACE_PERIOD_MS);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
};

function parseGiftPurchaseAnnouncement(msg: any): ChatMessage {
  const giftCount = msg.gift_memberships?.count || msg.gift_count || 1;
  const amount =
    msg.purchase_amount?.toString() ||
    `${giftCount} gift${giftCount > 1 ? "s" : ""}`;
  const authorName =
    msg.header?.author_name?.toString() ||
    msg.author?.name?.toString() ||
    "Unknown";
  const authorChannelId = msg.author_external_channel_id || msg.author?.id;
  const authorAvatar = Array.isArray(msg.header?.author_photo)
    ? msg.header.author_photo[0]?.url
    : undefined;

  return {
    id: msg.id,
    author: authorName,
    authorChannelId,
    authorAvatar,
    badges: parseBadges(msg),
    parts: [],
    timestamp: parseTimestamp(msg),
    messageType: "gift-purchase",
    authorIsModerator: isAuthorModerator(msg) || undefined,
    authorIsOwner: isAuthorOwner(msg) || undefined,
    authorIsMember: isAuthorMember(msg) || undefined,
    superchat: {
      amount,
      color: "#9c27b0",
    },
    giftCount,
  };
}

function parseGiftRedemptionAnnouncement(msg: any): ChatMessage {
  const base = parseTextMessageBase(msg);
  const recipientName =
    msg.recipient?.name?.toString() || msg.header_subtext?.toString() || "";

  return {
    ...base,
    messageType: "gift-redemption",
    recipientName,
    superchat: {
      amount: "Gift received",
      color: "#4caf50",
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
        const name = emoji.shortcuts?.[0] || emoji.emoji_id || "emoji";
        const url = Array.isArray(emoji.image)
          ? emoji.image[0]?.url
          : undefined;
        const isCustom = !!emoji.is_custom;

        if (!isCustom) {
          if (emoji.emoji_id)
            parts.push({ type: "text", text: emoji.emoji_id });
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
  }

  const badges: Record<string, string> = {};
  if (msg.author?.badges) {
    for (const badge of msg.author.badges) {
      if (badge.thumbnails && badge.thumbnails[0]) {
        badges[badge.label || "badge"] = badge.thumbnails[0].url;
      }
    }
  }

  const rawTimestamp = parseInt(msg.timestamp || msg.timestamp_usec || "0");
  const asMillisecondsDirectly = new Date(rawTimestamp);
  const asUsToMs = new Date(rawTimestamp / 1000);
  const now = new Date();
  const msTimeDiff = Math.abs(now.getTime() - asMillisecondsDirectly.getTime());
  const usTimeDiff = Math.abs(now.getTime() - asUsToMs.getTime());
  const timestamp = msTimeDiff < usTimeDiff ? asMillisecondsDirectly : asUsToMs;

  return {
    id: msg.id,
    author: msg.author?.name?.toString() || "Unknown",
    authorChannelId: msg.author?.id,
    authorAvatar: Array.isArray(msg.author?.thumbnails)
      ? msg.author.thumbnails[0]?.url
      : undefined,
    badges,
    parts,
    timestamp,
    authorIsModerator: isAuthorModerator(msg) || undefined,
    authorIsOwner: isAuthorOwner(msg) || undefined,
    authorIsMember: isAuthorMember(msg) || undefined,
  };
}
