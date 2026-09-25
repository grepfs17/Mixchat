import type { TwitchMessage, Platform } from "./types";
import { CHAT_HISTORY_MAX_AGE_HOURS } from "./types";

const DB_NAME = "mixchat_history";
const DB_VERSION = 4;
const STORE_NAME = "chatMessages";

/** Compound index used to page older messages for a channel by time. */
const CHANNEL_TIMESTAMP_INDEX = "channel_timestamp";

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
      // Only create the store if it doesn't exist; preserve any existing
      // user data and handle the case where another module (such as the
      // song-queue mirror in a different DB) shares this DB name with a
      // higher version number. Always re-create the indexes so the
      // schema stays consistent across upgrades.
      const indexSpecs: Array<[string, string | string[]]> = [
        ["author", "authorLower"],
        ["platform", "platform"],
        ["channel", "channel"],
        ["timestamp", "timestamp"],
        ["author_channel", ["authorLower", "channel"]],
        [CHANNEL_TIMESTAMP_INDEX, ["channel", "timestamp"]],
      ];
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: "messageKey",
        });
        for (const [name, keyPath] of indexSpecs) {
          store.createIndex(name, keyPath, { unique: false });
        }
      } else {
        // Existing store: (re-)create any missing indexes so the schema stays
        // consistent across upgrades (e.g. adding channel_timestamp in v4).
        const tx = (event.target as IDBOpenDBRequest).transaction!;
        const store = tx.objectStore(STORE_NAME);
        for (const [name, keyPath] of indexSpecs) {
          if (!store.indexNames.contains(name)) {
            store.createIndex(name, keyPath, { unique: false });
          }
        }
      }
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
          .flatMap((m) =>
            m.timestamp >= cutoff && (!platform || m.platform === platform)
              ? [{ ...m, timestamp: new Date(m.timestamp) }]
              : [],
          )
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

export interface GetChannelHistoryOptions {
  /** Return messages strictly older than this epoch-ms timestamp. */
  before?: number;
  /** Maximum number of messages to return. */
  limit?: number;
  /** Restrict to these platforms. When omitted, all platforms are returned. */
  platforms?: Platform[];
  /** Override the retention window; older messages are ignored. */
  maxAgeHours?: number;
}

/**
 * Pages a channel's persisted history, newest-first internally, and resolves
 * with the requested slice in ascending chronological order. Walks the
 * `channel_timestamp` compound index so only the relevant range is read.
 */
export async function getChannelHistory(
  channel: string,
  options: GetChannelHistoryOptions = {},
): Promise<TwitchMessage[]> {
  if (!isIDBAvailable() || !channel) return [];

  const {
    before = Date.now() + 1,
    limit = 100,
    platforms,
    maxAgeHours = CHAT_HISTORY_MAX_AGE_HOURS,
  } = options;

  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index(CHANNEL_TIMESTAMP_INDEX);

    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
    const lower = Math.max(cutoff, 0);
    const range = IDBKeyRange.bound(
      [channel, lower],
      [channel, before],
      false,
      true,
    );

    const collected: any[] = [];
    const toMessages = () =>
      collected
        .map((m) => ({ ...m, timestamp: new Date(m.timestamp) }))
        .sort(
          (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
        ) as TwitchMessage[];

    return new Promise((resolve, reject) => {
      const request = index.openCursor(range, "prev");
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(toMessages());
          return;
        }
        const value = cursor.value;
        if (!platforms || platforms.includes(value.platform)) {
          collected.push(value);
          if (collected.length >= limit) {
            resolve(toMessages());
            return;
          }
        }
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("Failed to fetch channel history from IndexedDB:", err);
    return [];
  }
}

/**
 * Prunes messages older than maxAgeHours.
 */
export async function pruneMessages(
  maxAgeHours: number = CHAT_HISTORY_MAX_AGE_HOURS,
): Promise<void> {
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
