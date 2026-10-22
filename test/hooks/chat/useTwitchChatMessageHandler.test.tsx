import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TwitchMessage } from "../../../src/lib/types";
import type { MentionSoundType } from "../../../src/lib/twitchChatAudio";
import { useTwitchChatMessageHandler } from "../../../src/hooks/chat/twitchChatHelpers/useMessageHandler";

vi.mock("../../../src/lib/twitchChatCache", () => ({
  getUserInfo: vi.fn().mockResolvedValue(null),
  getSourceChannelInfo: vi.fn().mockResolvedValue(null),
  getRewardInfo: vi.fn().mockResolvedValue(null),
  getCachedAvatar: vi.fn().mockReturnValue("https://example.com/avatar.png"),
  getCachedRewardInfo: vi
    .fn()
    .mockReturnValue({ title: "Hydrate!", cost: 250 }),
  getCachedSourceChannelInfo: vi.fn().mockReturnValue(undefined),
}));

vi.mock("../../../src/lib/twitchChatMessages", () => ({
  extractBadges: vi.fn().mockReturnValue({ badges: {}, badgeDetails: {} }),
}));

vi.mock("../../../src/lib/twitchGifs", () => ({
  parseGifsTag: vi.fn().mockReturnValue([]),
}));

vi.mock("../../../src/lib/eventSounds", () => ({ playEventSound: vi.fn() }));
vi.mock("../../../src/lib/twitchChatAudio", () => ({
  playMentionSound: vi.fn(),
}));

type MessageListener = (
  channel: string,
  user: string,
  message: string,
  msg: unknown,
) => void;

let captured: MessageListener | null = null;

function makeMsg(tags: Record<string, string>) {
  return {
    id: "msg-1",
    date: new Date("2026-01-01T12:00:00Z"),
    channelId: "channel-1",
    parentMessageId: undefined,
    emoteOffsets: new Map<string, string[]>(),
    userInfo: {
      displayName: "DevTester",
      userName: "devtester",
      userId: "user-1",
      color: "#9146FF",
      badges: new Map<string, string>(),
    },
    isRedemption: true,
    rewardId: "reward-1",
    isHighlight: false,
    isCheer: false,
    tags: new Map<string, string>(Object.entries(tags)),
  };
}

function renderHandler() {
  const onMessageRef = { current: vi.fn() };
  const client = {
    onMessage: (cb: MessageListener) => {
      captured = cb;
    },
  };

  renderHook(() =>
    useTwitchChatMessageHandler({
      client: client as never,
      enabled: true,
      onMessageRef,
      usernameRef: { current: "viewer" },
      accessTokenRef: { current: "token" },
      mentionSoundEnabledRef: { current: false },
      mentionVolumeRef: { current: 1 },
      mentionSoundTypeRef: { current: "ding" as MentionSoundType },
      eventSoundsRef: { current: {} },
      eventSoundVolumeRef: { current: 1 },
      broadcasterIdRef: { current: "broadcaster-1" },
      onOwnBadgesLoadedRef: { current: undefined },
    }),
  );

  const emit = (tags: Record<string, string>, message = "Kappa") => {
    captured?.("channel", "devtester", message, makeMsg(tags));
  };

  const lastMessage = (): TwitchMessage => {
    const calls = onMessageRef.current.mock.calls;
    return calls[calls.length - 1]?.[0] as TwitchMessage;
  };

  return { emit, lastMessage };
}

beforeEach(() => {
  captured = null;
  vi.clearAllMocks();
});

describe("useTwitchChatMessageHandler: gigantified emote", () => {
  it("does not surface a gigantified emote as a channel-points redemption", () => {
    const { emit, lastMessage } = renderHandler();

    emit({ "msg-id": "gigantified-emote-message" });

    const msg = lastMessage();
    expect(msg.isGigantifiedEmote).toBe(true);
    expect(msg.messageType).toBe("chat");
    expect(msg.rewardId).toBeUndefined();
    expect(msg.rewardTitle).toBeUndefined();
    expect(msg.rewardCost).toBeUndefined();
  });

  it("still surfaces a real channel-points redemption with its reward", () => {
    const { emit, lastMessage } = renderHandler();

    emit({ "msg-id": "normal" });

    const msg = lastMessage();
    expect(msg.isGigantifiedEmote).toBe(false);
    expect(msg.messageType).toBe("redemption");
    expect(msg.rewardId).toBe("reward-1");
    expect(msg.rewardTitle).toBe("Hydrate!");
    expect(msg.rewardCost).toBe(250);
  });
});
