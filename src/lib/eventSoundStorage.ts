/**
 * Event sound storage backed by IndexedDB.
 *
 * Audio files are stored as Blobs (efficient binary storage).
 * The React state still holds data URLs for playback,
 * but persistence uses IndexedDB to avoid localStorage's ~5-10 MB limit.
 *
 * Falls back gracefully to localStorage in environments without IndexedDB
 * (e.g. jsdom, private browsing with restrictions).
 */

const DB_NAME = "mixchat";
const DB_VERSION = 1;
const STORE_NAME = "eventSounds";

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
        db.createObjectStore(STORE_NAME, { keyPath: "eventType" });
      }
    };
  });
}

/** Convert a base64 data URL to a Blob without fetch(). */
function dataUrlToBlob(dataUrl: string): Blob {
  const commaIdx = dataUrl.indexOf(",");
  const header = dataUrl.slice(0, commaIdx);
  const body = dataUrl.slice(commaIdx + 1);

  const mimeMatch = header.match(/:(.*?)(;|$)/);
  const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
  const isBase64 = header.includes(";base64");

  if (isBase64) {
    const binary = atob(body);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i);
    }
    return new Blob([array], { type: mime });
  }

  // URL-encoded (unlikely for audio, but handled for completeness)
  const decoded = decodeURIComponent(body);
  return new Blob([decoded], { type: mime });
}

/** Convert a Blob back to a base64 data URL. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Persist event sounds to IndexedDB (or localStorage as fallback).
 * Passing an empty object clears the store.
 */
export async function saveEventSounds(
  sounds: Record<string, string>,
): Promise<void> {
  if (!isIDBAvailable()) {
    localStorage.setItem("mixchat_event_sounds:v1", JSON.stringify(sounds));
    return;
  }

  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    store.clear();

    for (const [eventType, dataUrl] of Object.entries(sounds)) {
      const blob = dataUrlToBlob(dataUrl);
      store.put({ eventType, blob, updatedAt: Date.now() });
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn(
      "Failed to save event sounds to IndexedDB, falling back to localStorage:",
      err,
    );
    localStorage.setItem("mixchat_event_sounds:v1", JSON.stringify(sounds));
  }
}

/**
 * Load event sounds from IndexedDB.
 * Automatically migrates legacy localStorage data on first run.
 */
export async function loadEventSounds(): Promise<Record<
  string,
  string
> | null> {
  if (!isIDBAvailable()) {
    const saved = localStorage.getItem("mixchat_event_sounds:v1");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  }

  let fromDB: Record<string, string> | null = null;
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();

    fromDB = await new Promise<Record<string, string> | null>(
      (resolve, reject) => {
        req.onsuccess = async () => {
          const records = req.result as Array<{
            eventType: string;
            blob: Blob;
          }>;
          if (!records.length) {
            resolve(null);
            return;
          }
          const pairs = await Promise.all(
            records.map(async (r) => [r.eventType, await blobToDataUrl(r.blob)] as const),
          );
          const result: Record<string, string> = Object.fromEntries(pairs);
          resolve(result);
        };
        req.onerror = () => reject(req.error);
      },
    );
  } catch {
    // IndexedDB read failed — will fall through to localStorage legacy check
  }

  if (fromDB && Object.keys(fromDB).length > 0) {
    return fromDB;
  }

  // Check for legacy localStorage data and migrate    // Read from the legacy unversioned key to migrate pre-existing user data
    const legacy = localStorage.getItem("mixchat_event_sounds");
    if (legacy) {
      try {
        const parsed = JSON.parse(legacy);
        await saveEventSounds(parsed);
        localStorage.removeItem("mixchat_event_sounds");
      return parsed;
    } catch {
      return null;
    }
  }

  return null;
}

/** Remove all persisted event sounds. */
async function clearEventSounds(): Promise<void> {
  if (!isIDBAvailable()) {
    localStorage.removeItem("mixchat_event_sounds:v1");
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
    console.warn("Failed to clear IndexedDB event sounds:", err);
    localStorage.removeItem("mixchat_event_sounds:v1");
  }
}
