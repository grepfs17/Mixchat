import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useChatAppState } from "../../src/hooks/useChatAppState";
import type { PlatformSession } from "../../src/lib/types";

vi.mock("../../src/hooks/useTwitchChat", () => ({
  useTwitchChat: () => ({
    sendMessage: vi.fn(),
    slowModeWaitTime: null,
    followerModeMinutes: null,
  }),
}));

vi.mock("../../src/hooks/useRaidDetection", () => ({
  useRaidDetection: vi.fn(),
}));

vi.mock("../../src/lib/emotes", () => ({
  initializeEmotes: vi.fn().mockResolvedValue(undefined),
  clearEmoteCache: vi.fn(),
  subscribeTo7TVUpdates: vi.fn().mockReturnValue(vi.fn()),
}));

vi.mock("../../src/lib/badges", () => ({
  initializeBadges: vi.fn().mockResolvedValue(undefined),
  clearBadgeCache: vi.fn(),
}));

vi.mock("../../src/lib/twitch", () => ({
  getStreamStatus: vi.fn().mockResolvedValue(null),
  getRecentMessages: vi.fn().mockResolvedValue([]),
  deleteChatMessage: vi.fn(),
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

const createTwitchSession = (
  overrides?: Partial<PlatformSession>,
): PlatformSession => ({
  platform: "twitch",
  accessToken: "test-token",
  userId: "user-123",
  displayName: "TestUser",
  username: "testuser",
  profileImageUrl: "https://example.com/avatar.png",
  ...overrides,
});

describe("useChatAppState - auto moderator mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("auto-activates mod mode when user accesses their own channel by username", async () => {
    const { result } = renderHook(() =>
      useChatAppState({
        twitchConnected: true,
        selectedTwitchChannel: "broadcaster-123",
        selectedTwitchChannelName: "testuser",
        selectedTwitchChannelDisplayName: "TestUser",
        twitchSession: createTwitchSession(),
      }),
    );

    await waitFor(() => {
      expect(result.current.isModerator).toBe(true);
      expect(result.current.modModeActive).toBe(true);
    });
  });

  it("auto-activates mod mode when user accesses their own channel by userId", async () => {
    const { result } = renderHook(() =>
      useChatAppState({
        twitchConnected: true,
        selectedTwitchChannel: "user-123",
        selectedTwitchChannelName: "someothername",
        selectedTwitchChannelDisplayName: "SomeOtherName",
        twitchSession: createTwitchSession(),
      }),
    );

    await waitFor(() => {
      expect(result.current.isModerator).toBe(true);
      expect(result.current.modModeActive).toBe(true);
    });
  });

  it("does not auto-activate mod mode for another channel", async () => {
    const { result } = renderHook(() =>
      useChatAppState({
        twitchConnected: true,
        selectedTwitchChannel: "broadcaster-456",
        selectedTwitchChannelName: "anotheruser",
        selectedTwitchChannelDisplayName: "AnotherUser",
        twitchSession: createTwitchSession(),
      }),
    );

    await waitFor(() => {
      expect(result.current.modModeActive).toBe(false);
    });
  });

  it("does not auto-activate mod mode when not logged in", async () => {
    const { result } = renderHook(() =>
      useChatAppState({
        twitchConnected: false,
        selectedTwitchChannel: "broadcaster-123",
        selectedTwitchChannelName: "testuser",
        selectedTwitchChannelDisplayName: "TestUser",
        twitchSession: undefined,
      }),
    );

    await waitFor(() => {
      expect(result.current.modModeActive).toBe(false);
    });
  });
});
