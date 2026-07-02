/**
 * IndexedDB mirror for the Song Queue streamer-side session.
 *
 * Purpose: the streamer UI can render the queue instantly without waiting for
 * the network. Mutations are optimistic: write to IDB first, then call the
 * server, and on failure the caller reverts.
 *
 * Keyed by `channelKey` (e.g. "twitch:streamerlogin" or
 * "youtube:UCxxxx") so a streamer running the tool on multiple channels at
 * once doesn't clobber their own state.
 */

import type { SongQueueItem, SongQueueSession } from "./types";

const DB_NAME = "mixchat_song_queue";
const DB_VERSION = 1;
const STORE_NAME = "songQueueSessions";

interface StoredRecord {
  channelKey: string;
  sessionId: string;
  ownerToken: string;
  session: SongQueueSession;
  updatedAt: number;
}

function isIDBAvailable(): boolean {
  return typeof window !== "undefined" && !!window.indexedDB;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "channelKey" });
        store.createIndex("sessionId", "sessionId", { unique: false });
      }
    };
  });
}

export async function saveSongQueueSession(
  channelKey: string,
  sessionId: string,
  ownerToken: string,
  session: SongQueueSession,
): Promise<void> {
  if (!isIDBAvailable()) return;
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const record: StoredRecord = {
      channelKey,
      sessionId,
      ownerToken,
      session,
      updatedAt: Date.now(),
    };
    store.put(record);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("Failed to save song queue session:", err);
  }
}

export async function loadSongQueueSession(
  channelKey: string,
): Promise<StoredRecord | null> {
  if (!isIDBAvailable()) return null;
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(channelKey);
    return await new Promise<StoredRecord | null>((resolve, reject) => {
      request.onsuccess = () => resolve((request.result as StoredRecord) || null);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn("Failed to load song queue session:", err);
    return null;
  }
}

export async function clearSongQueueSession(channelKey: string): Promise<void> {
  if (!isIDBAvailable()) return;
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(channelKey);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("Failed to clear song queue session:", err);
  }
}

/**
 * Merge a server-side session into the local mirror, preserving any pending
 * optimistic mutations that the server doesn't know about yet. This is a
 * simple union: server is the source of truth for known items, and any
 * local-only items (in `pendingLocalItems`) are appended at the end.
 */
export function reconcileSession(
  server: SongQueueSession,
  pendingLocalItems: SongQueueItem[] = [],
): SongQueueSession {
  if (pendingLocalItems.length === 0) return server;
  const serverIds = new Set(server.items.map((it) => it.id));
  const merged = [
    ...server.items,
    ...pendingLocalItems.filter((it) => !serverIds.has(it.id)),
  ];
  return { ...server, items: merged };
}
