import type { SongQueueItem } from "../songQueue/types";

/** Client-side snapshot of ended song queues, so they survive server-side GC. */
export interface PastPlaylistEntry {
  id: string;
  /** ISO timestamp of when the queue was ended. */
  endedAt: string;
  /** ISO timestamp of when the queue was created. */
  createdAt: string;
  title: string;
  channelName: string;
  channelPlatform: string;
  itemCount: number;
  playedCount: number;
  skippedCount: number;
  items: Array<
    Pick<
      SongQueueItem,
      | "id"
      | "videoId"
      | "title"
      | "channelTitle"
      | "thumbnail"
      | "status"
      | "submittedAt"
      | "durationSec"
    > & {
      submitter: Pick<SongQueueItem["submitter"], "author" | "platform">;
    }
  >;
}

const STORAGE_KEY = "mixchat_song_queue_past_playlists";
const MAX_ENTRIES = 50;

function readStorage(): PastPlaylistEntry[] {
  if (typeof localStorage === "undefined") return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is PastPlaylistEntry =>
        e &&
        typeof e.id === "string" &&
        typeof e.endedAt === "string" &&
        typeof e.title === "string" &&
        Array.isArray(e.items),
    );
  } catch {
    return [];
  }
}

function writeStorage(entries: PastPlaylistEntry[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Quota/disabled storage: ignore so the rest of the app keeps working.
  }
}

export function getPastPlaylists(): PastPlaylistEntry[] {
  return readStorage();
}

export function appendPastPlaylist(
  entry: Omit<PastPlaylistEntry, "id" | "endedAt">,
): PastPlaylistEntry {
  const full: PastPlaylistEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    endedAt: new Date().toISOString(),
  };
  const existing = readStorage();
  const updated = [full, ...existing].slice(0, MAX_ENTRIES);
  writeStorage(updated);
  return full;
}

export function removePastPlaylist(id: string): void {
  const existing = readStorage();
  const updated = existing.filter((e) => e.id !== id);
  writeStorage(updated);
}

export function clearPastPlaylists(): void {
  writeStorage([]);
}
