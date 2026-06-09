import React, { useEffect, useMemo, useRef, useState } from "react";
import { AiOutlineLoading3Quarters } from "react-icons/ai";
import type { ChatFont } from "../../../lib/types";
import { FONT_FAMILY_MAP, MAX_DISPLAYED_MESSAGES } from "../../../lib/types";
import { useScrollToBottomOnKeyboard } from "../../../hooks/chat/useScrollToBottomOnKeyboard";
import { saveMessage } from "../../../lib/chatHistoryStorage";
import { YouTubeMessageContent } from "./YouTubeMessageContent";

interface YouTubeChatProps {
  videoId: string;
  channel?: string;
  /** Called whenever the message list updates (for unified chat mode) */
  onMessages?: (messages: ChatMessage[]) => void;
  /** Optimistic messages injected by the parent (shown immediately after send) */
  optimisticMessages?: ChatMessage[];
  fontSize?: number;
  chatFont?: ChatFont;
  splitChatEnabled?: boolean;
  /** Called when YouTube chat connection state changes */
  onConnectionChange?: (state: {
    connected: boolean;
    loading: boolean;
    error: string | null;
  }) => void;
  /** When true, deleted messages are dimmed instead of removed */
  showDeletedMessages?: boolean;
  onUsernameClick?: (
    e: React.MouseEvent,
    author: string,
    avatar?: string,
  ) => void;
}

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
  authorAvatar?: string;
  badges?: Record<string, string>;
  parts: MessagePart[];
  timestamp: Date;
  authorChannelId?: string;
  optimistic?: boolean;
  messageType?: string;
  giftCount?: number;
  recipientName?: string;
  isDeleted?: boolean;
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

export default function YouTubeChat({
  videoId,
  channel,
  onMessages,
  optimisticMessages,
  fontSize = 14,
  chatFont = "inter" as ChatFont,
  splitChatEnabled = false,
  onConnectionChange,
  showDeletedMessages = false,
  onUsernameClick,
}: YouTubeChatProps) {
  const getTextContent = (m: ChatMessage) =>
    m.parts.map((p) => p.text || p.emojiText || p.alt || "").join("");

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
  const [reloadKey, setReloadKey] = useState(0);

  const mergedMessages = useMemo(() => {
    if (!optimisticMessages?.length) return messages;
    const norm = (s: string) => s.normalize("NFKC").trim().toLowerCase();

    const realKeys = new Set(
      messages.map((m) => {
        const textKey = norm(getTextContent(m));
        return m.authorChannelId
          ? `${m.authorChannelId}|${textKey}`
          : `${norm(m.author)}|${textKey}`;
      }),
    );

    const unmatched = optimisticMessages.filter((opt) => {
      const textKey = norm(getTextContent(opt));
      const key = opt.authorChannelId
        ? `${opt.authorChannelId}|${textKey}`
        : `${norm(opt.author)}|${textKey}`;
      return !realKeys.has(key);
    });

    return unmatched.length ? [...messages, ...unmatched] : messages;
  }, [messages, optimisticMessages]);

  const prevVideoIdRef = useRef<string | null>(null);

  // Connect to SSE stream
  useEffect(() => {
    if (!videoId) return;

    let isMounted = true;
    const isInitialConnect = prevVideoIdRef.current !== videoId;
    prevVideoIdRef.current = videoId;
    retryCountRef.current = 0;
    errorRef.current = null;
    setIsLoading(true);
    setIsConnected(false);
    setError(null);
    if (isInitialConnect) setMessages([]);

    const connect = async () => {
      if (!isMounted) return;

      // Close existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      const sseUrl = `/api/youtube-stream-chat?videoId=${encodeURIComponent(videoId)}`;

      try {
        const probeRes = await fetch(sseUrl, { method: "GET" });
        if (!probeRes.ok) {
          let errorMsg = `Connection failed (${probeRes.status})`;
          try {
            const errData = await probeRes.json();
            if (errData.error) errorMsg = errData.error;
          } catch {}
          if (!isMounted) return;
          setIsConnected(false);
          setIsLoading(false);
          setError(errorMsg);
          errorRef.current = errorMsg;
          const delay = Math.min(5000 + retryCountRef.current * 5000, 60000);
          retryCountRef.current++;
          reconnectTimerRef.current = setTimeout(() => {
            if (isMounted) {
              setError(null);
              errorRef.current = null;
              setIsLoading(true);
              connect();
            }
          }, delay);
          return;
        }
        probeRes.body?.cancel();
      } catch {
        // fetch probe failed (network error, etc.) — fall through to EventSource
      }

      if (!isMounted) return;

      const es = new EventSource(sseUrl);
      eventSourceRef.current = es;

      es.addEventListener("connected", (e: Event) => {
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
          messageType: msg.messageType,
          giftCount: msg.giftCount,
          recipientName: msg.recipientName,
          superchat: msg.superchat,
          isDeleted: msg.isDeleted,
        }));

        setMessages((prev) => {
          const uniqueMap = new Map<string, ChatMessage>();
          for (const m of prev) uniqueMap.set(m.id, m);
          for (const m of fetchedMessages) uniqueMap.set(m.id, m);

          if (channel !== undefined) {
            for (const m of fetchedMessages) {
              saveMessage(
                {
                  id: m.id,
                  platform: "youtube",
                  author: m.author,
                  content: m.parts
                    .map((p) => p.text || p.emojiText || p.alt || "")
                    .join(""),
                  timestamp: m.timestamp,
                  authorAvatar: m.authorAvatar,
                  authorChannelId: m.authorChannelId,
                  messageType: m.messageType,
                  badges: m.badges,
                  isDeleted: m.isDeleted,
                } as any,
                channel,
              );
            }
          }

          const merged = Array.from(uniqueMap.values()).sort(
            (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
          );

          return merged.length > MAX_DISPLAYED_MESSAGES
            ? merged.slice(-MAX_DISPLAYED_MESSAGES)
            : merged;
        });
        setIsConnected(true);
        setIsLoading(false);
        setError(null);
        errorRef.current = null;
        retryCountRef.current = 0;
      });

      es.addEventListener("message", (e: Event) => {
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
          messageType: msg.messageType,
          giftCount: msg.giftCount,
          recipientName: msg.recipientName,
          superchat: msg.superchat,
          isDeleted: msg.isDeleted,
        };

        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;

          if (channel !== undefined) {
            saveMessage(
              {
                id: newMsg.id,
                platform: "youtube",
                author: newMsg.author,
                content: newMsg.parts
                  .map((p) => p.text || p.emojiText || p.alt || "")
                  .join(""),
                timestamp: newMsg.timestamp,
                authorAvatar: newMsg.authorAvatar,
                authorChannelId: newMsg.authorChannelId,
                messageType: newMsg.messageType,
                badges: newMsg.badges,
                isDeleted: newMsg.isDeleted,
              } as any,
              channel,
            );
          }

          const next = [...prev, newMsg];
          return next.length > MAX_DISPLAYED_MESSAGES
            ? next.slice(-MAX_DISPLAYED_MESSAGES)
            : next;
        });
      });

      es.addEventListener("delete", (e: Event) => {
        if (!isMounted) return;
        const data = JSON.parse((e as MessageEvent).data) as SSEDeleteEvent;
        setMessages((prev) => {
          if (showDeletedMessages) {
            return prev.map((m) =>
              m.id === data.messageId ? { ...m, isDeleted: true } : m,
            );
          }
          return prev.filter((m) => m.id !== data.messageId);
        });
      });

      es.addEventListener("error", (e: Event) => {
        if (!isMounted) return;
        let errorMsg: string;
        try {
          const data = JSON.parse((e as MessageEvent).data) as SSEErrorEvent;
          console.error("[YouTubeChat] SSE error event:", data.error);
          errorMsg = data.error;
        } catch {
          errorMsg = "Connection lost";
        }
        setIsConnected(false);
        setIsLoading(false);
        setError(errorMsg);
        errorRef.current = errorMsg;
        es.close();
        eventSourceRef.current = null;

        // Auto-reload chat after a delay with exponential backoff
        const delay = Math.min(3000 + retryCountRef.current * 2000, 30000);
        retryCountRef.current++;
        reconnectTimerRef.current = setTimeout(() => {
          if (isMounted) {
            setError(null);
            errorRef.current = null;
            connect();
          }
        }, delay);
      });

      es.addEventListener("end", (e: Event) => {
        if (!isMounted) return;
        const data = JSON.parse((e as MessageEvent).data) as SSEEndEvent;
        console.log("[YouTubeChat] Stream ended:", data.reason);
        setIsConnected(false);
        setIsLoading(false);
        setError("Live stream has ended");
        es.close();
        eventSourceRef.current = null;
      });

      es.onerror = () => {
        if (!isMounted) return;
        retryCountRef.current++;
        setIsConnected(false);

        if (!errorRef.current) {
          setError("Connection lost");
          errorRef.current = "Connection lost";
        }
        setIsLoading(false);

        if (retryCountRef.current > 5) {
          es.close();
          eventSourceRef.current = null;
          const delay = Math.min(3000 + retryCountRef.current * 2000, 30000);
          reconnectTimerRef.current = setTimeout(() => {
            if (isMounted) {
              setError(null);
              errorRef.current = null;
              setIsLoading(true);
              connect();
            }
          }, delay);
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
  }, [videoId, reloadKey]);

  // Keep the view pinned to the newest message
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  }, [mergedMessages]);

  // Handle mobile keyboard - scroll to bottom when keyboard closes (viewport expands)
  useScrollToBottomOnKeyboard(messagesContainerRef);

  // Pass the current message list up so the parent can use it in unified chat
  // Only report real (non-optimistic) messages so the parent's dedup logic works correctly
  useEffect(() => {
    if (onMessages) {
      onMessages(messages);
    }
  }, [messages, onMessages]);

  // Notify parent of connection state changes
  useEffect(() => {
    if (onConnectionChange) {
      onConnectionChange({ connected: isConnected, loading: isLoading, error });
    }
  }, [isConnected, isLoading, error, onConnectionChange]);

  const isEnded = error === "Live stream has ended";

  if (isLoading && mergedMessages.length === 0) {
    return (
      <div className="yt-chat-status">
        <AiOutlineLoading3Quarters className="animate-spin" /> Connecting to
        YouTube chat...
      </div>
    );
  }

  if (error && mergedMessages.length === 0) {
    return (
      <div className="yt-chat-status yt-chat-error">
        <div>⚠️ {error}</div>
        <button
          className="yt-chat-reload-btn"
          onClick={() => {
            setReloadKey((k) => k + 1);
          }}
          style={{ marginTop: "8px" }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="yt-chat-outer">
      {error && !isEnded && (
        <div className="yt-chat-error-banner">
          <span>⚠️ {error}</span>
          <button
            className="yt-chat-reload-btn"
            onClick={() => {
              setReloadKey((k) => k + 1);
            }}
          >
            Reload
          </button>
        </div>
      )}
      {isEnded && (
        <div className="yt-chat-error-banner">
          <span>⚠️ {error}</span>
        </div>
      )}
      <div
        ref={messagesContainerRef}
        className={`yt-chat-container${splitChatEnabled ? " split-chat" : ""}`}
        style={
          {
            "--chat-font-size": `${fontSize}px`,
            "--chat-font-family": FONT_FAMILY_MAP[chatFont],
          } as React.CSSProperties
        }
      >
        {!isConnected && (
          <div className="yt-chat-placeholder">
            Reconnecting to YouTube chat...
          </div>
        )}
        {isConnected && mergedMessages.length === 0 && (
          <div className="yt-chat-placeholder">Waiting for messages...</div>
        )}
        {mergedMessages.map((msg, index) => (
          <YouTubeMessageContent
            key={msg.id}
            msg={msg}
            index={index}
            variant="standalone"
            onUsernameClick={onUsernameClick}
          />
        ))}
      </div>
    </div>
  );
}
