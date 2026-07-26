/**
 * One-time localStorage key migration.
 *
 * React-doctor flagged all storage keys as unversioned. This module migrates
 * existing user data from the old keys to the new `:v1`-versioned keys so
 * nothing is lost on the first load after the update.
 *
 * The migration runs once per key — if the new key already exists it is left
 * untouched, and the old key is removed only after a successful copy.
 */

const KEY_MIGRATIONS: Array<[string, string]> = [
  ["mixchat_sessions", "mixchat_sessions:v1"],
  ["mixchat_favorite_channels", "mixchat_favorite_channels:v1"],
  ["mixchat_youtube_links", "mixchat_youtube_links:v1"],
  ["mixchat_giveaway_history", "mixchat_giveaway_history:v1"],
  [
    "mixchat_song_queue_past_playlists",
    "mixchat_song_queue_past_playlists:v1",
  ],
  ["mixchat_event_sounds", "mixchat_event_sounds:v1"],
  ["mixchat_watched_streamers", "mixchat_watched_streamers:v1"],
  ["mixchat_notified_streamers", "mixchat_notified_streamers:v1"],
];

function migrateKey(oldKey: string, newKey: string): void {
  try {
    if (localStorage.getItem(newKey) !== null) return; // already migrated
    const val = localStorage.getItem(oldKey);
    if (val === null) return; // nothing to migrate
    localStorage.setItem(newKey, val);
    localStorage.removeItem(oldKey);
  } catch {
    // storage quota exceeded or unavailable — skip silently
  }
}

// Run migration once at module load time (client-side only).
// The typeof guard handles SSR where localStorage is unavailable.
if (typeof localStorage !== "undefined") {
  for (const [oldKey, newKey] of KEY_MIGRATIONS) {
    migrateKey(oldKey, newKey);
  }
}

/** Re-export for tests that need to trigger migration manually. */
export function runStorageMigration(): void {
  for (const [oldKey, newKey] of KEY_MIGRATIONS) {
    migrateKey(oldKey, newKey);
  }
}
