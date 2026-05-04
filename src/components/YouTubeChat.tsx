import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';
import { getColorFromName } from '../lib/chatColors';
import type { ChatFont } from '../lib/types';
import { FONT_FAMILY_MAP, MAX_DISPLAYED_MESSAGES } from '../lib/types';
import YTMessageParts from './YTMessageParts';
import { useScrollToBottomOnKeyboard } from '../hooks/useScrollToBottomOnKeyboard';


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
  superchat?: {
    amount: string;
    color: string;
    sticker?: {
      url: string;
      alt: string;
    };
  };
}

export default function YouTubeChat({ videoId, onMessages, optimisticMessages, fontSize = 14, chatFont = 'inter' as ChatFont, splitChatEnabled = false }: YouTubeChatProps) {
  /** Merge polled messages with any optimistic ones not yet confirmed by the server */
  const getTextContent = (m: ChatMessage) =>
    m.parts.map(p => p.text || p.emojiText || p.alt || '').join('');
  const containerRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const isConnectedRef = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMessageCountRef = useRef(0);
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

  // Keep messages fresh by polling our backend
  useEffect(() => {
    if (!videoId) return;

    let isMounted = true;
    const abortController = new AbortController();

    const fetchChatMessages = async () => {
      if (document.hidden) return;

      try {
        setError(null);

        const params = new URLSearchParams();
        params.append('videoId', videoId);

        const res = await fetch(`/api/youtube-stream-chat?${params.toString()}`, { signal: abortController.signal });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          if (res.status === 404) {
            setError(errorData.error || 'Live chat not available');
            return;
          }
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

          const uniqueMessagesMap = new Map();
          fetchedMessages.forEach(m => uniqueMessagesMap.set(m.id, m));
          const newMessages = Array.from(uniqueMessagesMap.values());

          const lastNewId = newMessages.length > 0 ? newMessages[newMessages.length - 1].id : null;
          const lastCurrentId = messages.length > 0 ? messages[messages.length - 1].id : null;

          if (newMessages.length !== messages.length || lastNewId !== lastCurrentId) {
            const limited = newMessages.length > MAX_DISPLAYED_MESSAGES
              ? newMessages.slice(-MAX_DISPLAYED_MESSAGES)
              : newMessages;
            setMessages(limited);
            lastMessageCountRef.current = limited.length;
          }

          if (!isConnectedRef.current) {
            isConnectedRef.current = true;
            setIsConnected(true);
            setIsLoading(false);
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (isMounted) {
          console.error('Error fetching YouTube chat:', err);
          setError(err instanceof Error ? err.message : 'Failed to fetch messages');
          setIsLoading(false);
        }
      }
    };

    fetchChatMessages();
    pollingIntervalRef.current = setInterval(fetchChatMessages, 8000);

    return () => {
      isMounted = false;
      isConnectedRef.current = false;
      abortController.abort();
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
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
            Connecting to YouTube chat...
          </div>
        )}
        {isConnected && mergedMessages.length === 0 && (
          <div className="yt-chat-placeholder">
            Waiting for messages...
          </div>
        )}
        {(() => {
          return mergedMessages.map((msg, index) => {
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
