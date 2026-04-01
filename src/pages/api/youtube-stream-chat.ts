import type { APIRoute } from 'astro';
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

interface YTEmoteEntry {
  name: string;
  url: string;
  isCustomEmoji: boolean;
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
    emoteMap: Map<string, YTEmoteEntry>;
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
      const emoteMap = new Map<string, YTEmoteEntry>();

      chat.on('chat-update', (action: any) => {
        console.log(`[YouTube Chat] Received chat-update action:`, action.type);
        if (action.type === 'AddChatItemAction') {
          const item = action.item;

          if (!item) return;

          let chatMsg: ChatMessage | null = null;

          if (item.type === 'LiveChatMessage' || item.type === 'LiveChatTextMessage') {
            chatMsg = parseLiveChatMessage(item, emoteMap);
          } else if (item.type === 'LiveChatPaidMessageItem') {
            chatMsg = parsePaidMessage(item, emoteMap);
          } else if (item.type === 'LiveChatPaidStickerItem') {
            chatMsg = parsePaidSticker(item, emoteMap);
          }

          if (chatMsg) {
            // Deduplicate
            if (!messages.some(m => m.id === chatMsg!.id)) {
              messages.push(chatMsg);
              if (messages.length > 200) messages.shift();
            }
          }
        }
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
      await chat.start();
      console.log(`[YouTube Chat] Live chat started successfully`);

      // Try to retrieve previous messages from the chat buffer
      try {
        const chatData = (chat as any);
        
        // Method 1: Check if there are any buffered messages in the chat object
        if (chatData.message_queue && Array.isArray(chatData.message_queue)) {
          console.log(`[YouTube Chat] Found ${chatData.message_queue.length} buffered messages`);
          for (const msg of chatData.message_queue) {
            if (msg.type === 'AddChatItemAction' && msg.item) {
              let chatMsg: ChatMessage | null = null;
              const item = msg.item;
              
              if (item.type === 'LiveChatMessage' || item.type === 'LiveChatTextMessage') {
                chatMsg = parseLiveChatMessage(item, emoteMap);
              } else if (item.type === 'LiveChatPaidMessageItem') {
                chatMsg = parsePaidMessage(item, emoteMap);
              } else if (item.type === 'LiveChatPaidStickerItem') {
                chatMsg = parsePaidSticker(item, emoteMap);
              }
              
              if (chatMsg && !messages.some(m => m.id === chatMsg!.id)) {
                messages.push(chatMsg);
              }
            }
          }
        }
        
        // Method 2: Check for previous messages action
        if (chatData.previous_messages && Array.isArray(chatData.previous_messages)) {
          console.log(`[YouTube Chat] Found ${chatData.previous_messages.length} previous messages`);
          for (const msg of chatData.previous_messages) {
            let chatMsg: ChatMessage | null = null;
            
            if (msg.type === 'LiveChatMessage' || msg.type === 'LiveChatTextMessage') {
              chatMsg = parseLiveChatMessage(msg, emoteMap);
            } else if (msg.type === 'LiveChatPaidMessageItem') {
              chatMsg = parsePaidMessage(msg, emoteMap);
            } else if (msg.type === 'LiveChatPaidStickerItem') {
              chatMsg = parsePaidSticker(msg, emoteMap);
            }
            
            if (chatMsg && !messages.some(m => m.id === chatMsg!.id)) {
              messages.push(chatMsg);
            }
          }
        }
      } catch (err) {
        console.warn('[YouTube Chat] Could not retrieve previous messages:', err);
      }

      // Populate emote map with initial channel emojis
      const initialEmojis = (chat as any).initial_stats?.emojis;
      if (Array.isArray(initialEmojis)) {
        for (const emoji of initialEmojis) {
          const name = emoji.shortcuts?.[0] || emoji.emoji_id || 'emoji';
          const url = emoji.image?.thumbnails?.[0]?.url;
          if (name && url && !emoteMap.has(name)) {
            emoteMap.set(name, {
              name,
              url,
              isCustomEmoji: !!emoji.is_custom_emoji
            });
          }
        }
      }

      chatSession = {
        chat,
        messages,
        emoteMap,
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
        emotes: Array.from(chatSession.emoteMap.values()),
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

function parseLiveChatMessage(msg: any, emoteMap: Map<string, YTEmoteEntry>): ChatMessage {
  const parts: MessagePart[] = [];

  if (msg.message && msg.message.runs) {
    for (const run of msg.message.runs) {
      if (run.emoji) {
        const emoji = run.emoji;
        const name = emoji.shortcuts?.[0] || emoji.emoji_id || 'emoji';
        // Try multiple possible thumbnail paths (YouTube.js may vary)
        const url = emoji.image?.thumbnails?.[0]?.url
          || (Array.isArray(emoji.image) ? emoji.image[0]?.url : undefined);

        const isCustom = !!emoji.is_custom_emoji;

        if (!url) {
          // For standard unicode emojis, emoji_id IS the unicode character use it as text
          if (!isCustom && emoji.emoji_id) {
            parts.push({ type: 'text', text: emoji.emoji_id });
          }
          continue;
        }

        if (!emoteMap.has(name)) {
          emoteMap.set(name, { name, url, isCustomEmoji: isCustom });
        }

        parts.push({
          type: 'emoji',
          url,
          alt: name,
          emojiText: name,
          isCustomEmoji: isCustom
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

function parsePaidMessage(msg: any, emoteMap: Map<string, YTEmoteEntry>): ChatMessage {
  const base = parseLiveChatMessage(msg, emoteMap);
  return {
    ...base,
    superchat: {
      amount: msg.purchase_amount,
      color: ARGBtoHex(msg.body_background_color),
    }
  };
}

function parsePaidSticker(msg: any, _emoteMap: Map<string, YTEmoteEntry>): ChatMessage {
  const stickerUrl = msg.sticker?.thumbnails?.[0]?.url;
  
  return {
    id: msg.id,
    author: msg.author.name.toString(),
    authorAvatar: msg.author.thumbnails?.[0]?.url,
    parts: [],
    timestamp: new Date(parseInt(msg.timestamp) / 1000),
    superchat: {
      amount: msg.purchase_amount,
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
