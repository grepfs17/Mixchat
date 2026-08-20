import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useChatMessages } from "../../../src/hooks/chat/chatAppStateHelpers/useChatMessages";
import type { TwitchMessage } from "../../../src/lib/types";

function makeRedemption(overrides: {
  id: string;
  rewardId: string;
  userId: string;
  content: string;
}): TwitchMessage {
  return {
    id: overrides.id,
    platform: "twitch",
    author: "User1",
    content: overrides.content,
    timestamp: new Date("2024-01-01T00:00:00Z"),
    userId: overrides.userId,
    authorColor: "#c9a2ff",
    mentionsUser: false,
    emotes: {},
    isBot: false,
    badges: {},
    badgeDetails: {},
    messageType: "redemption",
    rewardId: overrides.rewardId,
    rewardTitle: "Emote",
    rewardCost: 500,
  } as TwitchMessage;
}

function renderMessages() {
  return renderHook(() =>
    useChatMessages({
      selectedTwitchChannelName: "",
      twitchSession: undefined,
      showDeletedMessages: true,
      badgesReady: false,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useChatMessages — redemption dedup", () => {
  it("drops a redemption that another source already surfaced", () => {
    const { result } = renderMessages();

    act(() => {
      // IRC copy: "Emote (100 points)"
      result.current.handleTwitchMessage(
        makeRedemption({
          id: "irc-1",
          rewardId: "rw-1",
          userId: "u-1",
          content: "Emote (100 points)",
        }),
      );
      // PubSub copy of the same redemption: "User1 redeemed Emote"
      result.current.handleTwitchMessage(
        makeRedemption({
          id: "pubsub-1",
          rewardId: "rw-1",
          userId: "u-1",
          content: "User1 redeemed Emote",
        }),
      );
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].id).toBe("irc-1");
  });

  it("keeps the same reward redeemed by a different user", () => {
    const { result } = renderMessages();

    act(() => {
      result.current.handleTwitchMessage(
        makeRedemption({
          id: "a",
          rewardId: "rw-1",
          userId: "u-1",
          content: "User1 redeemed Emote",
        }),
      );
      result.current.handleTwitchMessage(
        makeRedemption({
          id: "b",
          rewardId: "rw-1",
          userId: "u-2",
          content: "User2 redeemed Emote",
        }),
      );
    });

    expect(result.current.messages).toHaveLength(2);
  });

  it("allows the same reward+user again after the dedup window expires", () => {
    const { result } = renderMessages();

    act(() => {
      result.current.handleTwitchMessage(
        makeRedemption({
          id: "a",
          rewardId: "rw-1",
          userId: "u-1",
          content: "User1 redeemed Emote",
        }),
      );
    });

    // Simulate the window elapsing (10s) — the map is exposed for tests.
    act(() => {
      result.current.recentRedemptionsRef.current.set(
        "rw-1-u-1",
        Date.now() - 20_000,
      );
    });

    act(() => {
      result.current.handleTwitchMessage(
        makeRedemption({
          id: "b",
          rewardId: "rw-1",
          userId: "u-1",
          content: "User1 redeemed Emote",
        }),
      );
    });

    expect(result.current.messages).toHaveLength(2);
  });

  it("does not dedup regular chat messages", () => {
    const { result } = renderMessages();

    act(() => {
      for (const id of ["m1", "m2"]) {
        result.current.handleTwitchMessage({
          id,
          platform: "twitch",
          author: "User1",
          content: "hello",
          timestamp: new Date(),
          userId: "u-1",
          messageType: "chat",
        });
      }
    });

    expect(result.current.messages).toHaveLength(2);
  });
});