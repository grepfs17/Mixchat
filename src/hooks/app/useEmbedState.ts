import { useEffect, useRef, useState } from "react";
import { getStreamStatus } from "../../lib/twitch";

const VIDEO_RATIO_KEY = "mixchat_video_ratio";
const VIDEO_RATIO_DEFAULT = 70;
const VIDEO_RATIO_MIN = 30;
const VIDEO_RATIO_MAX = 80;
const VIEWER_COUNT_REFRESH_MS = 30000;

export type PlayerType = "embed" | "m3u8" | "youtube";

export type HlsQuality = { label: string; url: string };

export type UseEmbedStateOptions = {
  selectedTwitchChannel: string;
  selectedTwitchChannelName: string;
  twitchAccessToken: string | undefined;
  /** Resolved linked YouTube URL; when the player is in YouTube mode and this
   * goes away we have to fall back to the Twitch embed. */
  linkedYoutubeUrl: string | null;
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
  const [playerType, setPlayerType] = useState<PlayerType>("embed");
  const [hlsQualities, setHlsQualities] = useState<HlsQuality[]>([]);
  const [selectedHlsQualityIdx, setSelectedHlsQualityIdx] = useState(0);
  const [showHlsQualityMenu, setShowHlsQualityMenu] = useState(false);
  const [viewerCount, setViewerCount] = useState<number | null>(null);

  const embedRef = useRef<HTMLDivElement | null>(null);

  // Reset HLS state when the channel or player type changes — the qualities
  // list and the selected index are per-source and stale values would point
  // at missing URLs.
  useEffect(() => {
    setHlsQualities([]);
    setSelectedHlsQualityIdx(0);
    setShowHlsQualityMenu(false);
  }, [selectedTwitchChannelName, playerType]);

  // If the user is in YouTube-embed mode but the link has been removed
  // (channel change, link deleted from YouTubeLinker), fall back gracefully.
  useEffect(() => {
    if (playerType === "youtube" && !linkedYoutubeUrl) {
      setPlayerType("embed");
    }
  }, [linkedYoutubeUrl, playerType]);

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
