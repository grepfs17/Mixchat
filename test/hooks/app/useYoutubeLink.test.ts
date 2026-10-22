import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { IS_TWITCH_ONLY } from "../../../src/lib/constants";
import type { PlatformSession } from "../../../src/lib/types";

async function loadHook() {
  const mod = await import("../../../src/hooks/app/useYoutubeLink");
  return mod.useYoutubeLink;
}

function makeTwitchSession(): PlatformSession {
  return {
    platform: "twitch",
    userId: "t1",
    displayName: "Test",
    accessToken: "token",
    expiresAt: Date.now() + 60_000,
  };
}

function makeYoutubeSession(): PlatformSession {
  return {
    platform: "youtube",
    userId: "u1",
    displayName: "Alice",
    accessToken: "token",
    expiresAt: Date.now() + 60_000,
  };
}

describe("useYoutubeLink: IS_TWITCH_ONLY gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gates linkedYoutubeUrl based on IS_TWITCH_ONLY", async () => {
    const useYoutubeLink = await loadHook();

    const { result } = renderHook(() =>
      useYoutubeLink({
        selectedTwitchChannel: "channel1",
        twitchSession: makeTwitchSession(),
        youtubeSession: makeYoutubeSession(),
      }),
    );

    // In both modes, linkedYoutubeUrl should be null when there's no stored
    // link and the user isn't watching their own channel. In Twitch-only
    // mode this is enforced at the boundary. In normal mode it's simply
    // because no link matches.
    expect(result.current.linkedYoutubeUrl).toBeNull();
  });

  it("gates linkedYoutubeChannelIds based on IS_TWITCH_ONLY", async () => {
    const useYoutubeLink = await loadHook();

    const { result } = renderHook(() =>
      useYoutubeLink({
        selectedTwitchChannel: "channel1",
        twitchSession: undefined,
        youtubeSession: undefined,
      }),
    );

    // Without stored links, linkedYoutubeChannelIds should be empty in
    // both modes. In Twitch-only mode the guard explicitly returns [].
    expect(result.current.linkedYoutubeChannelIds).toEqual([]);
  });

  it("does not fall back to own YouTube channel URL in Twitch-only mode", async () => {
    const useYoutubeLink = await loadHook();

    const twitchSession = makeTwitchSession();
    const { result } = renderHook(() =>
      useYoutubeLink({
        // User watching their own channel, in non-Twitch-only mode this
        // would fall back to the YouTube session URL.
        selectedTwitchChannel: twitchSession.userId,
        twitchSession,
        youtubeSession: makeYoutubeSession(),
      }),
    );

    if (IS_TWITCH_ONLY) {
      // Must not resolve any YouTube URL, even for own channel
      expect(result.current.linkedYoutubeUrl).toBeNull();
    } else {
      // Should fall back to YouTube channel URL for own channel
      expect(result.current.linkedYoutubeUrl).toBe(
        "https://www.youtube.com/channel/u1",
      );
    }
  });

  it("returns null for youtubeStreamVideoId when no YouTube link is available", async () => {
    const useYoutubeLink = await loadHook();

    const { result } = renderHook(() =>
      useYoutubeLink({
        selectedTwitchChannel: "channel1",
        twitchSession: undefined,
        youtubeSession: undefined,
      }),
    );

    // youtubeStreamVideoId derives from linkedYoutubeUrl, which is null
    // when there's no stored link or when IS_TWITCH_ONLY gates it.
    expect(result.current.youtubeStreamVideoId).toBeNull();
  });
});
