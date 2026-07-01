import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  IDBFactory,
  IDBKeyRange,
  IDBDatabase,
  IDBTransaction,
  IDBRequest,
  IDBOpenDBRequest,
  IDBCursor,
  IDBCursorWithValue,
} from "fake-indexeddb";
import {
  saveSongQueueSession,
  loadSongQueueSession,
  clearSongQueueSession,
  reconcileSession,
} from "../../../src/lib/songQueue/idb";
import type { SongQueueItem, SongQueueSession } from "../../../src/lib/songQueue/types";

function makeItem(id: string, videoId: string): SongQueueItem {
  return {
    id,
    videoId,
    title: `Title ${id}`,
    channelTitle: "Channel",
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    durationSec: 0,
    submitter: {
      userId: "u1",
      author: "Alice",
      platform: "twitch",
    },
    submittedAt: new Date().toISOString(),
    status: "pending",
  };
}

function makeSession(items: SongQueueItem[]): SongQueueSession {
  return {
    sessionId: "session-1",
    title: "Test",
    channelName: "testchannel",
    channelPlatform: "twitch",
    ownerTokenHash: "h",
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    isPublic: true,
    currentIndex: 0,
    version: 0,
    ended: false,
    items,
  };
}

describe("songQueue IDB mirror", () => {
  beforeEach(() => {
    const factory = new IDBFactory();
    (globalThis as any).indexedDB = factory;
    (globalThis as any).IDBKeyRange = IDBKeyRange;
    (globalThis as any).IDBDatabase = IDBDatabase;
    (globalThis as any).IDBTransaction = IDBTransaction;
    (globalThis as any).IDBRequest = IDBRequest;
    (globalThis as any).IDBOpenDBRequest = IDBOpenDBRequest;
    (globalThis as any).IDBCursor = IDBCursor;
    (globalThis as any).IDBCursorWithValue = IDBCursorWithValue;
  });

  afterEach(() => {
    delete (globalThis as any).indexedDB;
    delete (globalThis as any).IDBKeyRange;
    delete (globalThis as any).IDBDatabase;
    delete (globalThis as any).IDBTransaction;
    delete (globalThis as any).IDBRequest;
    delete (globalThis as any).IDBOpenDBRequest;
    delete (globalThis as any).IDBCursor;
    delete (globalThis as any).IDBCursorWithValue;
  });

  it("saves and loads a session by channelKey", async () => {
    const session = makeSession([makeItem("i1", "dQw4w9WgXcQ")]);
    await saveSongQueueSession("twitch:alice", "session-1", "token-1", session);
    const loaded = await loadSongQueueSession("twitch:alice");
    expect(loaded).not.toBeNull();
    expect(loaded?.sessionId).toBe("session-1");
    expect(loaded?.ownerToken).toBe("token-1");
    expect(loaded?.session.items).toHaveLength(1);
    expect(loaded?.session.items[0].videoId).toBe("dQw4w9WgXcQ");
  });

  it("returns null for an unknown channelKey", async () => {
    const loaded = await loadSongQueueSession("twitch:unknown");
    expect(loaded).toBeNull();
  });

  it("overwrites the same channelKey with a new session", async () => {
    const sessionA = makeSession([makeItem("i1", "AAAAAAAAAAA")]);
    const sessionB = makeSession([makeItem("i2", "BBBBBBBBBBB")]);
    await saveSongQueueSession("twitch:alice", "s1", "t1", sessionA);
    await saveSongQueueSession("twitch:alice", "s2", "t2", sessionB);
    const loaded = await loadSongQueueSession("twitch:alice");
    expect(loaded?.sessionId).toBe("s2");
    expect(loaded?.session.items[0].videoId).toBe("BBBBBBBBBBB");
  });

  it("clears the record", async () => {
    await saveSongQueueSession("twitch:alice", "s1", "t1", makeSession([]));
    await clearSongQueueSession("twitch:alice");
    const loaded = await loadSongQueueSession("twitch:alice");
    expect(loaded).toBeNull();
  });
});

describe("reconcileSession", () => {
  it("returns the server session when no pending items", () => {
    const server = makeSession([makeItem("i1", "AAAAAAAAAAA")]);
    expect(reconcileSession(server, [])).toBe(server);
  });

  it("appends pending local items that are not on the server", () => {
    const server = makeSession([makeItem("i1", "AAAAAAAAAAA")]);
    const local = makeItem("i2", "BBBBBBBBBBB");
    const merged = reconcileSession(server, [local]);
    expect(merged.items).toHaveLength(2);
    expect(merged.items[1].id).toBe("i2");
  });

  it("does not duplicate items that the server already has", () => {
    const server = makeSession([makeItem("i1", "AAAAAAAAAAA")]);
    const local = makeItem("i1", "AAAAAAAAAAA");
    const merged = reconcileSession(server, [local]);
    expect(merged.items).toHaveLength(1);
  });
});
