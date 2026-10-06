import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MentionSoundType } from "../../../src/lib/twitchChatAudio";
import { useTwitchChatEventHandlers } from "../../../src/hooks/chat/twitchChatHelpers/useEventHandlers";

vi.mock("../../../src/lib/twitchChatCache", () => ({
  getUserInfo: vi.fn().mockResolvedValue(null),
  getRewardInfo: vi.fn().mockResolvedValue(null),
  getCachedAvatar: vi.fn().mockReturnValue(undefined),
  getCachedUserInfo: vi.fn().mockReturnValue(undefined),
}));

vi.mock("../../../src/lib/twitchChatMessages", () => ({
  createSystemMessage: vi.fn((content: string, messageType: string) => ({
    content,
    messageType,
  })),
  buildUserTwitchMessage: vi.fn(
    (_msg: unknown, content: string, username: string, overrides?: object) => ({
      id: "msg-1",
      content,
      author: username,
      ...overrides,
    }),
  ),
  shiftEmoteOffsets: vi.fn((offsets: unknown) => offsets),
  parseBadgeString: vi.fn(() => ({ badges: {}, badgeDetails: {} })),
  extractBadges: vi.fn(() => ({ badges: {}, badgeDetails: {} })),
}));

vi.mock("../../../src/lib/eventSounds", () => ({ playEventSound: vi.fn() }));
vi.mock("../../../src/lib/twitchChatAudio", () => ({ playMentionSound: vi.fn() }));

type Handler = (...args: unknown[]) => void;
const handlers: Record<string, Handler> = {};

function makeNotice(tags: Record<string, string>) {
  return {
    id: "notice-1",
    date: new Date(),
    emoteOffsets: new Map<string, string[]>(),
    userInfo: {
      displayName: "Someone",
      userName: "someone",
      userId: "u-1",
      color: "#fff",
      badges: new Map<string, string>(),
    },
    tags: new Map<string, string>(Object.entries(tags)),
  };
}

function makeSubInfo(overrides: Record<string, unknown> = {}) {
  return { plan: "1000", months: 1, message: "", ...overrides };
}

function renderHandlers() {
  const onMessageRef = { current: vi.fn() };
  const client = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "irc") return { onTypedMessage: vi.fn() };
        return (cb: Handler) => {
          handlers[prop as string] = cb;
        };
      },
    },
  );

  renderHook(() =>
    useTwitchChatEventHandlers({
      client: client as never,
      enabled: true,
      onMessageRef: onMessageRef as never,
      onMessageDeletedRef: { current: vi.fn() } as never,
      usernameRef: { current: "viewer" },
      accessTokenRef: { current: "token" },
      eventSoundsRef: { current: {} },
      eventSoundVolumeRef: { current: 1 },
      broadcasterIdRef: { current: null },
      mentionSoundEnabledRef: { current: false },
      mentionVolumeRef: { current: 1 },
      mentionSoundTypeRef: { current: "ding" as MentionSoundType },
      onOwnBadgesLoadedRef: { current: undefined },
    }),
  );

  const lastMessage = () => {
    const calls = onMessageRef.current.mock.calls;
    return calls[calls.length - 1]?.[0];
  };
  return { lastMessage };
}

beforeEach(() => {
  for (const key of Object.keys(handlers)) delete handlers[key];
  vi.clearAllMocks();
});

describe("useTwitchChatEventHandlers — subscription duration", () => {
  it("shows cumulative months and tier on a plain resub", () => {
    const { lastMessage } = renderHandlers();

    handlers.onResub("chan", "someone", makeSubInfo({ plan: "2000", months: 6 }), makeNotice({}));

    expect(lastMessage().content).toBe("subscribed for 6 months (Tier 2)");
    expect(lastMessage().messageType).toBe("resub");
  });

  it("shows the multi-month in-advance plan on a 3-month sub", () => {
    const { lastMessage } = renderHandlers();

    handlers.onSub(
      "chan",
      "someone",
      makeSubInfo(),
      makeNotice({ "msg-param-multimonth-duration": "3" }),
    );

    expect(lastMessage().content).toBe(
      "subscribed for 1 month (Tier 1, 3 months in advance)",
    );
  });

  it("shows the 6-month plan on a multi-month resub", () => {
    const { lastMessage } = renderHandlers();

    handlers.onResub(
      "chan",
      "someone",
      makeSubInfo({ months: 7 }),
      makeNotice({ "msg-param-multimonth-duration": "6" }),
    );

    expect(lastMessage().content).toBe(
      "subscribed for 7 months (Tier 1, 6 months in advance)",
    );
  });

  it("ignores bogus multi-month values Twitch sends on resubs", () => {
    const { lastMessage } = renderHandlers();

    handlers.onResub(
      "chan",
      "someone",
      makeSubInfo({ months: 7 }),
      makeNotice({ "msg-param-multimonth-duration": "14" }),
    );

    expect(lastMessage().content).toBe("subscribed for 7 months (Tier 1)");
  });

  it("falls back to 1 month when cumulative months is missing", () => {
    const { lastMessage } = renderHandlers();

    handlers.onResub(
      "chan",
      "someone",
      makeSubInfo({ months: Number.NaN }),
      makeNotice({}),
    );

    expect(lastMessage().content).toBe("subscribed for 1 month (Tier 1)");
  });

  it("shows the gift duration on a multi-month subgift", () => {
    const { lastMessage } = renderHandlers();

    handlers.onSubGift(
      "chan",
      "recipient",
      makeSubInfo({ giftDuration: 6 }),
      makeNotice({}),
    );

    expect(lastMessage().content).toBe(
      "gifted a 6-month Tier 1 subscription to recipient",
    );
  });
});
