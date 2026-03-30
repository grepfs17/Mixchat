import React, { useEffect, useRef, useState } from 'react';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';

interface YouTubeEmote {
  /** The emojiText code e.g. ":slightly_smiling_face:" or the alt text */
  name: string;
  url: string;
  isCustom: boolean;
}

interface YouTubeChatProps {
  videoId: string;
  /** Called whenever new emotes are discovered in the chat stream */
  onEmotesDiscovered?: (emotes: YouTubeEmote[]) => void;
  /** Called whenever the message list updates (for unified chat mode) */
  onMessages?: (messages: ChatMessage[]) => void;
  fontSize?: number;
}

export type { YouTubeEmote };

interface MessagePart {
  type: 'text' | 'emoji';
  text?: string;
  url?: string;
  alt?: string;
  emojiText?: string;
  isCustomEmoji?: boolean;
}

interface ChatMessage {
  id: string;
  author: string;
  authorAvatar?: string;
  badges?: Record<string, string>;
  parts: MessagePart[];
  timestamp: Date;
  authorChannelId?: string;
  superchat?: {
    amount: string;
    color: string;
    sticker?: {
      url: string;
      alt: string;
    };
  };
}

// Turns a username into a stable color so each author always looks the same
function getColorFromName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash = hash & hash;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 55%)`;
}

export default function YouTubeChat({ videoId, onEmotesDiscovered, onMessages, fontSize = 14 }: YouTubeChatProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMessageCountRef = useRef(0);
  // Remembers how many emotes we've already reported so we don't spam the parent
  const lastEmoteCountRef = useRef(0);

  // Keep messages fresh by polling our backend every couple of seconds
  useEffect(() => {
    if (!videoId) return;

    let isMounted = true;

    const fetchChatMessages = async () => {
      try {
        setError(null);

        const params = new URLSearchParams();
        params.append('videoId', videoId);

        const res = await fetch(`/api/youtube-stream-chat?${params.toString()}`);

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          console.error('Chat API error:', errorData);
          throw new Error(errorData.error || `HTTP ${res.status}`);
        }

        const data = await res.json();

        if (!isMounted) return;

        console.log(`[YouTubeChat] Received response: ${data.messageCount} messages, ${(data.emotes || []).length} emotes`);

        if (data.success && data.messages) {
          const fetchedMessages = (data.messages as any[]).map((msg: any) => ({
            id: msg.id,
            author: msg.author,
            authorAvatar: msg.authorAvatar,
            badges: msg.badges,
            parts: (msg.parts || []) as MessagePart[],
            timestamp: new Date(msg.timestamp),
            authorChannelId: msg.authorChannelId,
            superchat: msg.superchat,
          }));

          // Deduplicate just in case the API sends anything twice
          const uniqueMessagesMap = new Map();
          fetchedMessages.forEach(m => uniqueMessagesMap.set(m.id, m));
          const newMessages = Array.from(uniqueMessagesMap.values());

          // Let the parent know about any newly spotted emotes (for autocomplete)
          const currentEmoteCount = Array.isArray(data.emotes) ? data.emotes.length : 0;
          if (onEmotesDiscovered && currentEmoteCount !== lastEmoteCountRef.current) {
            lastEmoteCountRef.current = currentEmoteCount;
            onEmotesDiscovered(
              (data.emotes as any[]).map((e) => ({
                name: e.name,
                url: e.url,
                isCustom: !!e.isCustomEmoji,
              }))
            );
          }

          // Compare the last message ID (not just count) to catch the edge case where
          // one message rolls off while another comes in, keeping the count identical.
          const lastNewId = newMessages.length > 0 ? newMessages[newMessages.length - 1].id : null;
          const lastCurrentId = messages.length > 0 ? messages[messages.length - 1].id : null;

          if (newMessages.length !== messages.length || lastNewId !== lastCurrentId) {
            setMessages(newMessages);
            lastMessageCountRef.current = newMessages.length;

            // Set as connected once we get the first successful response
            if (!isConnected) {
              setIsConnected(true);
              setIsLoading(false);
            }
          } else if (!isConnected) {
            // Even an empty response counts as a successful connection
            setIsConnected(true);
            setIsLoading(false);
          }
        }
      } catch (err) {
        if (isMounted) {
          console.error('Error fetching YouTube chat:', err);
          setError(err instanceof Error ? err.message : 'Failed to fetch messages');
          setIsLoading(false);
        }
      }
    };

    // Kick off the first fetch right away, then repeat every 2 s
    fetchChatMessages();
    pollingIntervalRef.current = setInterval(fetchChatMessages, 2000);

    return () => {
      isMounted = false;
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [videoId, isConnected]);

  // Keep the view pinned to the newest message
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Pass the current message list up so the parent can use it in unified chat
  useEffect(() => {
    if (onMessages) {
      onMessages(messages);
    }
  }, [messages, onMessages]);

  if (isLoading) {
    return (
      <div className="yt-chat-status">
        <AiOutlineLoading3Quarters className="animate-spin" /> Connecting to YouTube chat...
      </div>
    );
  }

  if (error) {
    return (
      <div className="yt-chat-status yt-chat-error">
        <div>⚠️ {error}</div>
        <div className="yt-chat-error-sub">You can still send messages below</div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="yt-chat-outer">
      <div
        ref={messagesContainerRef}
        className="yt-chat-container"
        style={{ '--chat-font-size': `${fontSize}px` } as React.CSSProperties}
      >
        {!isConnected && (
          <div className="yt-chat-placeholder">
            Connecting to YouTube chat...
          </div>
        )}
        {isConnected && messages.length === 0 && (
          <div className="yt-chat-placeholder">
            Waiting for messages...
          </div>
        )}
        {messages.map((msg) => {
          if (msg.superchat) {
            return (
              <div key={msg.id} className="yt-superchat" style={{ backgroundColor: msg.superchat.color }}>
                <div className="yt-superchat-header">
                  {msg.authorAvatar && (
                    <img src={msg.authorAvatar} alt={msg.author} className="avatar" />
                  )}
                  <div className="yt-superchat-info">
                    <div className="yt-superchat-author">{msg.author}</div>
                    <div className="yt-superchat-amount">{msg.superchat.amount}</div>
                  </div>
                </div>
                {(msg.parts.length > 0 || msg.superchat.sticker) && (
                  <div className="yt-superchat-body">
                    {msg.parts.map((part, i) =>
                      part.type === 'emoji' ? (
                        <img
                          key={i}
                          src={part.url}
                          alt={part.alt || part.emojiText || '🙂'}
                          title={part.emojiText || part.alt}
                          className={`yt-emoji ${part.isCustomEmoji ? 'custom' : 'standard'}`}
                        />
                      ) : (
                        <React.Fragment key={i}>{part.text}</React.Fragment>
                      )
                    )}
                    {msg.superchat.sticker && (
                      <img
                        src={msg.superchat.sticker.url}
                        alt={msg.superchat.sticker.alt}
                        className="yt-superchat-sticker"
                      />
                    )}
                  </div>
                )}
              </div>
            );
          }

          return (
            <div key={msg.id} className="message">
              <div className="message-single-line">
                <span className="timestamp">
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                {msg.authorAvatar && (
                  <img src={msg.authorAvatar} alt={msg.author} className="avatar" />
                )}
                {msg.badges && Object.keys(msg.badges).length > 0 && (
                  <div className="yt-message-badges">
                    {Object.entries(msg.badges).map(([name, url]) => (
                      <img
                        key={name}
                        src={url}
                        alt={name}
                        className="badge yt-badge"
                        title={name}
                      />
                    ))}
                  </div>
                )}
                <span className="author" style={{ color: getColorFromName(msg.author) }}>
                  {msg.author}
                </span>
                <span className="message-separator">:</span>
                <span className="message-text">
                  {msg.parts.map((part, i) =>
                    part.type === 'emoji' ? (
                      <img
                        key={i}
                        src={part.url}
                        alt={part.alt || part.emojiText || '🙂'}
                        title={part.emojiText || part.alt}
                        className={`yt-emoji ${part.isCustomEmoji ? 'custom' : 'standard'}`}
                      />
                    ) : (
                      <React.Fragment key={i}>{part.text}</React.Fragment>
                    )
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
