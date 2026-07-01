import { join } from "path";
import type { SongQueueStoreOptions } from "./songQueueStore";

/**
 * Resolve the on-disk base directory for song queue sessions.
 *
 * Resolution order:
 * 1. `process.env.MIXCHAT_SONG_QUEUE_DIR` if set.
 * 2. `<cwd>/data/song-queue/sessions` otherwise.
 *
 * In tests, callers should pass an explicit `baseDir` to keep each test
 * isolated. The env-var override exists so deployments can point the store
 * at a mounted volume without code changes.
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
