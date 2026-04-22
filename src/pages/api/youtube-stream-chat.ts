import type { APIRoute } from 'astro';
import { YTNodes } from 'youtubei.js';
import { getInnertube } from '../../lib/youtube';
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

// When YouTube responds with repeated 403s for a given video, avoid retrying
// continuously by marking the video as temporarily blocked for a short period.
const CHAT_FAILURE_COOLDOWN_MS = parseInt(process.env.YT_CHAT_COOLDOWN_MS || '600000', 10); // default 10 minutes
const blockedChatFailures = new Map<string, number>();

// Global map to store active LiveChat sessions
const activeLiveChats = new Map<
  string,
  {
    chat: any;
    messages: ChatMessage[];
    lastUpdate: number;
  }
>();

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
    let chatSession = activeLiveChats.get(videoId);

    if (!chatSession) {
      // If recent attempts for this video resulted in blocking 403s, avoid
      // retrying until the cooldown expires.
      const blockedUntil = blockedChatFailures.get(videoId);
      if (blockedUntil && blockedUntil > Date.now()) {
        return new Response(
          JSON.stringify({ error: 'Live chat temporarily unavailable due to repeated failures' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
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
        if (oldestKey) activeLiveChats.delete(oldestKey);
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
        // Parse initial chat actions provided in the start payload
        if (initialData?.actions) {
          for (const action of initialData.actions) {
            if (action.is(YTNodes.AddChatItemAction)) {
              const item = action.as(YTNodes.AddChatItemAction).item;
              if (!item) continue;
              const chatMsg = parseChatItem(item);
              if (chatMsg && !messages.some(m => m.id === chatMsg.id)) {
                messages.push(chatMsg);
                if (messages.length > 200) messages.shift();
              }
            }
          }
        }
      });

      chat.on('chat-update', (action: any) => {
        if (action.is(YTNodes.AddChatItemAction)) {
          const item = action.as(YTNodes.AddChatItemAction).item;
          if (!item) return;
          const chatMsg = parseChatItem(item);
          if (chatMsg && !messages.some(m => m.id === chatMsg.id)) {
            messages.push(chatMsg);
            if (messages.length > 200) messages.shift();
          }
        }

        if (action.is(YTNodes.RemoveChatItemAction)) {
          const targetId = action.target_item_id;
          const idx = messages.findIndex(m => m.id === targetId);
          if (idx !== -1) messages.splice(idx, 1);
        }
      });

      chat.on('end', () => {
        console.log(`[YouTube Chat] Live stream ended for video ${videoId}`);
        activeLiveChats.delete(videoId);
      });

      chat.on('error', (err: any) => {
        console.error('YouTube LiveChat error:', err);
        setTimeout(() => {
          if (activeLiveChats.get(videoId)?.chat === chat) {
            activeLiveChats.delete(videoId);
          }
        }, 30000);
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
        // If we see 403 responses (common when Google blocks scraping), mark
        // the video as temporarily blocked so we don't repeatedly hammer
        // YouTube and spam logs.
        if (msg && msg.includes('status code 403')) {
          blockedChatFailures.set(videoId, Date.now() + CHAT_FAILURE_COOLDOWN_MS);
          console.error('[YouTube Chat] Marking chat temporarily blocked for', videoId, 'due to 403');
          return new Response(
            JSON.stringify({ error: 'Live chat temporarily unavailable due to YouTube blocking (403)' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
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

//Converts YouTube's ARGB decimal color to Hex
function ARGBtoHex(argb: number): string {
  const hex = (argb & 0xFFFFFF).toString(16).padStart(6, '0');
  return `#${hex}`;
}
