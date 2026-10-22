/**
 * IndexedDB persistence for the Music Player streamer tool.
 *
 * Schema (v1):
 *   - `musicPlaylists`: keyed by `MusicPlaylist.id`, one row per playlist, so
 *     per-playlist reads/writes are atomic.
 *   - `musicPlayerSettings`: key-less single record at
 *     MUSIC_PLAYER_SETTINGS_RECORD_ID for global scalars (activePlaylistId,
 *     currentIndex, volume, loop). Volume changes don't rewrite playlists.
 *
 * Mirrors `lib/songQueue/idb.ts`: a tiny wrapper with no third-party deps.
 */

import {
  DEFAULT_MUSIC_PLAYER_SETTINGS,
  settingsRecordId,
  type MusicPlayerSettings,
  type MusicPlaylist,
} from "./types";

const DB_NAME = "mixchat_music_player";
const DB_VERSION = 1;
const PLAYLISTS_STORE = "musicPlaylists";
const SETTINGS_STORE = "musicPlayerSettings";

function isIDBAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.indexedDB !== "undefined"
  );
}

/**
 * Open the database and create the stores if this is the first run.
 *
 * Race-friendly: concurrent callers share a single in-flight `openDB`
 * promise so we don't blow through the IDB lock. The promise is also
 * cached after success so subsequent calls reuse the same connection,
 * opening a new IDB connection on every write is measurable overhead.
 *
 * Tests that swap `globalThis.indexedDB` for a fresh `fake-indexeddb`
 * factory MUST call `_resetForTests()` to drop the cached promise so
 * the new factory is used. See `test/hooks/useMusicPlayer.test.tsx`.
 */
let openPromise: Promise<IDBDatabase> | null = null;
function openDB(): Promise<IDBDatabase> {
  if (openPromise) return openPromise;
  if (!isIDBAvailable()) {
    return Promise.reject(new Error("IndexedDB is not available"));
  }
  const promise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(PLAYLISTS_STORE)) {
        db.createObjectStore(PLAYLISTS_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE);
      }
    };
  });
  openPromise = promise;
  return promise;
}

/**
 * Test-only helper. Drops the cached `openPromise` so the next call reopens
 * against whatever `globalThis.indexedDB` currently points at. Tests that swap
 * the IDB factory between cases MUST call this in beforeEach, or the cached
 * connection leaks reads/writes to the wrong DB.
 */
export function _resetForTests(): void {
  openPromise = null;
}

function reqAsPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txAsPromise(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
  });
}

/**
 * Read all playlists. Returns an empty array if the store is fresh.
 * Filters out malformed rows defensively so a corrupted entry doesn't
 * blow up the whole UI.
 */
export async function loadAllPlaylists(): Promise<MusicPlaylist[]> {
  if (!isIDBAvailable()) return [];
  try {
    const db = await openDB();
    const tx = db.transaction(PLAYLISTS_STORE, "readonly");
    const store = tx.objectStore(PLAYLISTS_STORE);
    const all = await reqAsPromise<MusicPlaylist[]>(
      store.getAll() as IDBRequest<MusicPlaylist[]>,
    );
    await txAsPromise(tx);
    if (!Array.isArray(all)) return [];
    return all.filter(isValidPlaylist);
  } catch (err) {
    console.warn("[music-player] failed to load playlists", err);
    return [];
  }
}

export async function savePlaylist(playlist: MusicPlaylist): Promise<void> {
  if (!isIDBAvailable()) return;
  try {
    const db = await openDB();
    const tx = db.transaction(PLAYLISTS_STORE, "readwrite");
    const store = tx.objectStore(PLAYLISTS_STORE);
    store.put(playlist);
    await txAsPromise(tx);
  } catch (err) {
    console.warn("[music-player] failed to save playlist", err);
  }
}

export async function deletePlaylistFromIDB(id: string): Promise<void> {
  if (!isIDBAvailable()) return;
  try {
    const db = await openDB();
    const tx = db.transaction(PLAYLISTS_STORE, "readwrite");
    const store = tx.objectStore(PLAYLISTS_STORE);
    store.delete(id);
    await txAsPromise(tx);
  } catch (err) {
    console.warn("[music-player] failed to delete playlist", err);
  }
}

/**
 * Read the single global settings record. Returns the defaults if either
 * the store is empty or the row is malformed. Picking defaults over
 * throwing keeps the UI usable even after a botched migration.
 */
export async function loadSettings(): Promise<MusicPlayerSettings> {
  if (!isIDBAvailable()) return { ...DEFAULT_MUSIC_PLAYER_SETTINGS };
  try {
    const db = await openDB();
    const tx = db.transaction(SETTINGS_STORE, "readonly");
    const store = tx.objectStore(SETTINGS_STORE);
    const row = await reqAsPromise<MusicPlayerSettings | undefined>(
      store.get(settingsRecordId()) as IDBRequest<
        MusicPlayerSettings | undefined
      >,
    );
    await txAsPromise(tx);
    return sanitizeSettings(row);
  } catch (err) {
    console.warn("[music-player] failed to load settings", err);
    return { ...DEFAULT_MUSIC_PLAYER_SETTINGS };
  }
}

export async function saveSettings(
  settings: MusicPlayerSettings,
): Promise<void> {
  if (!isIDBAvailable()) return;
  try {
    const db = await openDB();
    const tx = db.transaction(SETTINGS_STORE, "readwrite");
    const store = tx.objectStore(SETTINGS_STORE);
    store.put(settings, settingsRecordId());
    await txAsPromise(tx);
  } catch (err) {
    console.warn("[music-player] failed to save settings", err);
  }
}

// ---- shape validation ----

function isValidPlaylist(p: unknown): p is MusicPlaylist {
  if (!p || typeof p !== "object") return false;
  const obj = p as Partial<MusicPlaylist>;
  return (
    typeof obj.id === "string" &&
    typeof obj.name === "string" &&
    Array.isArray(obj.items) &&
    typeof obj.createdAt === "string" &&
    typeof obj.updatedAt === "string"
  );
}

function sanitizeSettings(
  row: MusicPlayerSettings | undefined,
): MusicPlayerSettings {
  if (!row || typeof row !== "object") {
    return { ...DEFAULT_MUSIC_PLAYER_SETTINGS };
  }
  return {
    activePlaylistId:
      typeof row.activePlaylistId === "string" || row.activePlaylistId === null
        ? row.activePlaylistId
        : null,
    currentIndex:
      typeof row.currentIndex === "number" && row.currentIndex >= 0
        ? Math.floor(row.currentIndex)
        : 0,
    volume:
      typeof row.volume === "number" && row.volume >= 0 && row.volume <= 100
        ? row.volume
        : DEFAULT_MUSIC_PLAYER_SETTINGS.volume,
    loop:
      typeof row.loop === "boolean"
        ? row.loop
        : DEFAULT_MUSIC_PLAYER_SETTINGS.loop,
    miniBarHidden:
      typeof row.miniBarHidden === "boolean"
        ? row.miniBarHidden
        : DEFAULT_MUSIC_PLAYER_SETTINGS.miniBarHidden,
  };
}
