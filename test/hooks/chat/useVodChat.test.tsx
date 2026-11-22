import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useVodChat } from "../../../src/hooks/chat/useVodChat";

const comments = [
  {
    id: "comment-1",
    offsetSeconds: 0,
    createdAt: "2026-01-01T00:00:00Z",
    authorId: "user-1",
    authorLogin: "someuser",
    author: "SomeUser",
    color: "#FF0000",
    fragments: [
      { text: "hello ", emote: null },
      { text: "Kappa", emote: { id: "25", from: 6 } },
    ],
    badges: [],
  },
  {
    id: "comment-2",
    offsetSeconds: 5,
    createdAt: "2026-01-01T00:00:05Z",
    authorId: "user-2",
    authorLogin: "otheruser",
    author: "OtherUser",
    color: null,
    fragments: [{ text: "later", emote: null }],
    badges: [],
  },
  {
    id: "comment-3",
    offsetSeconds: 60,
    createdAt: "2026-01-01T00:01:00Z",
    authorId: "user-3",
    authorLogin: "thirduser",
    author: "ThirdUser",
    color: null,
    fragments: [{ text: "late", emote: null }],
    badges: [],
  },
];

function stubCommentsFetch() {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    const offset = Number(url.searchParams.get("offset") ?? "0");
    const matching = comments.filter(
      (comment) => comment.offsetSeconds >= offset,
    );
    return Promise.resolve(
      new Response(
        JSON.stringify({
          comments: matching,
          cursor: null,
          hasNextPage: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useVodChat", () => {
  it("reveals replay messages as the player reaches them", async () => {
    vi.useFakeTimers();
    stubCommentsFetch();

    const player = {
      time: 0,
      getCurrentTime: vi.fn(() => player.time),
    };
    const playerRef = { current: player };

    const { result } = renderHook(() =>
      useVodChat({ videoId: "123", playerRef }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(result.current.messages.map((m) => m.id)).toEqual(["comment-1"]);
    expect(result.current.messages[0].emotes).toEqual({ "25": ["6-10"] });
    expect(result.current.loading).toBe(false);

    player.time = 2;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    player.time = 5;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(result.current.messages.map((m) => m.id)).toEqual([
      "comment-1",
      "comment-2",
    ]);
  });

  it("clears the visible replay when the player seeks backwards", async () => {
    vi.useFakeTimers();
    stubCommentsFetch();

    const player = {
      time: 60,
      getCurrentTime: vi.fn(() => player.time),
    };
    const playerRef = { current: player };

    const { result } = renderHook(() =>
      useVodChat({ videoId: "123", playerRef }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.messages).toHaveLength(1);

    player.time = 0;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.messages).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.messages.map((m) => m.id)).toEqual(["comment-1"]);
  });
});
