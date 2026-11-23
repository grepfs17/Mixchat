import { useState, useCallback, useRef } from "react";
import type { YTMessage } from "../../../components/chat/unified/types";

export interface UseYouTubeSyncOptions {
  /** Broadcast selected by `useYoutubeStreams`, shared with the embed. */
  youtubeVideoId?: string | null;
  selectedTwitchChannelName?: string;
  youtubeSession?: {
    displayName?: string;
    userId?: string;
    profileImageUrl?: string;
  };
  unifyChatEnabled?: boolean;
  unifiedChatRef?: React.RefObject<{ scrollToBottom: () => void } | null>;
}

export interface UseYouTubeSyncReturn {
  youtubeVideoId: string | null;
  showYoutubeSection: boolean;
  ytMessages: YTMessage[];
  ytOptimisticMessages: YTMessage[];
  setShowYoutubeSection: (v: boolean) => void;
  setYtMessages: (v: YTMessage[]) => void;
  handleYtMessages: (msgs: YTMessage[]) => void;
  handleYtOptimisticMessage: (id: string, text: string) => void;
  handleYtOptimisticFailed: (id: string) => void;
  removeYtMessage: (id: string) => void;
  markYtMessageDeleted: (id: string, deletedByText?: string) => void;
  getYtMessageText: (m: YTMessage) => string;
}

export function useYouTubeSync({
  youtubeVideoId = null,
  selectedTwitchChannelName = "",
  youtubeSession,
  unifyChatEnabled = false,
  unifiedChatRef,
}: UseYouTubeSyncOptions): UseYouTubeSyncReturn {
  const [ytMessages, setYtMessages] = useState<YTMessage[]>([]);
  const [ytOptimisticMessages, setYtOptimisticMessages] = useState<YTMessage[]>(
    [],
  );
  const [showYoutubeSection, setShowYoutubeSection] = useState(true);
  /**
   * Sticky map of message id → deletedByText. Survives the periodic full
   * replacement of `ytMessages` from the SSE `onMessages` callback, so a
   * mod's delete keeps its tombstone even when InnerTube re-publishes the
   * original (un-deleted) message on the next poll.
   */
  const deletedRef = useRef<Map<string, string>>(new Map());

  // A different broadcast means a different server-side chat session. Drop
  // the old messages so the other stream's chat never flashes in between.
  const [prevVideoId, setPrevVideoId] = useState<string | null>(youtubeVideoId);
  if (prevVideoId !== youtubeVideoId) {
    setPrevVideoId(youtubeVideoId);
    setYtMessages([]);
    setYtOptimisticMessages([]);
    deletedRef.current = new Map();
  }

  // Reset all YouTube state when the user switches Twitch channels. Using the
  // recommended "adjusting state during render" pattern from React docs so the
  // reset is applied synchronously rather than in a deferred effect. The
  // previous channel value is tracked via useState (not useRef) so React can
  // correctly retry the compare-and-set under concurrent rendering.
  const [prevChannel, setPrevChannel] = useState(selectedTwitchChannelName);
  if (prevChannel !== selectedTwitchChannelName) {
    setPrevChannel(selectedTwitchChannelName);
    setYtMessages([]);
    setYtOptimisticMessages([]);
    deletedRef.current = new Map();
  }

  const getYtMessageText = useCallback(
    (m: YTMessage) =>
      m.parts
        .map(
          (p) =>
            (p as any).text || (p as any).emojiText || (p as any).alt || "",
        )
        .join(""),
    [],
  );

  const handleYtMessages = useCallback(
    (msgs: YTMessage[]) => {
      setYtOptimisticMessages((prev) => {
        if (!prev.length) return prev;
        const norm = (s: string) => s.normalize("NFKC").trim().toLowerCase();

        const realKeys = new Set(
          msgs.map((m) => {
            const textKey = norm(getYtMessageText(m));
            return m.authorChannelId
              ? `${m.authorChannelId}|${textKey}`
              : `${norm(m.author)}|${textKey}`;
          }),
        );

        const remaining = prev.filter((opt) => {
          const textKey = norm(getYtMessageText(opt));
          const key = opt.authorChannelId
            ? `${opt.authorChannelId}|${textKey}`
            : `${norm(opt.author)}|${textKey}`;
          return !realKeys.has(key);
        });

        return remaining.length === prev.length ? prev : remaining;
      });
      const delMap = deletedRef.current;
      if (delMap.size > 0) {
        const patched = msgs.map((m) => {
          const text = delMap.get(m.id);
          if (text === undefined) return m;
          if (m.isDeleted && m.deletedByText) return m;
          return { ...m, isDeleted: true, deletedByText: text };
        });
        setYtMessages(patched);
      } else {
        setYtMessages(msgs);
      }
    },
    [getYtMessageText],
  );

  const handleYtOptimisticMessage = useCallback(
    (id: string, text: string) => {
      const optimistic: YTMessage = {
        id,
        author: youtubeSession?.displayName || "You",
        authorChannelId: youtubeSession?.userId,
        authorAvatar: youtubeSession?.profileImageUrl,
        parts: [{ type: "text", text }],
        timestamp: new Date(),
        optimistic: true,
      };
      setYtOptimisticMessages((prev) => [...prev, optimistic]);
      if (unifyChatEnabled) {
        unifiedChatRef?.current?.scrollToBottom();
      }
    },
    [youtubeSession, unifyChatEnabled, unifiedChatRef],
  );

  const handleYtOptimisticFailed = useCallback((id: string) => {
    setYtOptimisticMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const removeYtMessage = useCallback((id: string) => {
    setYtMessages((prev) => {
      const exists = prev.some((m) => m.id === id);
      if (!exists) return prev;
      return prev.map((m) => (m.id === id ? { ...m, isDeleted: true } : m));
    });
  }, []);

  const markYtMessageDeleted = useCallback(
    (id: string, deletedByText?: string) => {
      // Persist the deleted state so it survives full `ytMessages`
      // replacements from the periodic SSE `onMessages` callback.
      const text = deletedByText ?? "Message deleted by a moderator";
      // First-writer-wins: if a label is already stored (e.g. from the
      // mod-delete flow which sets it before the API call), keep it.
      // The SSE stream may arrive later with a less specific label.
      const existing = deletedRef.current.get(id);
      if (existing) {
        setYtMessages((prev) => {
          const msg = prev.find((m) => m.id === id);
          if (!msg || (msg.isDeleted && msg.deletedByText)) return prev;
          return prev.map((m) =>
            m.id === id
              ? { ...m, isDeleted: true, deletedByText: existing }
              : m,
          );
        });
        return;
      }
      deletedRef.current.set(id, text);
      setYtMessages((prev) => {
        const exists = prev.some((m) => m.id === id);
        if (!exists) return prev;
        return prev.map((m) =>
          m.id === id
            ? { ...m, isDeleted: true, deletedByText: text }
            : m,
        );
      });
    },
    [],
  );

  return {
    youtubeVideoId,
    showYoutubeSection,
    ytMessages,
    ytOptimisticMessages,
    setShowYoutubeSection,
    setYtMessages,
    handleYtMessages,
    handleYtOptimisticMessage,
    handleYtOptimisticFailed,
    removeYtMessage,
    markYtMessageDeleted,
    getYtMessageText,
  };
}
