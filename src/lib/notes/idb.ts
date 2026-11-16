/**
 * IndexedDB persistence for viewer stream notes.
 *
 * Schema (v1):
 *   - `notes`: keyed by `StreamNote.id`, one row per note.
 *   - `channel` index: loads a channel's notes in one read.
 *
 * Mirrors `lib/musicPlayer/idb.ts`: a tiny dependency-free wrapper that
 * swallows storage failures so the UI stays usable.
 */

import {
  MAX_NOTES_PER_CHANNEL,
  normalizeNote,
  type StreamNote,
} from "./types";

const DB_NAME = "mixchat_notes";
const DB_VERSION = 1;
const STORE_NAME = "notes";
const CHANNEL_INDEX = "channel";

function isIDBAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.indexedDB !== "undefined"
  );
}

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
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex(CHANNEL_INDEX, "channel", { unique: false });
      }
    };
  });
  openPromise = promise;
  return promise;
}

/**
 * Test-only helper. Drops the cached connection so the next call reopens
 * against whatever `globalThis.indexedDB` currently points at.
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

function byNewestFirst(a: StreamNote, b: StreamNote): number {
  return b.timestampMs - a.timestampMs;
}

/** Channel notes newest first. Empty when IndexedDB is unavailable. */
export async function loadChannelNotes(
  channel: string,
): Promise<StreamNote[]> {
  if (!isIDBAvailable() || !channel) return [];
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const index = tx.objectStore(STORE_NAME).index(CHANNEL_INDEX);
    const all = await reqAsPromise<StreamNote[]>(
      index.getAll(IDBKeyRange.only(channel)) as IDBRequest<StreamNote[]>,
    );
    await txAsPromise(tx);
    return all
      .map(normalizeNote)
      .filter((note): note is StreamNote => note !== null)
      .sort(byNewestFirst);
  } catch (err) {
    console.warn("[stream-notes] failed to load notes", err);
    return [];
  }
}

/** Every note across channels, used by settings backup/restore. */
export async function loadAllNotes(): Promise<StreamNote[]> {
  if (!isIDBAvailable()) return [];
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const all = await reqAsPromise<StreamNote[]>(
      store.getAll() as IDBRequest<StreamNote[]>,
    );
    await txAsPromise(tx);
    return all
      .map(normalizeNote)
      .filter((note): note is StreamNote => note !== null);
  } catch (err) {
    console.warn("[stream-notes] failed to load all notes", err);
    return [];
  }
}

/** Insert or replace a note, then trim the channel to its newest cap. */
export async function saveNote(note: StreamNote): Promise<void> {
  if (!isIDBAvailable()) return;
  const record = normalizeNote(note);
  if (!record) return;
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record);
    await txAsPromise(tx);
    await enforceChannelCap(record.channel);
  } catch (err) {
    console.warn("[stream-notes] failed to save note", err);
  }
}

export async function deleteNote(id: string): Promise<void> {
  if (!isIDBAvailable() || !id) return;
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    await txAsPromise(tx);
  } catch (err) {
    console.warn("[stream-notes] failed to delete note", err);
  }
}

/**
 * Restore notes from a backup. Malformed rows are dropped and each channel is
 * trimmed to the cap. Returns the number of notes written.
 */
export async function importNotes(values: unknown): Promise<number> {
  if (!isIDBAvailable() || !Array.isArray(values)) return 0;
  const notes = values
    .map(normalizeNote)
    .filter((note): note is StreamNote => note !== null);
  if (notes.length === 0) return 0;
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    for (const note of notes) store.put(note);
    await txAsPromise(tx);
    const channels = new Set(notes.map((note) => note.channel));
    for (const channel of channels) await enforceChannelCap(channel);
    return notes.length;
  } catch (err) {
    console.warn("[stream-notes] failed to import notes", err);
    return 0;
  }
}

async function enforceChannelCap(channel: string): Promise<void> {
  const notes = await loadChannelNotes(channel);
  if (notes.length <= MAX_NOTES_PER_CHANNEL) return;
  const overflow = notes.slice(MAX_NOTES_PER_CHANNEL);
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  for (const note of overflow) store.delete(note.id);
  await txAsPromise(tx);
}
