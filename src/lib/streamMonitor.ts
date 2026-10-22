import { getStreamStatuses } from "./twitch";

export interface StreamerToWatch {
  id: string;
  name: string;
  displayName: string;
  profileImageUrl?: string;
}

export interface LiveStreamer extends StreamerToWatch {
  isLive: true;
  title?: string;
  gameName?: string;
  viewerCount?: number;
}

/** Returns the subset of streamers currently live, in one batched API call. */
export async function checkLiveStreamers(
  streamersToWatch: StreamerToWatch[],
  accessToken: string,
  clientId: string,
): Promise<LiveStreamer[]> {
  if (!streamersToWatch.length) return [];

  try {
    const streamerIds = streamersToWatch.map((s) => s.id);

    const statuses = await getStreamStatuses(
      accessToken,
      clientId,
      streamerIds,
    );

    const liveStreamers: LiveStreamer[] = streamersToWatch
      .flatMap((streamer) => {
        const s = statuses[streamer.id];
        if (!s?.isLive) return [];
        return [{
          ...streamer,
          isLive: true as const,
          title: s.title,
          gameName: s.gameName,
          viewerCount: s.viewerCount,
        }];
      });

    return liveStreamers;
  } catch (error) {
    console.error("Error checking live streamers:", error);
    throw error;
  }
}

export function getWatchedStreamers(): StreamerToWatch[] {
  const saved = localStorage.getItem("mixchat_watched_streamers:v1");
  if (!saved) return [];
  try {
    return JSON.parse(saved);
  } catch (error) {
    console.error("Failed to parse watched streamers:", error);
    return [];
  }
}

function saveWatchedStreamers(streamers: StreamerToWatch[]): void {
  localStorage.setItem("mixchat_watched_streamers:v1", JSON.stringify(streamers));
}

export function addWatchedStreamer(streamer: StreamerToWatch): void {
  const current = getWatchedStreamers();
  if (!current.find((s) => s.id === streamer.id)) {
    saveWatchedStreamers([...current, streamer]);
  }
}

export function removeWatchedStreamer(streamerId: string): void {
  const current = getWatchedStreamers();
  saveWatchedStreamers(current.filter((s) => s.id !== streamerId));
}

export function getNotifiedStreamers(): Set<string> {
  const saved = localStorage.getItem("mixchat_notified_streamers:v1");
  if (!saved) return new Set();
  try {
    return new Set(JSON.parse(saved));
  } catch (error) {
    console.error("Failed to parse notified streamers:", error);
    return new Set();
  }
}

export function markStreamerNotified(streamerId: string): void {
  const notified = getNotifiedStreamers();
  notified.add(streamerId);
  localStorage.setItem(
    "mixchat_notified_streamers:v1",
    JSON.stringify(Array.from(notified)),
  );
}

export function markStreamerOffline(streamerId: string): void {
  const notified = getNotifiedStreamers();
  notified.delete(streamerId);
  localStorage.setItem(
    "mixchat_notified_streamers:v1",
    JSON.stringify(Array.from(notified)),
  );
}

export function getSystemNotificationsEnabled(): boolean {
  try {
    return localStorage.getItem("mixchat_system_notifications") !== "false";
  } catch {
    return true;
  }
}

export function setSystemNotificationsEnabled(enabled: boolean): void {
  localStorage.setItem("mixchat_system_notifications", String(enabled));
}
