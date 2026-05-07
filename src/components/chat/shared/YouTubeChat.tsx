import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';
import { getColorFromName } from '../../../lib/chatColors';
import type { ChatFont } from '../../../lib/types';
import { FONT_FAMILY_MAP, MAX_DISPLAYED_MESSAGES } from '../../../lib/types';
import YTMessageParts from '../../YTMessageParts';
import { useScrollToBottomOnKeyboard } from '../../../hooks/useScrollToBottomOnKeyboard';

interface YouTubeChatProps {
  videoId: string;
  /** Called whenever the message list updates (for unified chat mode) */
  onMessages?: (messages: ChatMessage[]) => void;
  /** Optimistic messages injected by the parent (shown immediately after send) */
  optimisticMessages?: ChatMessage[];
  fontSize?: number;
  chatFont?: ChatFont;
  splitChatEnabled?: boolean;
}

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
  optimistic?: boolean;
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

interface SSEMessageEvent {
  messages: ChatMessage[];
  count: number;
}

interface SSEDeleteEvent {
  messageId: string;
}

interface SSEErrorEvent {
  error: string;
}

interface SSEEndEvent {
  reason: string;
}

export default function YouTubeChat({ videoId, onMessages, optimisticMessages, fontSize = 14, chatFont = 'inter' as ChatFont, splitChatEnabled = false }: YouTubeChatProps) {
  const getTextContent = (m: ChatMessage) =>
    m.parts.map(p => p.text || p.emojiText || p.alt || '').join('');

  const containerRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<string | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const eventSourceRef = useRef<EventSource | null>(null);

  const mergedMessages = useMemo(() => {
    if (!optimisticMessages?.length) return messages;
    const norm = (s: string) => s.normalize('NFKC').trim().toLowerCase();

    const realKeys = new Set(
      messages.map((m) => {
        const textKey = norm(getTextContent(m));
        return m.authorChannelId ? `${m.authorChannelId}|${textKey}` : `${norm(m.author)}|${textKey}`;
      })
    );

    const unmatched = optimisticMessages.filter((opt) => {
      const textKey = norm(getTextContent(opt));
      const key = opt.authorChannelId ? `${opt.authorChannelId}|${textKey}` : `${norm(opt.author)}|${textKey}`;
      return !realKeys.has(key);
    });

    return unmatched.length ? [...messages, ...unmatched] : messages;
  }, [messages, optimisticMessages]);

  // Connect to SSE stream
  useEffect(() => {
    if (!videoId) return;

    let isMounted = true;
    retryCountRef.current = 0;
    errorRef.current = null;
    setIsLoading(true);
    setIsConnected(false);
    setError(null);
    setMessages([]);

    const connect = () => {
      if (!isMounted) return;

      // Close existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      const es = new EventSource(`/api/youtube-stream-chat?videoId=${encodeURIComponent(videoId)}`);
      eventSourceRef.current = es;

      es.addEventListener('connected', (e: Event) => {
        if (!isMounted) return;
        const data = JSON.parse((e as MessageEvent).data) as SSEMessageEvent;
        const fetchedMessages = (data.messages || []).map((msg: any) => ({
          id: msg.id,
          author: msg.author,
          authorAvatar: msg.authorAvatar,
          badges: msg.badges,
          parts: (msg.parts || []) as MessagePart[],
          timestamp: new Date(msg.timestamp),
          authorChannelId: msg.authorChannelId,
          superchat: msg.superchat,
        }));

        const uniqueMap = new Map();
        fetchedMessages.forEach(m => uniqueMap.set(m.id, m));
        const unique = Array.from(uniqueMap.values());
        const limited = unique.length > MAX_DISPLAYED_MESSAGES
          ? unique.slice(-MAX_DISPLAYED_MESSAGES)
          : unique;

        setMessages(limited);
        setIsConnected(true);
        setIsLoading(false);
        setError(null);
        errorRef.current = null;
        retryCountRef.current = 0;
      });

      es.addEventListener('message', (e: Event) => {
        if (!isMounted) return;
        const msg = JSON.parse((e as MessageEvent).data) as ChatMessage;
        const newMsg = {
          id: msg.id,
          author: msg.author,
          authorAvatar: msg.authorAvatar,
          badges: msg.badges,
          parts: msg.parts as MessagePart[],
          timestamp: new Date(msg.timestamp),
          authorChannelId: msg.authorChannelId,
          superchat: msg.superchat,
        };

        setMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          const next = [...prev, newMsg];
          return next.length > MAX_DISPLAYED_MESSAGES
            ? next.slice(-MAX_DISPLAYED_MESSAGES)
            : next;
        });
      });

      es.addEventListener('delete', (e: Event) => {
        if (!isMounted) return;
        const data = JSON.parse((e as MessageEvent).data) as SSEDeleteEvent;
        setMessages(prev => prev.filter(m => m.id !== data.messageId));
      });

      es.addEventListener('error', (e: Event) => {
        if (!isMounted) return;
        const data = JSON.parse((e as MessageEvent).data) as SSEErrorEvent;
        console.error('[YouTubeChat] SSE error event:', data.error);
        setIsConnected(false);
        setError(data.error);
        errorRef.current = data.error;
        es.close();
        eventSourceRef.current = null;
      });

      es.addEventListener('end', (e: Event) => {
        if (!isMounted) return;
        const data = JSON.parse((e as MessageEvent).data) as SSEEndEvent;
        console.log('[YouTubeChat] Stream ended:', data.reason);
        setIsConnected(false);
        setError('Live stream has ended');
        es.close();
        eventSourceRef.current = null;
      });

      es.onerror = () => {
        // Connection-level error (network drop, server restart)
        // EventSource auto-reconnects, but we track retries
        retryCountRef.current++;
        setIsConnected(false);

        if (retryCountRef.current > 20) {
          // After ~20 auto-reconnect failures (~100s), give up
          if (isMounted) {
            setError('Failed to connect to YouTube chat. Please refresh the page.');
            es.close();
            eventSourceRef.current = null;
          }
        }
      };
    };

    connect();

    return () => {
      isMounted = false;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [videoId]);

  // Keep the view pinned to the newest message
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [mergedMessages]);

  // Handle mobile keyboard - scroll to bottom when keyboard closes (viewport expands)
  useScrollToBottomOnKeyboard(messagesContainerRef);

  // Pass the current message list up so the parent can use it in unified chat
  useEffect(() => {
    if (onMessages) {
      onMessages(mergedMessages);
    }
  }, [mergedMessages, onMessages]);

  if (isLoading) {
    return (
      <div className="yt-chat-status">
        <AiOutlineLoading3Quarters className="animate-spin" />  Connecting to YouTube chat...
      </div>
    );
  }

  if (error) {
    return (
      <div className="yt-chat-status yt-chat-error">
        <div>⚠️ {error}</div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="yt-chat-outer">
      <div
        ref={messagesContainerRef}
        className={`yt-chat-container${splitChatEnabled ? ' split-chat' : ''}`}
        style={{ '--chat-font-size': `${fontSize}px`, '--chat-font-family': FONT_FAMILY_MAP[chatFont] } as React.CSSProperties}
      >
        {!isConnected && (
          <div className="yt-chat-placeholder">
            Reconnecting to YouTube chat...
          </div>
        )}
        {isConnected && mergedMessages.length === 0 && (
          <div className="yt-chat-placeholder">
            Waiting for messages...
          </div>
        )}
        {(() => {
          return mergedMessages.map((msg, index) => {
            if (msg.messageType === 'gift-purchase' && msg.superchat) {
              return (
                <div key={msg.id} className="yt-superchat yt-gift-purchase" style={{ backgroundColor: msg.superchat.color }}>
                  <div className="yt-superchat-header">
                    {msg.authorAvatar && (
                      <img src={msg.authorAvatar} alt={msg.author} className="avatar" />
                    )}
                    <div className="yt-superchat-info">
                      <div className="yt-superchat-author">{msg.author}</div>
                      <div className="yt-superchat-amount">
                        <span className="gift-icon">🎁</span>
                        Bought {msg.giftCount || 1} gift{msg.giftCount !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            if (msg.messageType === 'gift-redemption' && msg.superchat) {
              return (
                <div key={msg.id} className="yt-superchat yt-gift-redemption" style={{ backgroundColor: msg.superchat.color }}>
                  <div className="yt-superchat-header">
                    {msg.authorAvatar && (
                      <img src={msg.authorAvatar} alt={msg.author} className="avatar" />
                    )}
                    <div className="yt-superchat-info">
                      <div className="yt-superchat-author">{msg.author}</div>
                      <div className="yt-superchat-amount">
                        <span className="gift-icon">🎉</span>
                        Received a gift membership
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

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
                      <YTMessageParts parts={msg.parts} />
                      {msg.superchat.sticker && (
                        <img
                          src={msg.superchat.sticker.url}
                          alt={msg.superchat.sticker.alt}
                          className="yt-superchat-sticker"
                          loading="lazy"
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            }

            const parityClass = (index % 2 === 0) ? 'even' : 'odd';
            return (
              <div key={msg.id} className={`message${msg.optimistic ? ' yt-optimistic' : ''} ${parityClass}`}>
                <div className="message-single-line">
                  <span className="timestamp">
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  {msg.badges && Object.keys(msg.badges).length > 0 && (
                    <div className="yt-message-badges">
                      {Object.entries(msg.badges).map(([name, url]) => (
                        <img
                          key={name}
                          src={url}
                          alt={name}
                          className="badge yt-badge"
                          title={name}
                          loading="lazy"
                        />
                      ))}
                    </div>
                  )}
                  <span className="author" style={{ color: getColorFromName(msg.author) }}>
                    {msg.author}
                  </span>
                  <span className="message-separator">:</span>
                  <span className="message-text">
                    <YTMessageParts parts={msg.parts} />
                  </span>
                </div>
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}
