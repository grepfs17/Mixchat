import type { TwitchMessage, Platform } from "./types";

const DB_NAME = "mixchat_history";
const DB_VERSION = 2;
const STORE_NAME = "chatMessages";

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
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      const store = db.createObjectStore(STORE_NAME, { keyPath: "messageKey" });
      store.createIndex("author", "authorLower", { unique: false });
      store.createIndex("platform", "platform", { unique: false });
      store.createIndex("channel", "channel", { unique: false });
      store.createIndex("timestamp", "timestamp", { unique: false });
      store.createIndex("author_channel", ["authorLower", "channel"], {
        unique: false,
      });
    };
  });
}

/**
 * Persists a message to IndexedDB.
 */
export async function saveMessage(
  msg: TwitchMessage,
  channel: string,
): Promise<void> {
  if (!isIDBAvailable()) return;

  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    const authorLower = msg.author.toLowerCase();
    const messageKey = `${msg.platform || "twitch"}:${msg.id}`;

    const messageToStore = {
      ...msg,
      messageKey,
      authorLower,
      channel,
      timestamp:
        msg.timestamp instanceof Date ? msg.timestamp.getTime() : msg.timestamp,
    };

    store.put(messageToStore);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("Failed to save message to IndexedDB:", err);
  }
}

/**
 * Retrieves chat history for a specific user in a channel.
 */
export async function getUserHistory(
  author: string,
  channel: string,
  maxAgeHours: number = 24,
  platform?: Platform,
): Promise<TwitchMessage[]> {
  if (!isIDBAvailable()) return [];

  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("author_channel");

    const authorLower = author.toLowerCase();
    const range = IDBKeyRange.only([authorLower, channel]);
    const request = index.getAll(range);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const results = request.result as any[];
        const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;

        const filtered = results
          .filter((m) => m.timestamp >= cutoff)
          .filter((m) => !platform || m.platform === platform)
          .map((m) => ({
            ...m,
            timestamp: new Date(m.timestamp),
          }))
          .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

        resolve(filtered);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("Failed to fetch user history from IndexedDB:", err);
    return [];
  }
}

/**
 * Prunes messages older than maxAgeHours.
 */
export async function pruneMessages(maxAgeHours: number = 24): Promise<void> {
  if (!isIDBAvailable()) return;

  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("timestamp");

    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
    const range = IDBKeyRange.upperBound(cutoff);

    const request = index.openKeyCursor(range);

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        store.delete(cursor.primaryKey);
        cursor.continue();
      }
    };

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("Failed to prune IndexedDB messages:", err);
  }
}
