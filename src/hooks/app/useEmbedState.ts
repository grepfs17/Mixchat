import { useEffect, useRef, useState } from "react";
import { getStreamStatus } from "../../lib/twitch";

const VIDEO_RATIO_KEY = "mixchat_video_ratio";
const VIDEO_RATIO_DEFAULT = 70;
const VIDEO_RATIO_MIN = 30;
const VIDEO_RATIO_MAX = 80;
const VIEWER_COUNT_REFRESH_MS = 30000;

export type PlayerType = "embed" | "m3u8" | "youtube";

export type HlsQualityPreference =
  | "highest"
  | "1080p"
  | "720p"
  | "480p"
  | "360p"
  | "160p"
  | "audio_only";

export type HlsQuality = { label: string; url: string };

export type UseEmbedStateOptions = {
  selectedTwitchChannel: string;
  selectedTwitchChannelName: string;
  twitchAccessToken: string | undefined;
  /** Resolved linked YouTube URL; when the player is in YouTube mode and this
   * goes away we have to fall back to the Twitch embed. */
  linkedYoutubeUrl: string | null;
  defaultPlayerType?: "embed" | "m3u8";
  defaultHlsQuality?: string;
};

export type UseEmbedStateResult = {
  videoRatio: number;
  setVideoRatio: React.Dispatch<React.SetStateAction<number>>;
  isDragging: boolean;
  setIsDragging: React.Dispatch<React.SetStateAction<boolean>>;
  embedRef: React.RefObject<HTMLDivElement | null>;
  playerType: PlayerType;
  setPlayerType: React.Dispatch<React.SetStateAction<PlayerType>>;
  hlsQualities: HlsQuality[];
  setHlsQualities: React.Dispatch<React.SetStateAction<HlsQuality[]>>;
  selectedHlsQualityIdx: number;
  setSelectedHlsQualityIdx: React.Dispatch<React.SetStateAction<number>>;
  showHlsQualityMenu: boolean;
  setShowHlsQualityMenu: React.Dispatch<React.SetStateAction<boolean>>;
  viewerCount: number | null;
};

export function useEmbedState(
  options: UseEmbedStateOptions,
): UseEmbedStateResult {
  const {
    selectedTwitchChannel,
    selectedTwitchChannelName,
    twitchAccessToken,
    linkedYoutubeUrl,
    defaultPlayerType,
    defaultHlsQuality,
  } = options;

  const [videoRatio, setVideoRatioRaw] = useState<number>(() => {
    if (typeof localStorage === "undefined") return VIDEO_RATIO_DEFAULT;
    const saved = localStorage.getItem(VIDEO_RATIO_KEY);
    if (!saved) return VIDEO_RATIO_DEFAULT;
    const parsed = Number(saved);
    return Number.isFinite(parsed) ? parsed : VIDEO_RATIO_DEFAULT;
  });
  useEffect(() => {
    localStorage.setItem(VIDEO_RATIO_KEY, String(videoRatio));
  }, [videoRatio]);
  const setVideoRatio = setVideoRatioRaw;

  const [isDragging, setIsDragging] = useState(false);
  const [playerType, setPlayerType] = useState<PlayerType>(
    defaultPlayerType ?? "embed",
  );
  const [hlsQualities, setHlsQualities] = useState<HlsQuality[]>([]);
  const [selectedHlsQualityIdx, setSelectedHlsQualityIdx] = useState(0);
  const [showHlsQualityMenu, setShowHlsQualityMenu] = useState(false);
  const [viewerCount, setViewerCount] = useState<number | null>(null);

  const embedRef = useRef<HTMLDivElement | null>(null);

  // Reset HLS state when the channel or player type changes — the qualities
  // list and the selected index are per-source and stale values would point
  // at missing URLs.
  // Reset HLS state when channel or player type changes — intentional
  // eslint-disable-next-line no-adjust-state-on-prop-change
  useEffect(() => {
    setHlsQualities([]);
    setSelectedHlsQualityIdx(0);
    setShowHlsQualityMenu(false);
  }, [selectedTwitchChannelName, playerType]);

  // Apply the user's default quality preference when the quality list is
  // loaded.  Only fires once per channel change (the reset above empties
  // the list and then this fills it).  Manual quality changes during a
  // session are respected until the next channel change.
  const prevQualitiesLenRef = useRef(0);
  useEffect(() => {
    if (hlsQualities.length === 0) {
      prevQualitiesLenRef.current = 0;
      return;
    }
    // Only apply on initial load, not on internal hls.js playlist refreshes
    if (prevQualitiesLenRef.current > 0) return;
    prevQualitiesLenRef.current = hlsQualities.length;

    if (!defaultHlsQuality || defaultHlsQuality === "highest") {
      setSelectedHlsQualityIdx(0);
      return;
    }

    const target = defaultHlsQuality;
    let idx = 0;

    if (target === "audio_only") {
      const found = hlsQualities.findIndex((q) => q.label === "audio_only");
      if (found >= 0) idx = found;
    } else {
      for (let i = 0; i < hlsQualities.length; i++) {
        if (hlsQualities[i].label.includes(target)) {
          idx = i;
          break;
        }
      }
    }

    setSelectedHlsQualityIdx(idx);
  }, [hlsQualities, defaultHlsQuality]);

  // If the user is in YouTube-embed mode but the link has been removed
  // (channel change, link deleted from YouTubeLinker), fall back gracefully.
  // Fallback to embed when YouTube URL is missing — intentional
  /* eslint-disable no-adjust-state-on-prop-change */
  useEffect(() => {
    if (playerType === "youtube" && !linkedYoutubeUrl) {
      setPlayerType("embed");
    }
  }, [linkedYoutubeUrl, playerType]);
  /* eslint-enable no-adjust-state-on-prop-change */

  // Fetch live viewer count for the selected channel every 30s. 30s (vs the
  // previous 15s) cuts Helix query volume in half while still feeling live.
  useEffect(() => {
    if (!selectedTwitchChannel || !twitchAccessToken) {
      setViewerCount(null);
      return;
    }

    const fetchViewerCount = async () => {
      try {
        const clientId = import.meta.env.PUBLIC_TWITCH_CLIENT_ID;
        const status = await getStreamStatus(
          twitchAccessToken,
          clientId,
          selectedTwitchChannel,
        );
        if (status) {
          setViewerCount(status.viewerCount || 0);
        }
      } catch (error) {
        console.error("Failed to fetch viewer count:", error);
      }
    };

    fetchViewerCount();
    const interval = setInterval(fetchViewerCount, VIEWER_COUNT_REFRESH_MS);
    return () => clearInterval(interval);
  }, [selectedTwitchChannel, twitchAccessToken]);

  // Resize-handle drag listener. Attached only while isDragging is true so
  // the global mouseup/mousemove handlers don't churn on every render.
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = document.querySelector(
        "[data-app-grid]",
      ) as HTMLElement | null;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const newX = e.clientX - rect.left;
      const newRatio = Math.max(
        VIDEO_RATIO_MIN,
        Math.min(VIDEO_RATIO_MAX, (newX / rect.width) * 100),
      );
      setVideoRatio(newRatio);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  return {
    videoRatio,
    setVideoRatio,
    isDragging,
    setIsDragging,
    embedRef,
    playerType,
    setPlayerType,
    hlsQualities,
    setHlsQualities,
    selectedHlsQualityIdx,
    setSelectedHlsQualityIdx,
    showHlsQualityMenu,
    setShowHlsQualityMenu,
    viewerCount,
  };
}
