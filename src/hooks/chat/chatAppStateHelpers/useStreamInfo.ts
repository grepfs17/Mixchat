import { useState, useEffect, useRef, useCallback } from "react";
import {
  getStreamStatus,
  getChannelInfo,
  updateChannelInfo,
  searchCategories,
  isFollowingChannel,
  getAllFollowedChannels,
} from "../../../lib/twitch";

const STREAM_STATUS_POLL_INTERVAL = 60000;
const UPTIME_UPDATE_INTERVAL = 1000;

function calculateUptime(startedAt: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - startedAt.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffDay > 0) return `${diffDay}d ${diffHour % 24}h ${diffMin % 60}m`;
  if (diffHour > 0) return `${diffHour}h ${diffMin % 60}m ${diffSec % 60}s`;
  if (diffMin > 0) return `${diffMin}m ${diffSec % 60}s`;
  return `${diffSec}s`;
}

export interface UseStreamInfoOptions {
  selectedTwitchChannel?: string;
  selectedTwitchChannelName?: string;
  twitchAccessToken?: string;
  twitchUserId?: string;
}

export interface UseStreamInfoReturn {
  streamIsLive: boolean;
  streamUptime: string;
  streamStartedAt: Date | null;
  streamStartedAtRef: React.RefObject<Date | null>;
  streamTitle: string;
  streamGameName: string;
  streamGameId: string;
  isFollowingChannelState: boolean | null;
  setStreamTitle: (v: string) => void;
  setStreamGameName: (v: string) => void;
  setStreamGameId: (v: string) => void;
  setIsFollowingChannelState: (v: boolean | null) => void;
  handleUpdateTitle: (title: string) => Promise<void>;
  handleUpdateCategory: (gameId: string, gameName: string) => Promise<void>;
  handleSearchCategories: (
    query: string,
  ) => Promise<Array<{ id: string; name: string }>>;
}

export function useStreamInfo({
  selectedTwitchChannel = "",
  selectedTwitchChannelName = "",
  twitchAccessToken = "",
  twitchUserId = "",
}: UseStreamInfoOptions): UseStreamInfoReturn {
  const [streamIsLive, setStreamIsLive] = useState(false);
  const [streamUptime, setStreamUptime] = useState("");
  const [streamStartedAt, setStreamStartedAt] = useState<Date | null>(null);
  const streamStartedAtRef = useRef<Date | null>(null);
  const [streamTitle, setStreamTitle] = useState("");
  const [streamGameName, setStreamGameName] = useState("");
  const [streamGameId, setStreamGameId] = useState("");
  const [isFollowingChannelState, setIsFollowingChannelState] = useState<
    boolean | null
  >(null);

  const handleUpdateTitle = useCallback(
    async (title: string) => {
      if (!twitchAccessToken || !selectedTwitchChannel) return;
      try {
        const ok = await updateChannelInfo(
          twitchAccessToken,
          import.meta.env.PUBLIC_TWITCH_CLIENT_ID,
          selectedTwitchChannel,
          { title },
        );
        if (ok) {
          setStreamTitle(title);
        }
      } catch {
        // Error handled by caller via notification
      }
    },
    [twitchAccessToken, selectedTwitchChannel],
  );

  const handleUpdateCategory = useCallback(
    async (gameId: string, gameName: string) => {
      if (!twitchAccessToken || !selectedTwitchChannel) return;
      try {
        const ok = await updateChannelInfo(
          twitchAccessToken,
          import.meta.env.PUBLIC_TWITCH_CLIENT_ID,
          selectedTwitchChannel,
          { gameId },
        );
        if (ok) {
          setStreamGameName(gameName);
          setStreamGameId(gameId);
        }
      } catch {
        // Error handled by caller via notification
      }
    },
    [twitchAccessToken, selectedTwitchChannel],
  );

  const handleSearchCategories = useCallback(
    async (query: string): Promise<Array<{ id: string; name: string }>> => {
      if (!twitchAccessToken) return [];
      try {
        return await searchCategories(
          twitchAccessToken,
          import.meta.env.PUBLIC_TWITCH_CLIENT_ID,
          query,
        );
      } catch {
        return [];
      }
    },
    [twitchAccessToken],
  );

  useEffect(() => {
    let cancelled = false;
    const fetchStreamStatus = async () => {
      if (selectedTwitchChannel && twitchAccessToken) {
        try {
          const status = await getStreamStatus(
            twitchAccessToken,
            import.meta.env.PUBLIC_TWITCH_CLIENT_ID,
            selectedTwitchChannel,
          );
          if (cancelled || !status) return;
          setStreamIsLive(status.isLive);
          setStreamTitle(status.isLive ? status.title || "" : "");
          setStreamGameName(status.isLive ? status.gameName || "" : "");
          if (status.isLive && status.startedAt) {
            streamStartedAtRef.current = status.startedAt;
            setStreamStartedAt(status.startedAt);
            setStreamUptime(calculateUptime(status.startedAt));
          } else {
            streamStartedAtRef.current = null;
            setStreamStartedAt(null);
            setStreamUptime("");
          }
        } catch (error) {
          if (cancelled) return;
          console.error("Failed to fetch stream status:", error);
        }
      }
    };

    fetchStreamStatus();
    const statusInterval = setInterval(
      fetchStreamStatus,
      STREAM_STATUS_POLL_INTERVAL,
    );
    const uptimeInterval = setInterval(() => {
      if (streamStartedAtRef.current) {
        setStreamUptime(calculateUptime(streamStartedAtRef.current));
      }
    }, UPTIME_UPDATE_INTERVAL);

    return () => {
      cancelled = true;
      clearInterval(statusInterval);
      clearInterval(uptimeInterval);
    };
  }, [selectedTwitchChannel, twitchAccessToken]);

  // Drop the previous stream's start immediately on channel switch; the poll
  // above repopulates it once the new channel's status resolves.
  useEffect(() => {
    streamStartedAtRef.current = null;
    setStreamStartedAt(null);
    setStreamIsLive(false);
    setStreamUptime("");
  }, [selectedTwitchChannel]);

  useEffect(() => {
    let cancelled = false;
    const fetchChannelInfo = async () => {
      if (selectedTwitchChannel && twitchAccessToken) {
        try {
          const info = await getChannelInfo(
            twitchAccessToken,
            import.meta.env.PUBLIC_TWITCH_CLIENT_ID,
            selectedTwitchChannel,
          );
          if (cancelled || !info) return;
          setStreamTitle(info.title);
          setStreamGameName(info.gameName);
          setStreamGameId(info.gameId);
        } catch (error) {
          if (cancelled) return;
          console.error("Failed to fetch channel info:", error);
        }
      }
    };

    fetchChannelInfo();
    const interval = setInterval(fetchChannelInfo, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selectedTwitchChannel, twitchAccessToken]);

  useEffect(() => {
    if (!selectedTwitchChannelName || !selectedTwitchChannel) return;

    let cancelled = false;
    const checkFollowStatus = async () => {
      if (twitchAccessToken && twitchUserId && selectedTwitchChannelName) {
        try {
          let follows = await isFollowingChannel(
            twitchAccessToken,
            import.meta.env.PUBLIC_TWITCH_CLIENT_ID,
            twitchUserId,
            selectedTwitchChannelName,
          );
          if (!follows) {
            try {
              const all = await getAllFollowedChannels(
                twitchAccessToken,
                import.meta.env.PUBLIC_TWITCH_CLIENT_ID,
                twitchUserId,
              );
              if (cancelled) return;
              const match = all.some((ch: any) => {
                const login = (ch.name || "").toLowerCase();
                const display = (ch.displayName || "").toLowerCase();
                return (
                  login === selectedTwitchChannelName.toLowerCase() ||
                  display === selectedTwitchChannelName.toLowerCase()
                );
              });
              if (match) follows = true;
            } catch (fallbackErr) {
              if (cancelled) return;
              console.warn("Fallback follow-list check failed:", fallbackErr);
            }
          }
          if (!cancelled) setIsFollowingChannelState(follows);
        } catch (err) {
          if (cancelled) return;
          console.error("Failed to check follow status:", err);
          setIsFollowingChannelState(null);
        }
      } else {
        if (!cancelled) setIsFollowingChannelState(null);
      }
    };

    checkFollowStatus();
    return () => {
      cancelled = true;
    };
  }, [
    selectedTwitchChannelName,
    selectedTwitchChannel,
    twitchUserId,
    twitchAccessToken,
  ]);

  return {
    streamIsLive,
    streamUptime,
    streamStartedAt,
    streamStartedAtRef,
    streamTitle,
    streamGameName,
    streamGameId,
    isFollowingChannelState,
    setStreamTitle,
    setStreamGameName,
    setStreamGameId,
    setIsFollowingChannelState,
    handleUpdateTitle,
    handleUpdateCategory,
    handleSearchCategories,
  };
}
