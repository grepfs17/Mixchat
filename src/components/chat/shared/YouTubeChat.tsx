import React, { useEffect, useMemo, useRef, useState } from "react";
import { AiOutlineLoading3Quarters } from "react-icons/ai";
import type { ChatFont } from "../../../lib/types";
import { FONT_FAMILY_MAP, getMaxDisplayedMessages } from "../../../lib/types";
import { useScrollToBottomOnKeyboard } from "../../../hooks/chat/useScrollToBottomOnKeyboard";
import { useLazyChatHistory } from "../../../hooks/chat/useLazyChatHistory";
import { saveMessage } from "../../../lib/chatHistoryStorage";
import { YouTubeMessageContent } from "./YouTubeMessageContent";
import type { MessagePart, YTMessage as UnifiedYTMessage } from "../unified/types";

/**
 * Standalone YouTubeChat maintains a parallel `ChatMessage` type that
 * mirrors the shape produced by the SSE stream (`/api/youtube-stream-chat`).
 * Server messages don't carry `twitch-link` parts, but we widen the
 * discriminator so a `YTMessage` from the unified chat can be fed back
 * through YouTubeMessageContent without a cast.
 */
type ChatMessage = Omit<UnifiedYTMessage, "parts"> & {
  parts: MessagePart[];
};

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
    reconnecting: boolean;
  }) => void;
  /** When true, deleted messages are dimmed instead of removed */
  showDeletedMessages?: boolean;
  onUsernameClick?: (
    e: React.MouseEvent,
    author: string,
    avatar?: string,
  ) => void;
  /** Called when a chat item is marked deleted by a moderator (or author). */
  onMessageDeleted?: (messageId: string, deletedByText?: string) => void;
  /**
   * When true, render 7TV / BTTV / FFZ emote names in YouTube messages as
   * images, using the same emote set the Twitch side is currently using.
   */
  renderThirdPartyEmotes?: boolean;
  /**
   * When true (default), older messages are lazily loaded from IndexedDB as
   * the user scrolls to the top. Disabled for the hidden YouTubeChat used by
   * unified chat, where UnifiedChat owns history loading.
   */
  enableLazyHistory?: boolean;
}

interface SSEMessageEvent {
  messages: ChatMessage[];
  count: number;
}

interface SSEDeleteEvent {
  messageId: string;
  deletedByText?: string;
}

interface SSEErrorEvent {
  error: string;
}

interface SSEEndEvent {
  reason: string;
}

interface SSENoticeEvent {
  /** Server-driven reconnection status (transient YouTube block). */
  status?: "reconnecting" | "reconnected";
}

function getTextContent(m: ChatMessage) {
  return m.parts.map((p) => p.text || p.emojiText || p.alt || "").join("");
}

export default function YouTubeChat({
  videoId,
  channel,
  onMessages,
  optimisticMessages,
  fontSize,
  chatFont,
  splitChatEnabled,
  onConnectionChange,
  showDeletedMessages = false,
  onUsernameClick,
  onMessageDeleted,
  renderThirdPartyEmotes = false,
  enableLazyHistory = true,
}: YouTubeChatProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<string | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  /**
   * Server-driven reconnect state: idle → reconnecting (transient YouTube
   * block, SSE stays open) → reconnected (brief flash) → idle.
   */
  const [reconnectStatus, setReconnectStatus] = useState<
    "idle" | "reconnecting" | "reconnected"
  >("idle");

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

  // Older YouTube messages loaded from IndexedDB as the user scrolls up.
  const { history: olderMessages } = useLazyChatHistory<ChatMessage>({
    channel,
    enabled: enableLazyHistory && !!videoId,
    live: mergedMessages,
    platforms: ["youtube"],
    containerRef: messagesContainerRef,
    keyOf: (msg) => `youtube:${msg.id}`,
    timestampOf: (msg) => msg.timestamp.getTime(),
    isOptimistic: (msg) => msg.optimistic === true,
    mapStored: (message) => {
      const stored = message as unknown as Record<string, unknown>;
      const parts = stored.parts as MessagePart[] | undefined;
      return {
        id: String(stored.id),
        author: String(stored.author ?? ""),
        authorAvatar: stored.authorAvatar as string | undefined,
        badges: stored.badges as Record<string, string> | undefined,
        parts:
          Array.isArray(parts) && parts.length > 0
            ? parts
            : [{ type: "text", text: String(stored.content ?? "") }],
        timestamp:
          message.timestamp instanceof Date
            ? message.timestamp
            : new Date(message.timestamp),
        authorChannelId: stored.authorChannelId as string | undefined,
        messageType: stored.messageType as string | undefined,
        giftCount: stored.giftCount as number | undefined,
        recipientName: stored.recipientName as string | undefined,
        superchat: stored.superchat as ChatMessage["superchat"],
        isDeleted: stored.isDeleted as boolean | undefined,
        deletedByText: stored.deletedByText as string | undefined,
        targetUsername: stored.targetUsername as string | undefined,
        authorIsModerator: stored.authorIsModerator as boolean | undefined,
        authorIsOwner: stored.authorIsOwner as boolean | undefined,
        authorIsMember: stored.authorIsMember as boolean | undefined,
      };
    },
    maxHistory: getMaxDisplayedMessages(),
    liveCap: getMaxDisplayedMessages(),
  });

  const renderedMessages = useMemo(() => {
    if (olderMessages.length === 0) return mergedMessages;
    const liveIds = new Set(mergedMessages.map((m) => m.id));
    const older = olderMessages.filter((m) => !liveIds.has(m.id));
    return older.length === 0 ? mergedMessages : [...older, ...mergedMessages];
  }, [olderMessages, mergedMessages]);

  const prevVideoIdRef = useRef<string | null>(null);

  // Connect to SSE stream
  useEffect(() => {
    if (!videoId) return () => {};

    let isMounted = true;
    const probeAbort = new AbortController();
    const isInitialConnect = prevVideoIdRef.current !== videoId;
    prevVideoIdRef.current = videoId;
    retryCountRef.current = 0;
    errorRef.current = null;
    setIsLoading(true);
    setIsConnected(false);
    setError(null);
    setReconnectStatus("idle");
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
        const probeRes = await fetch(sseUrl, { method: "GET", signal: probeAbort.signal });
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
      } catch (err) {
        if (probeAbort.signal.aborted) return;
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
          deletedByText: msg.deletedByText,
          targetUsername: msg.targetUsername,
          authorIsModerator: msg.authorIsModerator,
          authorIsOwner: msg.authorIsOwner,
          authorIsMember: msg.authorIsMember,
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
                  parts: m.parts,
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

          const max = getMaxDisplayedMessages();
          return merged.length > max ? merged.slice(-max) : merged;
        });
        setIsConnected(true);
        setIsLoading(false);
        setError(null);
        errorRef.current = null;
        retryCountRef.current = 0;
        setReconnectStatus("idle");
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
          deletedByText: msg.deletedByText,
          targetUsername: msg.targetUsername,
          authorIsModerator: msg.authorIsModerator,
          authorIsOwner: msg.authorIsOwner,
          authorIsMember: msg.authorIsMember,
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
                parts: newMsg.parts,
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
          const max = getMaxDisplayedMessages();
          return next.length > max ? next.slice(-max) : next;
        });
      });

      es.addEventListener("delete", (e: Event) => {
        if (!isMounted) return;
        const data = JSON.parse((e as MessageEvent).data) as SSEDeleteEvent;
        if (onMessageDeleted) {
          onMessageDeleted(data.messageId, data.deletedByText);
        }
        setMessages((prev) => {
          if (showDeletedMessages) {
            return prev.map((m) =>
              m.id === data.messageId
                ? {
                    ...m,
                    isDeleted: true,
                    deletedByText: data.deletedByText ?? m.deletedByText,
                  }
                : m,
            );
          }
          return prev.filter((m) => m.id !== data.messageId);
        });
      });

      es.addEventListener("notice", (e: Event) => {
        if (!isMounted) return;
        try {
          const data = JSON.parse((e as MessageEvent).data) as SSENoticeEvent;
          if (data.status === "reconnecting") {
            setReconnectStatus("reconnecting");
          } else if (data.status === "reconnected") {
            setReconnectStatus("reconnected");
            // Brief "reconnected" flash, then back to idle.
            setTimeout(() => {
              if (isMounted) {
                setReconnectStatus((cur) =>
                  cur === "reconnected" ? "idle" : cur,
                );
              }
            }, 2500);
          }
        } catch {}
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
        setReconnectStatus("idle");
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
        setReconnectStatus("idle");
        setIsLoading(false);
        setError("Live stream has ended");
        es.close();
        eventSourceRef.current = null;
      });

      es.onerror = () => {
        if (!isMounted) return;
        retryCountRef.current++;
        setIsConnected(false);
        setReconnectStatus("idle");

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
      probeAbort.abort();
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [videoId, reloadKey]);

  // Track whether the view is pinned to the bottom so auto-scroll does not
  // fight the user reading older history.
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const handleScroll = () => {
      setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 85);
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [isLoading, error, isConnected]);

  // Keep the view pinned to the newest message while at the bottom.
  // Defer via rAF so the browser finishes layout of new messages first.
  useEffect(() => {
    if (!isAtBottom) return;
    const el = messagesContainerRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [renderedMessages, isAtBottom]);

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
      onConnectionChange({
        connected: isConnected,
        loading: isLoading,
        error,
        reconnecting: reconnectStatus === "reconnecting",
      });
    }
  }, [isConnected, isLoading, error, reconnectStatus, onConnectionChange]);

  const isEnded = error === "Live stream has ended";

  if (isLoading && renderedMessages.length === 0) {
    return (
      <div className="yt-chat-status">
        <AiOutlineLoading3Quarters className="animate-spin" /> Connecting to
        YouTube chat...
      </div>
    );
  }

  if (error && renderedMessages.length === 0) {
    return (
      <div className="yt-chat-status yt-chat-error">
        <div>⚠️ {error}</div>
        <button type="button"
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
          <button type="button"
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
      {reconnectStatus !== "idle" && (
        <div
          className={`yt-chat-reconnecting-banner${reconnectStatus === "reconnected" ? " yt-chat-reconnected" : ""}`}
        >
          <AiOutlineLoading3Quarters
            className={reconnectStatus === "reconnecting" ? "animate-spin" : ""}
          />
          <span>
            {reconnectStatus === "reconnecting"
              ? "YouTube chat reconnecting…"
              : "YouTube chat reconnected"}
          </span>
        </div>
      )}
      <div
        ref={messagesContainerRef}
        className={`yt-chat-container${splitChatEnabled ? " split-chat" : ""}`}
        style={
          {
            "--chat-font-size": `${fontSize}px`,
            "--chat-font-family": FONT_FAMILY_MAP[chatFont ?? "inter"],
          } as React.CSSProperties
        }
      >
        {!isConnected && (
          <div className="yt-chat-placeholder">
            Reconnecting to YouTube chat...
          </div>
        )}
        {isConnected && renderedMessages.length === 0 && (
          <div className="yt-chat-placeholder">Waiting for messages...</div>
        )}
        {renderedMessages.map((msg, index) => (
          <YouTubeMessageContent
            key={msg.id}
            msg={msg}
            index={index}
            variant="standalone"
            onUsernameClick={onUsernameClick}
            showDeletedMessages={showDeletedMessages}
            renderThirdPartyEmotes={renderThirdPartyEmotes}
          />
        ))}
      </div>
    </div>
  );
}
