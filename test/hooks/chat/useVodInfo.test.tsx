import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useVodInfo } from "../../../src/hooks/chat/useVodInfo";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useVodInfo", () => {
  it("switches category as the VOD reaches a GAME_CHANGE moment", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            title: "A VOD title",
            gameName: "Just Chatting",
            gameChanges: [
              {
                offsetSeconds: 0,
                gameId: "509658",
                gameName: "Just Chatting",
              },
              {
                offsetSeconds: 10,
                gameId: "32982",
                gameName: "Grand Theft Auto V",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const player = {
      time: 0,
      getCurrentTime: vi.fn(() => player.time),
    };
    const playerRef = { current: player };

    const { result } = renderHook(() =>
      useVodInfo("123", playerRef),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(result.current.title).toBe("A VOD title");
    expect(result.current.gameName).toBe("Just Chatting");

    player.time = 10;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(result.current.gameName).toBe("Grand Theft Auto V");
  });
});
