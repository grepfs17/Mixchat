import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSongQueue } from "../../../src/hooks/chat/useSongQueue";
import type { SongQueueSession } from "../../../src/lib/songQueue/types";
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

function makeSession(
  overrides: Partial<SongQueueSession> = {},
): SongQueueSession {
  return {
    sessionId: "sess-1",
    title: "Mod queue",
    channelName: "alice",
    channelPlatform: "twitch",
    ownerTokenHash: "",
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    isPublic: false,
    currentIndex: 0,
    announcedItemId: null,
    version: 1,
    ended: false,
    items: [
      {
        id: "i1",
        videoId: "dQw4w9WgXcQ",
        title: "Never Gonna Give You Up",
        channelTitle: "Rick Astley",
        thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        durationSec: 213,
        submitter: { userId: "u1", author: "Alice", platform: "twitch" },
        submittedAt: new Date().toISOString(),
        status: "pending",
      },
    ],
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const originalFetch = globalThis.fetch;

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
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  globalThis.fetch = originalFetch;
  delete (globalThis as any).indexedDB;
  delete (globalThis as any).IDBKeyRange;
  delete (globalThis as any).IDBDatabase;
  delete (globalThis as any).IDBTransaction;
  delete (globalThis as any).IDBRequest;
  delete (globalThis as any).IDBOpenDBRequest;
  delete (globalThis as any).IDBCursor;
  delete (globalThis as any).IDBCursorWithValue;
});

describe("useSongQueue idle adoption", () => {
  it("adopts a queue a mod opens after this page mounted", async () => {
    const active = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ session: null }))
      .mockResolvedValue(jsonResponse({ session: makeSession() }));

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/song-queue/active")) return active();
      return jsonResponse({ error: "unexpected" }, 404);
    }) as typeof fetch;

    const { result } = renderHook(() =>
      useSongQueue({
        channelKey: "twitch:alice",
        owner: { twitchBroadcasterId: "1" },
        enabled: true,
      }),
    );

    // Mount hydration finds no queue.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.phase).toBe("idle");

    // Idle poll fires after 3s and picks up the mod's queue.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.phase).toBe("open");
    expect(result.current.bootstrap?.sessionId).toBe("sess-1");
    expect(result.current.items).toHaveLength(1);
    expect(result.current.currentItem?.videoId).toBe("dQw4w9WgXcQ");
    expect(active).toHaveBeenCalledTimes(2);
  });

  it("stays idle when no queue exists across multiple polls", async () => {
    const active = vi.fn().mockResolvedValue(jsonResponse({ session: null }));
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/song-queue/active")) return active();
      return jsonResponse({ error: "unexpected" }, 404);
    }) as typeof fetch;

    const { result } = renderHook(() =>
      useSongQueue({
        channelKey: "twitch:alice",
        owner: { twitchBroadcasterId: "1" },
        enabled: true,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9500);
    });

    expect(result.current.phase).toBe("idle");
    expect(result.current.bootstrap).toBeNull();
    // Mount adopt + three idle ticks.
    expect(active.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("ends the queue on 410 so a mod close stops the streamer client", async () => {
    let queueEnded = false;
    let adoptCount = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/song-queue/active")) {
        adoptCount += 1;
        // Mount finds nothing; first idle tick adopts the mod's queue.
        if (adoptCount === 1) return jsonResponse({ session: null });
        if (queueEnded) return jsonResponse({ session: null });
        return jsonResponse({ session: makeSession() });
      }
      if (url.includes("/api/song-queue/sess-1")) {
        if (queueEnded) {
          return jsonResponse({ error: "Session ended" }, 410);
        }
        return jsonResponse(makeSession());
      }
      return jsonResponse({ error: "unexpected" }, 404);
    }) as typeof fetch;

    const { result } = renderHook(() =>
      useSongQueue({
        channelKey: "twitch:alice",
        owner: { twitchBroadcasterId: "1" },
        enabled: true,
      }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.phase).toBe("idle");

    // Idle poll adopts the open queue.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.phase).toBe("open");
    expect(result.current.bootstrap?.sessionId).toBe("sess-1");

    // Mod ends the queue; next poll receives 410.
    queueEnded = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.phase).not.toBe("open");
    expect(result.current.bootstrap).toBeNull();
  });
});
