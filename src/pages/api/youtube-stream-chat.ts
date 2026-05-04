import type { APIRoute } from 'astro';
import { YTNodes } from 'youtubei.js';
import { getInnertube, invalidateInnertube } from '../../lib/youtube';
import { checkRateLimit } from '../../lib/rateLimit';

interface MessagePart {
  type: 'text' | 'emoji';
  text?: string;        // for text parts
  url?: string;         // for emoji/emote parts
  alt?: string;         // for emoji/emote parts
  emojiText?: string;   // shortcode like ":slightly_smiling_face:"
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
  superchat?: {
    amount: string;
    color: string;
    sticker?: {
      url: string;
      alt: string;
    };
  };
}

/** Maximum number of concurrent YouTube live chat sessions held in memory.
 * Prevents unbounded memory growth from malicious or accidental videoId flooding. */
const MAX_ACTIVE_SESSIONS = 50;

/** Maximum idle time (ms) before a session is reaped. Prevents stale sessions
 * from persisting when a stream never formally ends and no client polls it. */
const MAX_IDLE_MS = 10 * 60_000;

// Cooldown after a 403 block. Set lower than before because the proxy
// now handles retries — we just need a brief pause to avoid hammering.
const CHAT_FAILURE_COOLDOWN_MS = parseInt(process.env.YT_CHAT_COOLDOWN_MS || '60000', 10); // default 1 minute
const blockedChatFailures = new Map<string, number>();

setInterval(() => {
  const now = Date.now();
  for (const [key, expiresAt] of blockedChatFailures) {
    if (now > expiresAt) blockedChatFailures.delete(key);
  }
}, 120_000);

// Global map to store active LiveChat sessions
const activeLiveChats = new Map<
  string,
  {
    chat: any;
    messages: ChatMessage[];
    lastUpdate: number;
  }
>();

function shutdownActiveSessions() {
  for (const [key, session] of activeLiveChats) {
    try { session.chat?.stop(); } catch {}
  }
  console.log(`[YouTube Chat] Graceful shutdown — stopped ${activeLiveChats.size} sessions`);
  activeLiveChats.clear();
}
process.on('SIGTERM', shutdownActiveSessions);
process.on('SIGINT', shutdownActiveSessions);

export const GET: APIRoute = async ({ url, clientAddress }) => {
  if (!checkRateLimit(`${clientAddress}:youtube-stream-chat`, 60, 60_000)) {
    return new Response(
      JSON.stringify({ error: 'Too many requests' }),
      { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '60' } }
    );
  }

  const videoId = url.searchParams.get('videoId');

  if (!videoId) {
    return new Response(
      JSON.stringify({ error: 'videoId query parameter is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validate videoId: YouTube video IDs are exactly 11 URL-safe characters.
  if (!/^[\w-]{11}$/.test(videoId)) {
    return new Response(
      JSON.stringify({ error: 'Invalid videoId' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Reap idle sessions nobody has polled for a while.
    const nowMs = Date.now();
    for (const [key, session] of activeLiveChats) {
      if (nowMs - session.lastUpdate > MAX_IDLE_MS) {
        try { session.chat?.stop(); } catch {}
        activeLiveChats.delete(key);
        console.log('[YouTube Chat] Reaped idle session for', key);
      }
    }

    let chatSession = activeLiveChats.get(videoId);

    if (!chatSession) {
      // If recent attempts for this video resulted in blocking 403s, avoid
      // retrying until the cooldown expires.
      const blockedUntil = blockedChatFailures.get(videoId);
      if (blockedUntil) {
        if (blockedUntil > Date.now()) {
          return new Response(
            JSON.stringify({ error: 'Live chat temporarily unavailable due to repeated failures' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        }
        blockedChatFailures.delete(videoId);
      }

      try {
        // Evict the least-recently-used session when the cap is reached.
        if (activeLiveChats.size >= MAX_ACTIVE_SESSIONS) {
          let oldestKey = '';
          let oldestTime = Infinity;
          for (const [key, s] of activeLiveChats) {
            if (s.lastUpdate < oldestTime) {
              oldestTime = s.lastUpdate;
              oldestKey = key;
            }
          }
          if (oldestKey) {
            const old = activeLiveChats.get(oldestKey);
            try { old?.chat?.stop(); } catch {}
            activeLiveChats.delete(oldestKey);
          }
        }

        const yt = await getInnertube();
        const info = await yt.getInfo(videoId);

        const chat = info.getLiveChat();
        const messages: ChatMessage[] = [];

        // Helper: map an AddChatItemAction item to a ChatMessage
        const parseChatItem = (item: any): ChatMessage | null => {
          if (item.is(YTNodes.LiveChatTextMessage)) {
            return parseLiveChatMessage(item);
          }
          if (item.is(YTNodes.LiveChatPaidMessage)) {
            return parsePaidMessage(item);
          }
          if (item.is(YTNodes.LiveChatPaidSticker)) {
            return parsePaidSticker(item);
          }
          if (item.is(YTNodes.LiveChatMembershipItem)) {
            return parseMembershipItem(item);
          }
          return null;
        };

        chat.on('start', (initialData: any) => {
          console.log(`[YouTube Chat] Live chat started for video ${videoId}, viewer: ${initialData?.viewer_name || 'Guest'}`);
          if (initialData?.actions) {
            for (const action of initialData.actions) {
              if (!action || typeof action.is !== 'function') continue;
              try {
                if (action.is(YTNodes.AddChatItemAction)) {
                  const item = action.as(YTNodes.AddChatItemAction)?.item;
                  if (!item) continue;
                  const chatMsg = parseChatItem(item);
                  if (chatMsg && !messages.some(m => m.id === chatMsg.id)) {
                    messages.push(chatMsg);
                    if (messages.length > 200) messages.shift();
                  }
                }
              } catch (e) {
                console.warn('[YouTube Chat] Failed to parse initial action:', e instanceof Error ? e.message : String(e));
              }
            }
          }
        });

        chat.on('chat-update', (action: any) => {
          if (!action || typeof action.is !== 'function') return;

          try {
            if (action.is(YTNodes.AddChatItemAction)) {
              const item = action.as(YTNodes.AddChatItemAction)?.item;
              if (!item) return;
              const chatMsg = parseChatItem(item);
              if (chatMsg && !messages.some(m => m.id === chatMsg.id)) {
                messages.push(chatMsg);
                if (messages.length > 200) messages.shift();
              }
              return;
            }

            if (action.is(YTNodes.RemoveChatItemAction)) {
              const targetId = action.target_item_id;
              if (targetId) {
                const idx = messages.findIndex(m => m.id === targetId);
                if (idx !== -1) messages.splice(idx, 1);
              }
            }
          } catch (e) {
            console.warn('[YouTube Chat] Failed to parse chat-update action:', e instanceof Error ? e.message : String(e));
          }
        });

        chat.on('end', () => {
          console.log(`[YouTube Chat] Live stream ended for video ${videoId}`);
          try { chat.stop(); } catch {}
          activeLiveChats.delete(videoId);
        });

        chat.on('error', (err: any) => {
          console.error('YouTube LiveChat error:', err);
          const errMsg = err instanceof Error ? err.message : String(err);
          // On 403 ("automated queries"), apply the blocking cooldown immediately
          // so subsequent client polls don't keep hammering YouTube.
          if (errMsg && (errMsg.includes('status code 403') || errMsg.includes('403'))) {
            blockedChatFailures.set(videoId, Date.now() + CHAT_FAILURE_COOLDOWN_MS);
            console.error('[YouTube Chat] Marking chat blocked for', videoId, 'due to 403 from polling. Invalidating Innertube session.');
            invalidateInnertube();
            try { chat.stop(); } catch {}
            activeLiveChats.delete(videoId);
          } else {
            setTimeout(() => {
              if (activeLiveChats.get(videoId)?.chat === chat) {
                try { chat.stop(); } catch {}
                activeLiveChats.delete(videoId);
              }
            }, 30000);
          }
        });

        console.log(`[YouTube Chat] Starting live chat for video ${videoId}`);
        chat.start();

        chatSession = {
          chat,
          messages,
          lastUpdate: Date.now(),
        };

        activeLiveChats.set(videoId, chatSession);
      } catch (err: any) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[YouTube Chat] Error setting up chat for', videoId, msg);

        if (msg && msg.includes('status code 403')) {
          blockedChatFailures.set(videoId, Date.now() + CHAT_FAILURE_COOLDOWN_MS);
          invalidateInnertube();
          return new Response(
            JSON.stringify({ error: 'Live chat temporarily unavailable due to YouTube blocking (403)' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        }

        // "Live Chat is not available" means the video doesn't have live chat
        // (not live, or chat disabled). Don't block it — the client will retry.
        if (msg && msg.includes('not available')) {
          return new Response(
            JSON.stringify({ error: 'Live chat is not available for this video', videoId }),
            { status: 404, headers: { 'Content-Type': 'application/json' } }
          );
        }

        throw err;
      }
    }

    chatSession.lastUpdate = Date.now();

    if (chatSession.messages.length > 0) {
      console.log(`[YouTube Chat] Returning ${chatSession.messages.length} messages for video ${videoId}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        videoId,
        messages: chatSession.messages,
        messageCount: chatSession.messages.length,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    activeLiveChats.delete(videoId);
    return new Response(
      JSON.stringify({
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? errorStack : undefined,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

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
          if (emoji.emoji_id) {
            parts.push({ type: 'text', text: emoji.emoji_id });
          }
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
        parts.push({
          type: 'text',
          text: run.text || ''
        });
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
    timestamp
  };
}

function parsePaidMessage(msg: any): ChatMessage {
  const base = parseLiveChatMessage(msg);
  const amount = msg.purchase_amount?.toString() || 'Unknown';
  // Use header color as fallback if body color is missing
  const colorInt = msg.body_background_color || msg.header_background_color || msg.card_background_color || 0;

  return {
    ...base,
    superchat: {
      amount,
      color: ARGBtoHex(colorInt),
    }
  };
}

function parsePaidSticker(msg: any): ChatMessage {
  const base = parseLiveChatMessage(msg);
  const stickerUrl = msg.sticker?.thumbnails?.[0]?.url || msg.sticker?.image?.[0]?.url;
  const amount = msg.purchase_amount?.toString() || 'Unknown';
  const colorInt = msg.background_color || msg.money_chip_background_color || 0;

  return {
    ...base,
    parts: [],
    superchat: {
      amount,
      color: ARGBtoHex(colorInt),
      ...(stickerUrl && {
        sticker: {
          url: stickerUrl,
          alt: (msg.author?.name?.toString() || 'System') + ' sticker'
        }
      })
    }
  };
}

function parseMembershipItem(msg: any): ChatMessage {
  const base = parseLiveChatMessage(msg);
  // Membership items often have the amount in a different field or just a text
  const amount = msg.header_subtext?.toString() || 'Member';

  return {
    ...base,
    superchat: {
      amount,
      color: '#0f9d58', // YouTube Green for memberships
    }
  };
}

function ARGBtoHex(argb: number): string {
  const unsigned = argb >>> 0;
  const hex = (unsigned & 0xFFFFFF).toString(16).padStart(6, '0');
  return `#${hex}`;
}
