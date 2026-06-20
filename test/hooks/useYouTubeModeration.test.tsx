import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { useYouTubeModeration } from "../../src/hooks/chat/chatAppStateHelpers/useYouTubeModeration";

function makeWrapper() {
  const setNotification = vi.fn();
  const notificationIdRef = { current: 0 };
  return {
    setNotification,
    notificationIdRef,
    props: {
      youtubeSession: {
        platform: "youtube" as const,
        accessToken: "tok",
        displayName: "Me",
        userId: "UC-mine",
      },
      youtubeVideoId: "vid-1",
      setNotification,
      notificationIdRef: notificationIdRef as React.RefObject<number>,
      onLocalDelete: vi.fn(),
    },
  };
}

describe("useYouTubeModeration - external moderator detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("starts as non-mod with mod mode disabled", () => {
    const w = makeWrapper();
    const { result } = renderHook(() => useYouTubeModeration(w.props));
    expect(result.current.isYouTubeModerator).toBe(false);
    expect(result.current.youtubeModModeActive).toBe(false);
  });

  it("promotes the user to mod when own badges contain a moderator badge", () => {
    const w = makeWrapper();
    const { result } = renderHook(() => useYouTubeModeration(w.props));

    act(() => {
      result.current.handleYtOwnBadgesLoaded({ moderator: "1" });
    });

    expect(result.current.isYouTubeModerator).toBe(true);
  });

  it("promotes the user to mod when own badges contain an owner badge", () => {
    const w = makeWrapper();
    const { result } = renderHook(() => useYouTubeModeration(w.props));

    act(() => {
      result.current.handleYtOwnBadgesLoaded({ owner: "1" });
    });

    expect(result.current.isYouTubeModerator).toBe(true);
  });

  it("does not promote on plain member/verified badges", () => {
    const w = makeWrapper();
    const { result } = renderHook(() => useYouTubeModeration(w.props));

    act(() => {
      result.current.handleYtOwnBadgesLoaded({ member: "1" });
    });

    expect(result.current.isYouTubeModerator).toBe(false);
  });

  it("matches badges whose label contains 'Moderator' (case-insensitive)", () => {
    const w = makeWrapper();
    const { result } = renderHook(() => useYouTubeModeration(w.props));

    act(() => {
      result.current.handleYtOwnBadgesLoaded({ "Live Chat Moderator": "1" });
    });

    expect(result.current.isYouTubeModerator).toBe(true);
  });

  it("ignores mod toggle clicks when user is not a moderator", () => {
    const w = makeWrapper();
    const { result } = renderHook(() => useYouTubeModeration(w.props));

    act(() => {
      result.current.handleToggleYoutubeModMode();
    });

    expect(result.current.youtubeModModeActive).toBe(false);
  });

  it("toggles youtubeModModeActive when user is a moderator", () => {
    const w = makeWrapper();
    const { result } = renderHook(() => useYouTubeModeration(w.props));

    act(() => {
      result.current.handleYtOwnBadgesLoaded({ moderator: "1" });
    });
    expect(result.current.isYouTubeModerator).toBe(true);

    act(() => {
      result.current.handleToggleYoutubeModMode();
    });
    // The toggle should flip mod mode off (toggleYoutubemodModeActive is a
    // guarded setter that no-ops when the user isn't a mod, but the user
    // IS a mod now).
    expect(result.current.youtubeModModeActive).toBe(false);
  });
});
