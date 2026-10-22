import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGiveaway } from "../../../src/hooks/chat/useGiveaway";
import type { GiveawayMessage } from "../../../src/lib/streamerTools/giveaway";
import type { TwitchMessage } from "../../../src/lib/types";

function twitchItem(
  id: string,
  userId: string,
  author: string,
  content: string,
  timestampMs = Date.now(),
): GiveawayMessage {
  return {
    platform: "twitch",
    msg: {
      id,
      platform: "twitch",
      author,
      userId,
      content,
      timestamp: new Date(timestampMs),
    } as TwitchMessage,
  };
}

describe("useGiveaway: buffer survives chat cap", () => {
  it("keeps every ingested entry even if the chat array rolls over", () => {
    const { result } = renderHook(() =>
      useGiveaway({ owner: {}, enabled: true }),
    );

    act(() => {
      result.current.setKeyword("KEY");
      result.current.setDuration(60);
    });
    act(() => {
      result.current.start();
    });

    // Simulate 200 unique chatters entering the keyword. The chat's
    // MAX_DISPLAYED_MESSAGES cap is 100, only the latest 100 would be in
    // `messages` at any time, but ingestMessage sees all 200 individually.
    for (let i = 0; i < 200; i++) {
      const id = `u${i}`;
      const item = twitchItem(`msg-${i}`, id, `User${i}`, "KEY");
      act(() => {
        result.current.ingestMessage(item);
      });
    }

    expect(result.current.phase).toBe("running");
    expect(result.current.liveEntries).toHaveLength(200);
  });

  it("dedupes by message id, not by user: same user sending the keyword twice is one entry", () => {
    const { result } = renderHook(() =>
      useGiveaway({ owner: {}, enabled: true }),
    );

    act(() => {
      result.current.setKeyword("KEY");
    });
    act(() => {
      result.current.start();
    });

    act(() => {
      result.current.ingestMessage(twitchItem("msg-1", "u1", "Alice", "KEY"));
    });
    act(() => {
      // Re-ingest (e.g. on re-render): must not add a duplicate entry.
      result.current.ingestMessage(twitchItem("msg-1", "u1", "Alice", "KEY"));
    });
    act(() => {
      // Same user, different message id: still one entry.
      result.current.ingestMessage(twitchItem("msg-2", "u1", "Alice", "KEY"));
    });

    expect(result.current.liveEntries).toHaveLength(1);
  });

  it("filters out non-matching messages and ineligible users", () => {
    const { result } = renderHook(() =>
      useGiveaway({ owner: {}, enabled: true }),
    );

    act(() => {
      result.current.setKeyword("KEY");
    });
    act(() => {
      result.current.setEligibility("subscribers");
    });
    act(() => {
      result.current.start();
    });

    // Alice has the subscriber badge.
    const alice: GiveawayMessage = {
      platform: "twitch",
      msg: {
        id: "m1",
        platform: "twitch",
        author: "Alice",
        userId: "u1",
        content: "KEY",
        timestamp: new Date(),
        badges: { subscriber: "https://x/sub.png" },
      } as TwitchMessage,
    };
    // Bob typed the wrong keyword.
    const bob = twitchItem("m2", "u2", "Bob", "nope");
    // Carol has no subscriber badge.
    const carol = twitchItem("m3", "u3", "Carol", "KEY");

    act(() => {
      result.current.ingestMessage(alice);
      result.current.ingestMessage(bob);
      result.current.ingestMessage(carol);
    });

    const ids = result.current.liveEntries.map((e) => e.userId);
    expect(ids).toEqual(["u1"]);
  });

  it("clears the buffer on cancel and startNew", () => {
    const { result } = renderHook(() =>
      useGiveaway({ owner: {}, enabled: true }),
    );

    act(() => {
      result.current.setKeyword("KEY");
    });
    act(() => {
      result.current.start();
    });
    act(() => {
      result.current.ingestMessage(twitchItem("m1", "u1", "Alice", "KEY"));
    });
    expect(result.current.liveEntries).toHaveLength(1);

    act(() => {
      result.current.cancel();
    });
    expect(result.current.liveEntries).toHaveLength(0);

    act(() => {
      result.current.setKeyword("KEY");
    });
    act(() => {
      result.current.start();
    });
    act(() => {
      result.current.ingestMessage(twitchItem("m2", "u2", "Bob", "KEY"));
    });
    expect(result.current.liveEntries).toHaveLength(1);

    act(() => {
      result.current.startNew();
    });
    expect(result.current.liveEntries).toHaveLength(0);
  });

  it("ignores ingestMessage calls when not running", () => {
    const { result } = renderHook(() =>
      useGiveaway({ owner: {}, enabled: true }),
    );

    act(() => {
      result.current.ingestMessage(twitchItem("m1", "u1", "Alice", "KEY"));
    });
    expect(result.current.liveEntries).toHaveLength(0);
  });

  it("ignores ingestMessage calls when enabled is false", () => {
    const { result } = renderHook(() =>
      useGiveaway({ owner: {}, enabled: false }),
    );

    act(() => {
      result.current.setKeyword("KEY");
    });
    act(() => {
      result.current.start();
    });
    act(() => {
      result.current.ingestMessage(twitchItem("m1", "u1", "Alice", "KEY"));
    });
    expect(result.current.liveEntries).toHaveLength(0);
  });

  it("excludes the channel owner from the buffer", () => {
    const { result } = renderHook(() =>
      useGiveaway({
        owner: { twitchBroadcasterId: "broadcaster-1" },
        enabled: true,
      }),
    );

    act(() => {
      result.current.setKeyword("KEY");
    });
    act(() => {
      result.current.start();
    });
    act(() => {
      result.current.ingestMessage(
        twitchItem("m1", "broadcaster-1", "Streamer", "KEY"),
      );
      result.current.ingestMessage(twitchItem("m2", "u2", "Viewer", "KEY"));
    });

    const ids = result.current.liveEntries.map((e) => e.userId);
    expect(ids).toEqual(["u2"]);
  });

  it("registers command-style keywords like !enter", () => {
    const { result } = renderHook(() =>
      useGiveaway({ owner: {}, enabled: true }),
    );

    act(() => {
      result.current.setKeyword("!enter");
    });
    act(() => {
      result.current.start();
    });
    act(() => {
      result.current.ingestMessage(twitchItem("m1", "u1", "Alice", "!enter"));
      result.current.ingestMessage(twitchItem("m2", "u2", "Bob", "!ENTER"));
      result.current.ingestMessage(twitchItem("m3", "u3", "Carol", "hello"));
    });

    const ids = result.current.liveEntries.map((e) => e.userId);
    expect(ids).toEqual(["u1", "u2"]);
  });

  it("rejects keywords that contain no letters or numbers", () => {
    const { result } = renderHook(() =>
      useGiveaway({ owner: {}, enabled: true }),
    );

    act(() => {
      result.current.setKeyword("!!!");
    });
    act(() => {
      result.current.start();
    });

    expect(result.current.phase).toBe("config");
    expect(result.current.error).toMatch(/letter or number/i);
  });
});
