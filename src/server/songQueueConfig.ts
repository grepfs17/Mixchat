import { join } from "path";
import type { SongQueueStoreOptions } from "./songQueueStore";

/**
 * Resolve the on-disk base directory for song queue sessions:
 * `MIXCHAT_SONG_QUEUE_DIR`, else `<cwd>/data/song-queue/sessions`.
 * Tests pass an explicit `baseDir` for isolation. The env override lets
 * deployments point the store at a mounted volume.
 */
export function getSongQueueStoreOptions(
  override?: string,
): SongQueueStoreOptions {
  const baseDir =
    override ||
    (typeof process !== "undefined" && process.env?.MIXCHAT_SONG_QUEUE_DIR) ||
    join(process.cwd(), "data", "song-queue", "sessions");
  return { baseDir };
}
