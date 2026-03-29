import type { APIRoute } from 'astro';
import { LiveChat } from 'youtube-chat';

// Handle YouTube chat via the youtube-chat library.
// We cache the chat connection in a global to avoid firing it up on every request.

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

// Global map to store active LiveChat instances and their message caches
const activeLiveChats = new Map<
  string,
  {
    chat: LiveChat;
    messages: ChatMessage[];
    /** Deduplicated emote registry: name → entry */
    emoteMap: Map<string, YTEmoteEntry>;
    lastUpdate: number;
  }
>();

export const GET: APIRoute = async ({ url }) => {
  const videoId = url.searchParams.get('videoId');

  if (!videoId) {
    return new Response(
      JSON.stringify({ error: 'videoId query parameter is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    let chatSession = activeLiveChats.get(videoId);

    // Create a new LiveChat session if one doesn't exist
    if (!chatSession) {
      // Use a lock-like mechanism to prevent duplicate sessions from concurrent requests
      const chat = new LiveChat({
        liveId: videoId,
      });

      const messages: ChatMessage[] = [];
      const emoteMap = new Map<string, YTEmoteEntry>();

      // Handle incoming messages
      chat.on('chat', (chatItem: any) => {
        // Use the library's message ID if available, otherwise generate a stable one
        // chatItem.id is the actual unique ID from YouTube if the library provides it.
        const messageId = chatItem.id || `${chatItem.author?.channelId || 'anon'}-${chatItem.timestamp?.getTime() || Date.now()}`;

        // Deduplicate messages by ID to prevent duplicates if the scraper re-emits them
        if (messages.some(m => m.id === messageId)) {
          return;
        }

        // Convert raw message parts into our typed MessagePart array.
        const parts: MessagePart[] = (chatItem.message || []).map((msg: any) => {
          if (msg.url) {
            const name = msg.emojiText || msg.alt || msg.url;
            if (!emoteMap.has(name)) {
              emoteMap.set(name, {
                name,
                url: msg.url,
                isCustomEmoji: !!msg.isCustomEmoji,
              });
            }
            return {
              type: 'emoji' as const,
              url: msg.url,
              alt: msg.alt || msg.emojiText || '',
              emojiText: msg.emojiText || '',
              isCustomEmoji: !!msg.isCustomEmoji,
            };
          }
          return { type: 'text' as const, text: msg.text ?? String(msg) };
        });

        const message: ChatMessage = {
          id: messageId,
          author: chatItem.author.name || 'Anonymous',
          authorAvatar: chatItem.author.thumbnail?.url,
          badges: chatItem.author.badge ? { [chatItem.author.badge.title]: chatItem.author.badge.thumbnail?.url } : undefined,
          parts,
          timestamp: chatItem.timestamp || new Date(),
          superchat: chatItem.superchat ? {
            amount: chatItem.superchat.amount,
            color: chatItem.superchat.color,
            sticker: chatItem.superchat.sticker ? {
              url: chatItem.superchat.sticker.url,
              alt: chatItem.superchat.sticker.alt,
            } : undefined,
          } : undefined,
        };

        messages.push(message);
        // Keep only last 200 messages
        if (messages.length > 200) {
          messages.shift();
        }
      });

      // Handle errors
      chat.on('error', (err: any) => {
        console.error('YouTube LiveChat error:', err);
        // Clean up failed session after 30 seconds
        setTimeout(() => {
          if (activeLiveChats.get(videoId)?.chat === chat) {
            activeLiveChats.delete(videoId);
          }
        }, 30000);
      });

      // Handle stream end
      chat.on('end', () => {
        console.log('YouTube stream ended for videoId:', videoId);
        if (activeLiveChats.get(videoId)?.chat === chat) {
          activeLiveChats.delete(videoId);
        }
      });

      // Start the chat connection
      const ok = await chat.start();
      if (!ok) {
        return new Response(
          JSON.stringify({ error: 'Failed to connect to YouTube chat' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      chatSession = {
        chat,
        messages,
        emoteMap,
        lastUpdate: Date.now(),
      };

      // Check if another request beat us to it while we were waiting for chat.start()
      const existing = activeLiveChats.get(videoId);
      if (existing) {
        // If an existing session exists, stop this one to avoid double scraping
        chat.stop();
        chatSession = existing;
      } else {
        activeLiveChats.set(videoId, chatSession);
        console.log(`Created LiveChat session for videoId: ${videoId}`);
      }

      // Try to get channel emotes in the background so autocomplete is snappy.
      // This pulls from the initial data scrape so users don't have to wait for them to appear in chat.
      (async () => {
        try {
          // Build an absolute URL from the current request's origin
          const origin = url.origin;
          const emoteRes = await fetch(
            `${origin}/api/youtube-emotes?videoId=${encodeURIComponent(videoId)}`
          );
          if (emoteRes.ok) {
            const emoteData = await emoteRes.json();
            if (Array.isArray(emoteData.emotes)) {
              const session = activeLiveChats.get(videoId);
              if (session) {
                for (const e of emoteData.emotes) {
                  if (e.name && e.url && !session.emoteMap.has(e.name)) {
                    session.emoteMap.set(e.name, {
                      name: e.name,
                      url: e.url,
                      isCustomEmoji: true,
                    });
                  }
                }
                console.log(
                  `Pre-loaded ${emoteData.emotes.length} channel emotes for videoId: ${videoId}`
                );
              }
            }
          }
        } catch (err) {
          // Non-fatal — emotes will still accumulate from chat messages
          console.warn('Failed to pre-load YouTube emotes:', err);
        }
      })();

    }

    // Update last access time
    chatSession.lastUpdate = Date.now();

    return new Response(
      JSON.stringify({
        success: true,
        videoId,
        messages: chatSession.messages,
        messageCount: chatSession.messages.length,
        // All unique emotes/emoji seen so far across all messages
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
    console.error('YouTube stream chat API error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
