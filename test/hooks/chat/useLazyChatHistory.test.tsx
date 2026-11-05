import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
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
import { useLazyChatHistory } from "../../../src/hooks/chat/useLazyChatHistory";
import { saveMessage } from "../../../src/lib/chatHistoryStorage";
import type { Platform, TwitchMessage } from "../../../src/lib/types";

function makeMessage(
  id: string,
  timestamp: number,
  platform: "twitch" | "youtube" = "twitch",
): TwitchMessage {
  return {
    id,
    platform,
    author: "User",
    content: id,
    timestamp: new Date(timestamp),
  };
}

describe("useLazyChatHistory", () => {
  let container: HTMLDivElement;

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

    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    delete (globalThis as any).indexedDB;
    delete (globalThis as any).IDBKeyRange;
    delete (globalThis as any).IDBDatabase;
    delete (globalThis as any).IDBTransaction;
    delete (globalThis as any).IDBRequest;
    delete (globalThis as any).IDBOpenDBRequest;
    delete (globalThis as any).IDBCursor;
    delete (globalThis as any).IDBCursorWithValue;
  });

  const baseOptions = () => {
    const containerRef = { current: container };
    return {
      channel: "testchannel",
      enabled: true,
      platforms: ["twitch"] as Platform[],
      containerRef,
      keyOf: (m: TwitchMessage) => `twitch:${m.id}`,
      timestampOf: (m: TwitchMessage) => m.timestamp.getTime(),
      isOptimistic: (m: TwitchMessage) => m.optimistic === true,
      mapStored: (m: TwitchMessage) => m,
      pageSize: 3,
      maxHistory: 100,
    };
  };

  it("loads older messages from IndexedDB when scrolled to the top", async () => {
    const now = Date.now();
    const live = [
      makeMessage("live0", now - 1000),
      makeMessage("live1", now - 900),
      makeMessage("live2", now - 800),
    ];
    for (let i = 1; i <= 5; i++) {
      await saveMessage(makeMessage(`old${i}`, now - 1000 - i * 1000), "testchannel");
    }

    const { result } = renderHook(() =>
      useLazyChatHistory<TwitchMessage>({ ...baseOptions(), live, liveCap: 3 }),
    );

    act(() => {
      container.dispatchEvent(new Event("scroll"));
    });

    await waitFor(() => expect(result.current.history).toHaveLength(3));
    // Newest three older-than-live messages, ascending.
    expect(result.current.history.map((m) => m.id)).toEqual([
      "old3",
      "old2",
      "old1",
    ]);
  });

  it("absorbs messages that roll off the front of a full live window", async () => {
    const now = Date.now();
    const a = makeMessage("a", now - 3000);
    const b = makeMessage("b", now - 2000);
    const c = makeMessage("c", now - 1000);

    const { result, rerender } = renderHook(
      ({ live }: { live: TwitchMessage[] }) =>
        useLazyChatHistory<TwitchMessage>({
          ...baseOptions(),
          live,
          liveCap: 2,
        }),
      { initialProps: { live: [a, b] } },
    );

    expect(result.current.history).toHaveLength(0);

    rerender({ live: [b, c] });

    await waitFor(() => expect(result.current.history).toHaveLength(1));
    expect(result.current.history[0].id).toBe("a");
  });

  it("does not resurrect a message removed from a full live window", async () => {
    const now = Date.now();
    const a = makeMessage("a", now - 3000);
    const b = makeMessage("b", now - 2000);
    const c = makeMessage("c", now - 1000);

    const { result, rerender } = renderHook(
      ({ live }: { live: TwitchMessage[] }) =>
        useLazyChatHistory<TwitchMessage>({
          ...baseOptions(),
          live,
          liveCap: 3,
        }),
      { initialProps: { live: [a, b, c] } },
    );

    // Full window, then a message is removed (e.g. an automod hold resolved
    // via Allow/Deny). This is a deletion, not a cap eviction.
    rerender({ live: [a, c] });

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.history).toHaveLength(0);
  });

  it("does not load ephemeral messages from IndexedDB history", async () => {
    const now = Date.now();
    const live = [makeMessage("live0", now - 1000)];

    await saveMessage(
      { ...makeMessage("held", now - 2000), messageType: "automod" },
      "testchannel",
    );
    await saveMessage(makeMessage("old", now - 3000), "testchannel");

    const { result } = renderHook(() =>
      useLazyChatHistory<TwitchMessage>({
        ...baseOptions(),
        live,
        liveCap: 3,
        isEphemeral: (m) => m.messageType === "automod",
      }),
    );

    act(() => {
      container.dispatchEvent(new Event("scroll"));
    });

    await waitFor(() => expect(result.current.history.length).toBeGreaterThan(0));
    expect(result.current.history.map((m) => m.id)).toEqual(["old"]);
  });

  it("does not absorb ephemeral messages (e.g. AutoMod holds) evicted from a full window", async () => {
    const now = Date.now();
    const a: TwitchMessage = {
      ...makeMessage("a", now - 3000),
      messageType: "automod",
    };
    const b = makeMessage("b", now - 2000);
    const c = makeMessage("c", now - 1000);

    const { result, rerender } = renderHook(
      ({ live }: { live: TwitchMessage[] }) =>
        useLazyChatHistory<TwitchMessage>({
          ...baseOptions(),
          live,
          liveCap: 2,
          isEphemeral: (m) => m.messageType === "automod",
        }),
      { initialProps: { live: [a, b] } },
    );

    rerender({ live: [b, c] });

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.history).toHaveLength(0);
  });

  it("does not carry messages across a channel switch when the live window was full", async () => {
    const now = Date.now();
    const oldLive = Array.from({ length: 5 }, (_, i) =>
      makeMessage(`old${i}`, now - (5 - i) * 1000),
    );

    const { result, rerender } = renderHook(
      ({ channel, live }: { channel: string; live: TwitchMessage[] }) =>
        useLazyChatHistory<TwitchMessage>({
          ...baseOptions(),
          channel,
          live,
          liveCap: 5,
        }),
      { initialProps: { channel: "channel-a", live: oldLive } },
    );

    // Switch channels: the live array still holds the old channel's messages
    // for one render, then clears on the next.
    rerender({ channel: "channel-b", live: oldLive });
    rerender({ channel: "channel-b", live: [] });

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.history).toHaveLength(0);
  });

  it("does not resurrect a deleted message from a not-yet-full window", async () => {
    const now = Date.now();
    const a = makeMessage("a", now - 3000);
    const b = makeMessage("b", now - 2000);
    const c = makeMessage("c", now - 1000);

    const { result, rerender } = renderHook(
      ({ live }: { live: TwitchMessage[] }) =>
        useLazyChatHistory<TwitchMessage>({
          ...baseOptions(),
          live,
          liveCap: 5,
        }),
      { initialProps: { live: [a, b, c] } },
    );

    rerender({ live: [a, c] });

    // Give the capture effect a tick to run.
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.history).toHaveLength(0);
  });
});
