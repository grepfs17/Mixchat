import type { EmoteCache, ChannelGroupCache } from "./types";

const DB_NAME = "mixchat_emotes";
const DB_VERSION = 1;
const STORE_NAME = "emotes";

type CacheRecord = {
  cacheKey: string;
  data: EmoteCache | ChannelGroupCache;
  updatedAt: number;
};

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
        db.createObjectStore(STORE_NAME, { keyPath: "cacheKey" });
      }
    };
  });
}

export async function getEmoteCache<T = EmoteCache>(
  cacheKey: string,
): Promise<T | null> {
  if (!isIDBAvailable()) {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return null;
      return (
        JSON.parse(raw).emotes ?? JSON.parse(raw).groups ?? JSON.parse(raw)
      );
    } catch {
      return null;
    }
  }

  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(cacheKey);

    const record = await new Promise<CacheRecord | undefined>(
      (resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      },
    );

    return (record?.data as T) ?? null;
  } catch {
    return null;
  }
}

export async function setEmoteCache(
  cacheKey: string,
  data: EmoteCache | ChannelGroupCache,
): Promise<void> {
  if (!isIDBAvailable()) {
    try {
      localStorage.setItem(cacheKey, JSON.stringify(data));
    } catch {
      // ignore storage errors
    }
    return;
  }

  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put({ cacheKey, data, updatedAt: Date.now() });

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("Failed to write emote cache to IndexedDB:", err);
  }
}

export async function deleteEmoteCache(cacheKey: string): Promise<void> {
  if (!isIDBAvailable()) {
    localStorage.removeItem(cacheKey);
    return;
  }

  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(cacheKey);

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("Failed to delete emote cache from IndexedDB:", err);
  }
}

export async function clearAllEmoteCaches(): Promise<void> {
  if (!isIDBAvailable()) {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("emotes_")) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
    return;
  }

  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.clear();

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("Failed to clear emote caches from IndexedDB:", err);
  }
}

/**
 * One-time migration: move `emotes_*` entries from localStorage to IndexedDB.
 * Safe to call repeatedly. Only migrates keys still present.
 */
export async function migrateEmoteCachesFromLocalStorage(): Promise<void> {
  if (!isIDBAvailable()) return;

  const keysToMigrate: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("emotes_")) {
      keysToMigrate.push(key);
    }
  }

  if (keysToMigrate.length === 0) return;

  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    for (const key of keysToMigrate) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const data = JSON.parse(raw);
        store.put({ cacheKey: key, data, updatedAt: Date.now() });
        localStorage.removeItem(key);
      } catch {
        // skip malformed entries
      }
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("Failed to migrate emote caches from localStorage:", err);
  }
}
