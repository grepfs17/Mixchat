import { getStreamStatuses } from "./twitch";
import type { PlatformSession } from "./types";

export interface StreamerToWatch {
  id: string;
  name: string;
  displayName: string;
  profileImageUrl?: string;
}

export interface LiveStreamer extends StreamerToWatch {
  isLive: true;
  title?: string;
  viewerCount?: number;
}

/**
 * Check which streamers from a list are currently live
 * Uses batch API endpoint to check all streamers in a single request
 */
export async function checkLiveStreamers(
  streamersToWatch: StreamerToWatch[],
  accessToken: string,
  clientId: string,
): Promise<LiveStreamer[]> {
  if (!streamersToWatch.length) return [];

  try {
    const streamerIds = streamersToWatch.map((s) => s.id);

    // Use batch endpoint to check all streamers in one API call
    const statuses = await getStreamStatuses(
      accessToken,
      clientId,
      streamerIds,
    );

    const liveStreamers: LiveStreamer[] = streamersToWatch
      .filter((streamer) => statuses[streamer.id]?.isLive)
      .map((streamer) => ({
        ...streamer,
        isLive: true as const,
        title: statuses[streamer.id]?.title,
        viewerCount: statuses[streamer.id]?.viewerCount,
      }));

    return liveStreamers;
  } catch (error) {
    console.error("Error checking live streamers:", error);
    throw error;
  }
}

/**
 * Get watched streamers from localStorage
 */
export function getWatchedStreamers(): StreamerToWatch[] {
  const saved = localStorage.getItem("mixchat_watched_streamers");
  if (!saved) return [];
  try {
    return JSON.parse(saved);
  } catch (error) {
    console.error("Failed to parse watched streamers:", error);
    return [];
  }
}

/**
 * Save watched streamers to localStorage
 */
export function saveWatchedStreamers(streamers: StreamerToWatch[]): void {
  localStorage.setItem("mixchat_watched_streamers", JSON.stringify(streamers));
}

/**
 * Add a streamer to watch list
 */
export function addWatchedStreamer(streamer: StreamerToWatch): void {
  const current = getWatchedStreamers();
  if (!current.find((s) => s.id === streamer.id)) {
    saveWatchedStreamers([...current, streamer]);
  }
}

/**
 * Remove a streamer from watch list
 */
export function removeWatchedStreamer(streamerId: string): void {
  const current = getWatchedStreamers();
  saveWatchedStreamers(current.filter((s) => s.id !== streamerId));
}

/**
 * Check which streamers have already been notified for
 */
export function getNotifiedStreamers(): Set<string> {
  const saved = localStorage.getItem("mixchat_notified_streamers");
  if (!saved) return new Set();
  try {
    return new Set(JSON.parse(saved));
  } catch (error) {
    console.error("Failed to parse notified streamers:", error);
    return new Set();
  }
}

/**
 * Mark a streamer as notified
 */
export function markStreamerNotified(streamerId: string): void {
  const notified = getNotifiedStreamers();
  notified.add(streamerId);
  localStorage.setItem(
    "mixchat_notified_streamers",
    JSON.stringify(Array.from(notified)),
  );
}

/**
 * Mark a streamer as not notified (when they go offline)
 */
export function markStreamerOffline(streamerId: string): void {
  const notified = getNotifiedStreamers();
  notified.delete(streamerId);
  localStorage.setItem(
    "mixchat_notified_streamers",
    JSON.stringify(Array.from(notified)),
  );
}
