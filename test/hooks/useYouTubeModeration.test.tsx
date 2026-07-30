import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { useYouTubeModeration } from "../../src/hooks/chat/chatAppStateHelpers/useYouTubeModeration";
import type { YTMessage } from "../../src/components/chat/unified/types";

const OWN = "UC-mine";

type Props = Parameters<typeof useYouTubeModeration>[0];

function baseProps(overrides: Partial<Props> = {}): Props {
  const setNotification = vi.fn();
  const notificationIdRef = { current: 0 } as React.RefObject<number>;
  return {
    youtubeSession: {
      platform: "youtube" as const,
      accessToken: "tok",
      displayName: "Me",
      userId: OWN,
    },
    youtubeVideoId: "vid-1",
    ytChannelId: null,
    setNotification,
    notificationIdRef,
    onLocalDelete: vi.fn(),
    messages: [],
    ...overrides,
  };
}

function msg(over: Partial<YTMessage> = {}): YTMessage {
  return {
    id: Math.random().toString(36).slice(2),
    author: "Someone",
    parts: [],
    timestamp: new Date(),
    ...over,
  };
}

describe("useYouTubeModeration - moderator detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("starts as non-mod with mod mode disabled", () => {
    const { result } = renderHook(() => useYouTubeModeration(baseProps()));
    expect(result.current.isYouTubeModerator).toBe(false);
    expect(result.current.youtubeModModeActive).toBe(false);
  });

  it("promotes the broadcaster when their channel id owns the stream", () => {
    const { result } = renderHook(() =>
      useYouTubeModeration(baseProps({ ytChannelId: OWN })),
    );
    expect(result.current.isYouTubeModerator).toBe(true);
    // youtubeModModeActive is driven by modModeTarget, not auto-activated
    expect(result.current.youtubeModModeActive).toBe(false);
  });

  it("promotes a non-owner moderator from a moderator badge on their own message", () => {
    const { result } = renderHook(() =>
      useYouTubeModeration(
        baseProps({
          messages: [msg({ authorChannelId: OWN, authorIsModerator: true })],
        }),
      ),
    );
    expect(result.current.isYouTubeModerator).toBe(true);
  });

  it("promotes from an owner badge on the user's own message", () => {
    const { result } = renderHook(() =>
      useYouTubeModeration(
        baseProps({
          messages: [msg({ authorChannelId: OWN, authorIsOwner: true })],
        }),
      ),
    );
    expect(result.current.isYouTubeModerator).toBe(true);
  });

  it("does NOT promote on a plain (verified/member) own message", () => {
    const { result } = renderHook(() =>
      useYouTubeModeration(
        baseProps({
          messages: [msg({ authorChannelId: OWN, badges: { Verified: "x" } })],
        }),
      ),
    );
    expect(result.current.isYouTubeModerator).toBe(false);
  });

  it("does NOT promote from another user's moderator message", () => {
    const { result } = renderHook(() =>
      useYouTubeModeration(
        baseProps({
          messages: [
            msg({ authorChannelId: "UC-other", authorIsModerator: true }),
          ],
        }),
      ),
    );
    expect(result.current.isYouTubeModerator).toBe(false);
  });

  it("does NOT promote when signed out (no YouTube channel id)", () => {
    const { result } = renderHook(() =>
      useYouTubeModeration(
        baseProps({
          youtubeSession: undefined,
          ytChannelId: OWN,
          messages: [msg({ authorChannelId: OWN, authorIsModerator: true })],
        }),
      ),
    );
    expect(result.current.isYouTubeModerator).toBe(false);
  });

  it("resets mod status when switching to a stream the user does not moderate", () => {
    const { result, rerender } = renderHook(
      (props: Props) => useYouTubeModeration(props),
      { initialProps: baseProps({ ytChannelId: OWN }) },
    );
    expect(result.current.isYouTubeModerator).toBe(true);

    // Switch to a different stream owned by someone else, with no own mod message.
    rerender(
      baseProps({
        youtubeVideoId: "vid-2",
        ytChannelId: "UC-other",
        messages: [],
      }),
    );
    expect(result.current.isYouTubeModerator).toBe(false);
    expect(result.current.youtubeModModeActive).toBe(false);
  });

  it("does not leak a previous stream's mod status via stale messages", () => {
    const staleModMsg = msg({ authorChannelId: OWN, authorIsModerator: true });
    const { result, rerender } = renderHook(
      (props: Props) => useYouTubeModeration(props),
      {
        initialProps: baseProps({
          youtubeVideoId: "vid-1",
          messages: [staleModMsg],
        }),
      },
    );
    expect(result.current.isYouTubeModerator).toBe(true);

    // New stream, but the buffer momentarily still holds the old message.
    rerender(baseProps({ youtubeVideoId: "vid-2", messages: [staleModMsg] }));
    // Still derived from a message whose author is the signed-in user, so it
    // stays true here — but once the buffer clears it must drop.
    rerender(baseProps({ youtubeVideoId: "vid-2", messages: [] }));
    expect(result.current.isYouTubeModerator).toBe(false);
  });

  it("activates youtubeModModeActive when modModeTarget includes youtube", () => {
    const { result } = renderHook(() =>
      useYouTubeModeration(
        baseProps({ ytChannelId: OWN, modModeTarget: "youtube" }),
      ),
    );
    expect(result.current.isYouTubeModerator).toBe(true);
    expect(result.current.youtubeModModeActive).toBe(true);
  });

  it("activates youtubeModModeActive when modModeTarget is both", () => {
    const { result } = renderHook(() =>
      useYouTubeModeration(
        baseProps({ ytChannelId: OWN, modModeTarget: "both" }),
      ),
    );
    expect(result.current.isYouTubeModerator).toBe(true);
    expect(result.current.youtubeModModeActive).toBe(true);
  });

  it("keeps youtubeModModeActive false when modModeTarget is off", () => {
    const { result } = renderHook(() =>
      useYouTubeModeration(
        baseProps({ ytChannelId: OWN, modModeTarget: "off" }),
      ),
    );
    expect(result.current.isYouTubeModerator).toBe(true);
    expect(result.current.youtubeModModeActive).toBe(false);
  });

  it("deactivates youtubeModModeActive when modModeTarget changes to off", () => {
    const { result, rerender } = renderHook(
      (props: Props) => useYouTubeModeration(props),
      {
        initialProps: baseProps({
          ytChannelId: OWN,
          modModeTarget: "youtube",
        }),
      },
    );
    expect(result.current.youtubeModModeActive).toBe(true);

    rerender(baseProps({ ytChannelId: OWN, modModeTarget: "off" }));
    expect(result.current.youtubeModModeActive).toBe(false);
  });
});
