/**
 * IndexedDB store for Wheel Spin owner tokens.
 *
 * Tokens are capability keys that allow editing/deleting a wheel. They are
 * kept in IndexedDB (not localStorage) for consistency with the Song Queue
 * streamer session store.
 */

const DB_NAME = "mixchat_wheel";
const DB_VERSION = 1;
const STORE_NAME = "ownerTokens";

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
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

export async function getWheelToken(wheelId: string): Promise<string | null> {
  if (!isIDBAvailable()) return null;
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(wheelId);
    return await new Promise<string | null>((resolve, reject) => {
      request.onsuccess = () =>
        resolve(typeof request.result === "string" ? request.result : null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

export async function setWheelToken(
  wheelId: string,
  token: string,
): Promise<void> {
  if (!isIDBAvailable()) return;
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(token, wheelId);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Non-fatal: channel trust still allows managing the wheel.
  }
}

export async function removeWheelToken(wheelId: string): Promise<void> {
  if (!isIDBAvailable()) return;
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(wheelId);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Non-fatal.
  }
}
