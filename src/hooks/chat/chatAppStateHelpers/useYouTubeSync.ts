import { useState, useEffect, useCallback, useMemo } from "react";
import type { YTMessage } from "../../../components/chat/unified/types";

export interface UseYouTubeSyncOptions {
  linkedYoutubeUrl?: string;
  showYoutubeSection?: boolean;
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
  manualVideoId: string;
  autoVideoId: string | null;
  ytLoading: boolean;
  ytError: string | null;
  showYoutubeSection: boolean;
  ytMessages: YTMessage[];
  ytOptimisticMessages: YTMessage[];
  setManualVideoId: (v: string) => void;
  setAutoVideoId: (v: string | null) => void;
  setShowYoutubeSection: (v: boolean) => void;
  setYtMessages: (v: YTMessage[]) => void;
  handleYtMessages: (msgs: YTMessage[]) => void;
  handleYtOptimisticMessage: (id: string, text: string) => void;
  handleYtOptimisticFailed: (id: string) => void;
  getYtMessageText: (m: YTMessage) => string;
}

export function useYouTubeSync({
  linkedYoutubeUrl,
  showYoutubeSection = true,
  selectedTwitchChannelName = "",
  youtubeSession,
  unifyChatEnabled = false,
  unifiedChatRef,
}: UseYouTubeSyncOptions): UseYouTubeSyncReturn {
  const [manualVideoId, setManualVideoId] = useState("");
  const [autoVideoId, setAutoVideoId] = useState<string | null>(null);
  const [ytLoading, setYtLoading] = useState(false);
  const [ytError, setYtError] = useState<string | null>(null);
  const [showYoutubeSectionState, setShowYoutubeSection] = useState(true);
  const [ytMessages, setYtMessages] = useState<YTMessage[]>([]);
  const [ytOptimisticMessages, setYtOptimisticMessages] = useState<YTMessage[]>(
    [],
  );

  const youtubeVideoId = useMemo(() => {
    if (manualVideoId) return manualVideoId;
    if (autoVideoId) return autoVideoId;
    if (!linkedYoutubeUrl) return null;
    let videoId = null;
    try {
      if (linkedYoutubeUrl.includes("v=")) {
        videoId = new URLSearchParams(new URL(linkedYoutubeUrl).search).get(
          "v",
        );
      } else if (linkedYoutubeUrl.includes("youtu.be/")) {
        videoId = linkedYoutubeUrl.split("youtu.be/")[1].split("?")[0];
      } else if (linkedYoutubeUrl.includes("/live/")) {
        videoId = linkedYoutubeUrl.split("/live/")[1].split("?")[0];
      }
    } catch (e) {
      console.warn("Failed to parse YouTube URL:", e);
    }
    return videoId;
  }, [linkedYoutubeUrl, manualVideoId, autoVideoId]);

  useEffect(() => {
    if (!linkedYoutubeUrl || !showYoutubeSection) {
      setAutoVideoId(null);
      setYtError(null);
      return;
    }
    if (
      linkedYoutubeUrl.includes("v=") ||
      linkedYoutubeUrl.includes("youtu.be/") ||
      linkedYoutubeUrl.includes("/live/")
    ) {
      return;
    }

    let cancelled = false;
    const abortController = new AbortController();
    const fetchLiveVideoId = async () => {
      setYtLoading(true);
      setYtError(null);
      try {
        const params = new URLSearchParams();
        params.append("channelUrl", linkedYoutubeUrl);
        const res = await fetch(`/api/youtube-live?${params.toString()}`, {
          signal: abortController.signal,
        });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.videoId) {
          setAutoVideoId((prev) =>
            prev !== data.videoId ? data.videoId : prev,
          );
          setYtError(null);
        } else {
          if (!res.ok) {
            setYtError(data.error || "Failed to check for live stream");
          } else {
            setYtError("No live stream found");
            setAutoVideoId(null);
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!cancelled) {
          setYtError("Failed to check for live stream");
          console.error("YouTube live fetch error:", err);
        }
      } finally {
        if (!cancelled) setYtLoading(false);
      }
    };

    fetchLiveVideoId();
    const interval = setInterval(fetchLiveVideoId, 600000);

    return () => {
      cancelled = true;
      abortController.abort();
      clearInterval(interval);
    };
  }, [linkedYoutubeUrl, showYoutubeSection]);

  useEffect(() => {
    setManualVideoId("");
    setAutoVideoId(null);
    setYtError(null);
    setYtMessages([]);
  }, [selectedTwitchChannelName]);

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
      setYtMessages(msgs);
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

  return {
    youtubeVideoId,
    manualVideoId,
    autoVideoId,
    ytLoading,
    ytError,
    showYoutubeSection: showYoutubeSectionState,
    ytMessages,
    ytOptimisticMessages,
    setManualVideoId,
    setAutoVideoId,
    setShowYoutubeSection,
    setYtMessages,
    handleYtMessages,
    handleYtOptimisticMessage,
    handleYtOptimisticFailed,
    getYtMessageText,
  };
}
