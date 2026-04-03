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

// Global map to store active LiveChat sessions
const activeLiveChats = new Map<
  string,
  {
    chat: any;
    messages: ChatMessage[];
    /** Per-author avatar URL cache YouTube InnerTube omits thumbnails
     *  intermittently, so we remember the last seen URL and reuse it. */
    authorAvatars: Map<string, string>;
    lastUpdate: number;
  }
>();

export const GET: APIRoute = async ({ url, cookies, clientAddress }) => {
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

  // Require authentication — prevents unauthenticated callers from creating
  // server-side chat sessions and consuming server memory.
  const accessToken = cookies.get('youtube_token')?.value;
  if (!accessToken) {
    return new Response(
      JSON.stringify({ error: 'Not authenticated' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    let chatSession = activeLiveChats.get(videoId);

    if (!chatSession) {
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
      /** Persists the last-seen avatar URL per author name so it can be
       *  reapplied when InnerTube omits thumbnails on subsequent messages. */
      const authorAvatars = new Map<string, string>();

      /**
       * Fills in a missing authorAvatar from the cache, or stores a newly
       * seen URL and back-fills any already-buffered messages from that author.
       */
      const enrichAvatar = (msg: ChatMessage): ChatMessage => {
        if (msg.authorAvatar) {
          // New avatar seen — cache it and back-fill older buffered messages
          if (!authorAvatars.has(msg.author) || authorAvatars.get(msg.author) !== msg.authorAvatar) {
            authorAvatars.set(msg.author, msg.authorAvatar);
            for (const m of messages) {
              if (m.author === msg.author && !m.authorAvatar) {
                m.authorAvatar = msg.authorAvatar;
              }
            }
          }
          return msg;
        }
        const cached = authorAvatars.get(msg.author);
        return cached ? { ...msg, authorAvatar: cached } : msg;
      };

      // Helper: map an AddChatItemAction item to a ChatMessage
      const parseChatItem = (item: any): ChatMessage | null => {
        switch (item.type) {
          case 'LiveChatTextMessage':
            return parseLiveChatMessage(item);
          case 'LiveChatPaidMessage':
            return parsePaidMessage(item);
          case 'LiveChatPaidSticker':
            return parsePaidSticker(item);
          default:
            return null;
        }
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
                messages.push(enrichAvatar(chatMsg));
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
            messages.push(enrichAvatar(chatMsg));
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
        authorAvatars,
        lastUpdate: Date.now(),
      };

      activeLiveChats.set(videoId, chatSession);
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

  if (msg.message && msg.message.runs) {
    for (const run of msg.message.runs) {
      if (run.emoji) {
        const emoji = run.emoji;
        // shortcuts[0] is the shortcode e.g. ":cat-orange-whistling:"
        // emoji_id is the unicode character for standard emojis
        const name = emoji.shortcuts?.[0] || emoji.emoji_id || 'emoji';
        // image is Thumbnail[] directly in YouTube.js — no nested .thumbnails
        const url = Array.isArray(emoji.image) ? emoji.image[0]?.url : undefined;
        const isCustom = !!emoji.is_custom;

        // Standard (non-custom) emojis: always render as the raw Unicode character
        if (!isCustom) {
          if (emoji.emoji_id) {
            parts.push({ type: 'text', text: emoji.emoji_id });
          }
          continue;
        }

        // Custom channel emote, needs the image URL
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
  if (msg.author.badges) {
    for (const badge of msg.author.badges) {
      if (badge.thumbnails && badge.thumbnails[0]) {
        badges[badge.label || 'badge'] = badge.thumbnails[0].url;
      }
    }
  }

  // YouTube timestamps might already be in millisecond
  const rawTimestamp = parseInt(msg.timestamp);
  const asMillisecondsDirectly = new Date(rawTimestamp);
  const asUsToMs = new Date(rawTimestamp / 1000);
  
  // Use the one that seems more reasonable (closer to now)
  const now = new Date();
  const msTimeDiff = Math.abs(now.getTime() - asMillisecondsDirectly.getTime());
  const usTimeDiff = Math.abs(now.getTime() - asUsToMs.getTime());
  const timestamp = msTimeDiff < usTimeDiff ? asMillisecondsDirectly : asUsToMs;

  return {
    id: msg.id,
    author: msg.author.name.toString(),
    authorAvatar: msg.author.thumbnails?.[0]?.url,
    badges,
    parts,
    timestamp
  };
}

function parsePaidMessage(msg: any): ChatMessage {
  const base = parseLiveChatMessage(msg);
  return {
    ...base,
    superchat: {
      amount: String(msg.purchase_amount),
      color: ARGBtoHex(msg.body_background_color),
    }
  };
}

function parsePaidSticker(msg: any): ChatMessage {
  const stickerUrl = msg.sticker?.thumbnails?.[0]?.url;
  
  return {
    id: msg.id,
    author: msg.author.name.toString(),
    authorAvatar: msg.author.thumbnails?.[0]?.url,
    parts: [],
    timestamp: new Date(parseInt(msg.timestamp) / 1000),
    superchat: {
      amount: String(msg.purchase_amount),
      color: ARGBtoHex(msg.background_color),
      ...(stickerUrl && {
        sticker: {
          url: stickerUrl,
          alt: msg.author.name.toString() + ' sticker'
        }
      })
    }
  };
}

//Converts YouTube's ARGB decimal color to Hex
function ARGBtoHex(argb: number): string {
  const hex = (argb & 0xFFFFFF).toString(16).padStart(6, '0');
  return `#${hex}`;
}
