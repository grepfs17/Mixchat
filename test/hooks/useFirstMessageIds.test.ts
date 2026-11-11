import { renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import {
  useFirstMessageIds,
  type FirstMessageScanItem,
} from "../../src/hooks/chat/useFirstMessageIds";

function item(
  key: string,
  author: string,
  timeMs: number,
  extra: Partial<FirstMessageScanItem> = {},
): FirstMessageScanItem {
  return {
    key,
    authorKey: `twitch:${author}`,
    timeMs,
    ...extra,
  };
}

const STREAM_START = 1_000;

describe("useFirstMessageIds", () => {
  it("marks only the earliest message per author", () => {
    const items = [
      item("twitch:1", "alice", STREAM_START + 10),
      item("twitch:2", "bob", STREAM_START + 20),
      item("twitch:3", "alice", STREAM_START + 30),
    ];
    const { result } = renderHook(() =>
      useFirstMessageIds(items, "chan:1000", STREAM_START),
    );
    expect(result.current.has("twitch:1")).toBe(true);
    expect(result.current.has("twitch:2")).toBe(true);
    expect(result.current.has("twitch:3")).toBe(false);
  });

  it("ignores messages before the stream start", () => {
    const items = [
      item("twitch:old", "alice", STREAM_START - 1),
      item("twitch:new", "alice", STREAM_START + 1),
    ];
    const { result } = renderHook(() =>
      useFirstMessageIds(items, "chan:1000", STREAM_START),
    );
    expect(result.current.has("twitch:old")).toBe(false);
    expect(result.current.has("twitch:new")).toBe(true);
  });

  it("ignores preloaded messages when no stream start is known", () => {
    const items = [
      item("twitch:pre", "alice", 500, { isPreloaded: true }),
      item("twitch:live", "alice", 600),
    ];
    const { result } = renderHook(() =>
      useFirstMessageIds(items, "chan:session", undefined),
    );
    expect(result.current.has("twitch:pre")).toBe(false);
    expect(result.current.has("twitch:live")).toBe(true);
  });

  it("resets tracking when the scope changes", () => {
    const items = [
      item("twitch:1", "alice", STREAM_START + 10),
      item("twitch:2", "alice", STREAM_START + 2_000),
    ];
    const { result, rerender } = renderHook(
      ({ scope, start }: { scope: string; start: number }) =>
        useFirstMessageIds(items, scope, start),
      { initialProps: { scope: "chan:1000", start: STREAM_START } },
    );
    expect(result.current.has("twitch:1")).toBe(true);
    // New stream: twitch:1 predates the new start and must lose its mark,
    // twitch:2 becomes the author's first message in the new scope.
    rerender({ scope: "chan:2000", start: STREAM_START + 1_000 });
    expect(result.current.has("twitch:1")).toBe(false);
    expect(result.current.has("twitch:2")).toBe(true);
  });

  it("moves the mark when an earlier message arrives later", () => {
    const first = [item("twitch:2", "alice", STREAM_START + 20)];
    const { result, rerender } = renderHook(
      ({ items }: { items: FirstMessageScanItem[] }) =>
        useFirstMessageIds(items, "chan:1000", STREAM_START),
      { initialProps: { items: first } },
    );
    expect(result.current.has("twitch:2")).toBe(true);
    rerender({
      items: [
        item("twitch:1", "alice", STREAM_START + 10),
        item("twitch:2", "alice", STREAM_START + 20),
      ],
    });
    expect(result.current.has("twitch:1")).toBe(true);
    expect(result.current.has("twitch:2")).toBe(false);
  });

  it("keeps the mark after the first message leaves the window", () => {
    const full = [
      item("twitch:1", "alice", STREAM_START + 10),
      item("twitch:2", "alice", STREAM_START + 20),
    ];
    const { result, rerender } = renderHook(
      ({ items }: { items: FirstMessageScanItem[] }) =>
        useFirstMessageIds(items, "chan:1000", STREAM_START),
      { initialProps: { items: full } },
    );
    rerender({ items: [item("twitch:2", "alice", STREAM_START + 20)] });
    expect(result.current.has("twitch:1")).toBe(true);
    expect(result.current.has("twitch:2")).toBe(false);
  });
});
