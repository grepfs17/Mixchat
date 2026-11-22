import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatAppState } from "../../src/hooks/chat/useChatAppState";
import type { PlatformSession } from "../../src/lib/types";

const twitchChatEnabled: boolean[] = [];

vi.mock("../../src/hooks/chat/useTwitchChat", () => ({
  useTwitchChat: (
    _channel: string,
    _token: string,
    _username: string,
    _onMessage: unknown,
    enabled: boolean,
  ) => {
    twitchChatEnabled.push(enabled);
    return {
      isConnected: enabled,
      sendMessage: vi.fn(),
      slowModeWaitTime: null,
      followerModeMinutes: null,
    };
  },
}));

vi.mock("../../src/hooks/chat/eventSubHelpers/useRaidDetection", () => ({
  useRaidDetection: vi.fn(),
}));

vi.mock("../../src/lib/emotes", async () => {
  const actual = await vi.importActual<typeof import("../../src/lib/emotes")>(
    "../../src/lib/emotes",
  );
  return {
    ...actual,
    initializeEmotes: vi.fn().mockResolvedValue(undefined),
    clearEmoteCacheStorage: vi.fn(),
    subscribeTo7TVUpdates: vi.fn().mockReturnValue(vi.fn()),
  };
});

vi.mock("../../src/lib/badges", () => ({
  initializeBadges: vi.fn().mockResolvedValue(undefined),
  clearBadgeCache: vi.fn(),
}));

vi.mock("../../src/lib/twitch", () => ({
  getStreamStatus: vi.fn().mockResolvedValue(null),
  getRecentMessages: vi.fn().mockResolvedValue([]),
  deleteTwitchMessage: vi.fn(),
  createBan: vi.fn(),
  checkUserModStatus: vi.fn().mockResolvedValue(false),
  sendHelixMessage: vi.fn(),
  resolveBroadcasterId: vi.fn(),
  removeBan: vi.fn(),
  clearChat: vi.fn(),
  getChannelInfo: vi.fn().mockResolvedValue(null),
  updateChannelInfo: vi.fn(),
  searchCategories: vi.fn().mockResolvedValue([]),
  isFollowingChannel: vi.fn().mockResolvedValue(false),
  getAllFollowedChannels: vi.fn().mockResolvedValue([]),
}));

const twitchSession: PlatformSession = {
  platform: "twitch",
  accessToken: "test-token",
  userId: "user-123",
  displayName: "TestUser",
  username: "testuser",
  profileImageUrl: "https://example.com/avatar.png",
};

const baseProps = {
  twitchConnected: true,
  selectedTwitchChannel: "broadcaster-123",
  selectedTwitchChannelName: "testuser",
  selectedTwitchChannelDisplayName: "TestUser",
  twitchSession,
};

beforeEach(() => {
  twitchChatEnabled.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ title: "A VOD", gameName: "Just Chatting", gameChanges: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ),
  );
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("useChatAppState VOD gating", () => {
  it("disconnects live Twitch IRC while a VOD is active", async () => {
    const { result, rerender } = renderHook(
      (props: typeof baseProps & { activeVodId?: string | null }) =>
        useChatAppState(props),
      { initialProps: baseProps as typeof baseProps & { activeVodId?: string | null } },
    );

    await waitFor(() => {
      expect(twitchChatEnabled[twitchChatEnabled.length - 1]).toBe(true);
    });
    expect(result.current.isVodPlayback).toBe(false);

    rerender({ ...baseProps, activeVodId: "123" });

    await waitFor(() => {
      expect(result.current.isVodPlayback).toBe(true);
      expect(twitchChatEnabled[twitchChatEnabled.length - 1]).toBe(false);
    });
  });
});
