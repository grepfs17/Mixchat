import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearStoredYoutubeStream,
  isYoutubeVideoId,
  parseDirectVideoId,
  pickPrimaryLiveCandidate,
  readStoredYoutubeStream,
  resolveYoutubeVideoId,
  writeStoredYoutubeStream,
  type YoutubeLiveCandidate,
} from "../../lib/youtubeStreamSelection";

export interface UseYoutubeStreamsOptions {
  /** Linked YouTube channel URL or a direct video URL. */
  linkedYoutubeUrl: string | null;
  /** Channel the selection is remembered for (Twitch user ID or login). */
  channelKey: string;
}

export interface YoutubeStreamsState {
  videos: YoutubeLiveCandidate[];
  selectedVideoId: string | null;
  channelId: string | null;
  loading: boolean;
  error: string | null;
  /** Set when the picked broadcast ends and another one takes over. */
  notice: string | null;
  selectVideo: (videoId: string | null) => void;
  setManualVideoId: (videoId: string) => void;
}

const POLL_INTERVAL_MS = 30_000;
const SWITCH_NOTICE =
  "The selected YouTube stream ended. Switched to the other live broadcast.";

function isCandidate(value: unknown): value is YoutubeLiveCandidate {
  if (!value || typeof value !== "object") return false;
  return isYoutubeVideoId((value as { videoId?: unknown }).videoId);
}

/**
 * Resolves every live broadcast on a linked YouTube channel and keeps the
 * viewer's pick stable while that broadcast stays live.
 *
 * A channel can run several broadcasts at once (landscape desktop plus
 * vertical mobile), and each one has its own chat. The selection is shared by
 * the chat and the embed so they never disagree.
 */
export function useYoutubeStreams({
  linkedYoutubeUrl,
  channelKey,
}: UseYoutubeStreamsOptions): YoutubeStreamsState {
  const [manualVideoId, setManualVideoIdState] = useState("");
  const [remoteVideos, setRemoteVideos] = useState<YoutubeLiveCandidate[]>([]);
  const [remoteChannelId, setRemoteChannelId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Stored pick, re-read when the user switches channels. State (not a ref)
  // so React can safely retry the compare-and-set under concurrent rendering.
  const [storedKey, setStoredKey] = useState(channelKey);
  const [storedVideoId, setStoredVideoId] = useState<string | null>(() =>
    readStoredYoutubeStream(channelKey),
  );

  if (storedKey !== channelKey) {
    setStoredKey(channelKey);
    setStoredVideoId(readStoredYoutubeStream(channelKey));
    setManualVideoIdState("");
    setRemoteVideos([]);
    setRemoteChannelId(null);
    setLoading(false);
    setError(null);
    setNotice(null);
  }

  const directVideoId = useMemo(
    () => parseDirectVideoId(linkedYoutubeUrl),
    [linkedYoutubeUrl],
  );

  const videos = useMemo<YoutubeLiveCandidate[]>(() => {
    if (directVideoId) return [{ videoId: directVideoId }];
    return remoteVideos;
  }, [directVideoId, remoteVideos]);

  const selectedVideoId = useMemo(
    () =>
      resolveYoutubeVideoId({
        manualVideoId,
        storedVideoId,
        candidates: videos,
      }),
    [manualVideoId, storedVideoId, videos],
  );

  useEffect(() => {
    setRemoteVideos([]);
    setRemoteChannelId(null);
    setNotice(null);

    if (!linkedYoutubeUrl || directVideoId) {
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const fetchLive = async (initial: boolean) => {
      if (initial) {
        setLoading(true);
        setError(null);
      }
      try {
        const params = new URLSearchParams({ channelUrl: linkedYoutubeUrl });
        const res = await fetch(`/api/youtube-live?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = await res.json();
        if (cancelled) return;

        const next: YoutubeLiveCandidate[] = Array.isArray(data.videos)
          ? data.videos.filter(isCandidate)
          : isYoutubeVideoId(data.videoId)
            ? [{ videoId: data.videoId }]
            : [];

        setRemoteVideos(next);
        setRemoteChannelId(
          typeof data.channelId === "string" && data.channelId
            ? data.channelId
            : null,
        );
        setError(next.length > 0 ? null : "No live stream found");
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Failed to check for live stream");
        console.error("YouTube live fetch error:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchLive(true);
    const interval = setInterval(() => {
      void fetchLive(false);
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(interval);
    };
  }, [linkedYoutubeUrl, directVideoId]);

  // Drop a pick whose broadcast ended and fall back to the remaining one.
  useEffect(() => {
    if (!storedVideoId || directVideoId) return;
    // Wait for the live lookup so an empty list is not mistaken for "ended".
    if (videos.length === 0) return;
    if (videos.some((candidate) => candidate.videoId === storedVideoId)) return;

    if (channelKey) clearStoredYoutubeStream(channelKey);
    setStoredVideoId(null);
    if (pickPrimaryLiveCandidate(videos)) setNotice(SWITCH_NOTICE);
  }, [storedVideoId, videos, directVideoId, channelKey]);

  // Keep the switch notice transient.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 10_000);
    return () => clearTimeout(timer);
  }, [notice]);

  const selectVideo = useCallback(
    (videoId: string | null) => {
      setNotice(null);
      setManualVideoIdState("");

      if (!videoId) {
        if (channelKey) clearStoredYoutubeStream(channelKey);
        setStoredVideoId(null);
        return;
      }
      if (!isYoutubeVideoId(videoId)) return;

      if (channelKey) writeStoredYoutubeStream(channelKey, videoId);
      setStoredVideoId(videoId);
    },
    [channelKey],
  );

  const setManualVideoId = useCallback((videoId: string) => {
    const trimmed = (videoId || "").trim();
    setNotice(null);
    setManualVideoIdState(isYoutubeVideoId(trimmed) ? trimmed : "");
  }, []);

  return {
    videos,
    selectedVideoId,
    channelId: remoteChannelId,
    loading: directVideoId ? false : loading,
    error: directVideoId ? null : error,
    notice,
    selectVideo,
    setManualVideoId,
  };
}
