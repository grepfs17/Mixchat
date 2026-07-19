/**
 * Music Player streamer tool.
 *
 * Architecture:
 * - Streamer-only: no chat ingestion, no public share page, no submitter.
 * - Persistence via IndexedDB. Two stores:
 *     - "musicPlaylists" — one row per MusicPlaylist, keyed by playlist id.
 *     - "musicPlayerSettings" — a single record holding global scalar
 *       preferences (active playlist id, current index, volume, loop).
 *   Putting prefs in their own store avoids re-writing every playlist when
 *   the streamer just nudges the volume slider.
 * - YouTube metadata is fetched the same way Song Queue does it: the
 *   public `youtube.com/oembed` endpoint, which requires no OAuth scope
 *   (see `songQueue/oembed.ts`). We deliberately reuse `parseYouTubeId`
 *   from `songQueue/types.ts` so the YouTube URL grammar stays in one
 *   place.
 */

export interface MusicPlayerItem {
  /**
   * Unique id so the same videoId can appear twice in the playlist without
   * collision when the streamer re-adds it.
   */
  id: string;
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  /** Duration in seconds. 0 until the player reports it. */
  durationSec: number;
}

export interface MusicPlaylist {
  id: string;
  name: string;
  items: MusicPlayerItem[];
  createdAt: string;
  updatedAt: string;
  /** Twitch category (game) id — auto-selects this playlist when the stream matches. */
  categoryId: string | null;
  /** Human-readable category name for display. */
  categoryName: string;
}

/**
 * Global, non-per-playlist state. Persisted as a single IDB record in
 * `musicPlayerSettings` so volume / active-Playlist changes don't rewrite
 * the playlists store.
 */
export interface MusicPlayerSettings {
  activePlaylistId: string | null;
  /** Index into the active playlist's items. */
  currentIndex: number;
  /** Last volume the streamer set (0–100). */
  volume: number;
  /** Loop the active playlist when it reaches the end. */
  loop: boolean;
  /** True when the streamer dismissed the mini bar. Persisted across reloads. */
  miniBarHidden: boolean;
}

export const DEFAULT_MUSIC_PLAYER_SETTINGS: MusicPlayerSettings = {
  activePlaylistId: null,
  currentIndex: 0,
  volume: 100,
  loop: true,
  miniBarHidden: false,
};

/** Hard ceilings — keep the IDB blob bounded. */
export const MAX_PLAYLISTS = 20;
export const MAX_TRACKS_PER_PLAYLIST = 200;

/**
 * Single key under which the settings record is stored. Using a literal
 * string instead of a keyPath since `musicPlayerSettings` is a key-less
 * store and we just `put` the record at this primary key.
 */
export const MUSIC_PLAYER_SETTINGS_RECORD_ID = "current";

/** Stable identifier of the active settings record. */
export function settingsRecordId(): string {
  return MUSIC_PLAYER_SETTINGS_RECORD_ID;
}

function genId(): string {
  if (
    typeof globalThis !== "undefined" &&
    typeof globalThis.crypto?.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `mp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function makePlaylistId(): string {
  return genId();
}

export function makeTrackId(): string {
  return genId();
}
