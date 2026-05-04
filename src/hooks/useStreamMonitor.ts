import { useState, useEffect, useCallback } from "react";
import {
  checkLiveStreamers,
  getWatchedStreamers,
  markStreamerNotified,
  markStreamerOffline,
  getNotifiedStreamers,
} from "../lib/streamMonitor";
import type { LiveStreamer } from "../lib/streamMonitor";
import type { PlatformSession } from "../lib/types";

interface UseStreamMonitorOptions {
  session: PlatformSession | undefined;
  clientId: string;
  enabled?: boolean;
  checkInterval?: number; // in milliseconds, default 60000 (1 minute)
}

export function useStreamMonitor({
  session,
  clientId,
  enabled = true,
  checkInterval = 60000,
}: UseStreamMonitorOptions) {
  const [liveStreamers, setLiveStreamers] = useState<LiveStreamer[]>([]);
  const [newLiveStreamer, setNewLiveStreamer] = useState<LiveStreamer | null>(
    null,
  );
  const [isChecking, setIsChecking] = useState(false);

  const checkStreamers = useCallback(async () => {
    if (!session?.accessToken || !enabled) return;

    setIsChecking(true);
    try {
      const watchedStreamers = getWatchedStreamers();
      const nowLive = await checkLiveStreamers(
        watchedStreamers,
        session.accessToken,
        clientId,
      );

      const notifiedStreamers = getNotifiedStreamers();

      // Check for newly live streamers
      const newlyLive = nowLive.filter(
        (streamer) => !notifiedStreamers.has(streamer.id),
      );

      if (newlyLive.length > 0) {
        // Notify about the first newly live streamer
        const firstNewStreamer = newlyLive[0];
        setNewLiveStreamer(firstNewStreamer);
        markStreamerNotified(firstNewStreamer.id);

        // Send browser notification
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          const gameInfo = firstNewStreamer.gameName ? ` — ${firstNewStreamer.gameName}` : "";
          const notif = new Notification(`${firstNewStreamer.displayName} is live${gameInfo}`, {
            body: firstNewStreamer.title || "Come watch the stream!",
            icon: firstNewStreamer.profileImageUrl || undefined,
            tag: `mixchat-live-${firstNewStreamer.id}`,
          });
          notif.onclick = () => {
            window.focus();
            notif.close();
          };
        }
      }

      // Check for streamers that went offline
      for (const streamerId of notifiedStreamers) {
        if (!nowLive.find((s) => s.id === streamerId)) {
          markStreamerOffline(streamerId);
        }
      }

      setLiveStreamers(nowLive);
    } catch (error) {
      console.error("Error monitoring streams:", error);
    } finally {
      setIsChecking(false);
    }
  }, [session?.accessToken, clientId, enabled]);

  // Request browser notification permission when monitoring starts
  useEffect(() => {
    if (enabled && session?.accessToken && typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [enabled, session?.accessToken]);

  // Check on mount and then periodically
  useEffect(() => {
    if (!enabled || !session?.accessToken) {
      setNewLiveStreamer(null);
      return;
    }

    checkStreamers();

    const interval = setInterval(checkStreamers, checkInterval);

    return () => clearInterval(interval);
  }, [checkStreamers, enabled, session?.accessToken, checkInterval]);

  const clearNewNotification = useCallback(() => {
    setNewLiveStreamer(null);
  }, []);

  return {
    liveStreamers,
    newLiveStreamer,
    isChecking,
    clearNewNotification,
  };
}
