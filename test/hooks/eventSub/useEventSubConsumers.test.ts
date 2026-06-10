import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../src/hooks/chat/eventSub/useEventSub", () => ({
  resolveBroadcasterId: vi.fn().mockResolvedValue("12345"),
}));

import { useAutomodQueue } from "../../../src/hooks/chat/eventSub/useAutomodQueue";
import { useRaidDetection } from "../../../src/hooks/chat/eventSub/useRaidDetection";
import { useChannelPointRedemptions } from "../../../src/hooks/chat/eventSub/useChannelPointRedemptions";
import { useHypeTrainEventSub } from "../../../src/hooks/chat/eventSub/useHypeTrainEventSub";
import type { SubscribeFn } from "../../../src/hooks/chat/eventSub/useEventSub";

function makeSubscribe(
  record?: { type: string; condition: Record<string, string> }[],
): SubscribeFn {
  return (type, _v, condition, _cb) => {
    record?.push({ type, condition });
    return vi.fn();
  };
}

function makeSubscribeCapture(
  handlers: Record<string, (event: unknown) => void>,
): SubscribeFn {
  return (type, _v, _c, onNotification) => {
    const key = Object.keys(handlers).length === 0 ? "first" : "other";
    if (key === "first") handlers[type] = onNotification;
    else handlers[type] = onNotification;
    return vi.fn();
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useAutomodQueue", () => {
  it("subscribes to automod.message.hold and automod.message.update", () => {
    const subscribeCalls: Array<{ type: string; condition: Record<string, string> }> = [];

    renderHook(() =>
      useAutomodQueue({
        subscribe: makeSubscribe(subscribeCalls),
        channelId: "ch-1",
        moderatorId: "mod-1",
        enabled: true,
        onHeldMessage: vi.fn(),
        onResolvedMessage: vi.fn(),
      }),
    );

    expect(subscribeCalls).toHaveLength(2);
    expect(subscribeCalls[0].type).toBe("automod.message.hold");
    expect(subscribeCalls[0].condition).toEqual({
      broadcaster_user_id: "ch-1",
      moderator_user_id: "mod-1",
    });
    expect(subscribeCalls[1].type).toBe("automod.message.update");
    expect(subscribeCalls[1].condition).toEqual({
      broadcaster_user_id: "ch-1",
      moderator_user_id: "mod-1",
    });
  });

  it("does not subscribe when disabled", () => {
    const mockSubscribe = vi.fn(() => vi.fn()) as SubscribeFn;

    renderHook(() =>
      useAutomodQueue({
        subscribe: mockSubscribe,
        channelId: "ch-1",
        moderatorId: "mod-1",
        enabled: false,
        onHeldMessage: vi.fn(),
      }),
    );

    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it("parses held message event and calls onHeldMessage", () => {
    const handlers: Record<string, (event: unknown) => void> = {};

    renderHook(() =>
      useAutomodQueue({
        subscribe: makeSubscribeCapture(handlers),
        channelId: "ch-1",
        moderatorId: "mod-1",
        enabled: true,
        onHeldMessage: vi.fn(),
      }),
    );

    const heldType = "automod.message.hold";
    act(() => {
      handlers[heldType]({
        message_id: "msg-1",
        message: "bad word",
        user_id: "u-1",
        user_login: "user1",
        user_name: "User1",
        category: "swearing",
        level: 2,
        held_at: "2024-01-01T00:00:00Z",
      });
    });

    const onHeldMessage = vi.fn();
    renderHook(() =>
      useAutomodQueue({
        subscribe: makeSubscribeCapture(handlers),
        channelId: "ch-1",
        moderatorId: "mod-1",
        enabled: true,
        onHeldMessage,
      }),
    );

    act(() => {
      handlers[heldType]({
        message_id: "msg-1",
        message: "bad word",
        user_id: "u-1",
        user_login: "user1",
        user_name: "User1",
        category: "swearing",
        level: 2,
        held_at: "2024-01-01T00:00:00Z",
      });
    });

    expect(onHeldMessage).toHaveBeenCalledWith({
      id: "msg-1",
      content: "bad word",
      userId: "u-1",
      userName: "user1",
      userDisplayName: "User1",
      category: "swearing",
      level: 2,
      holdDate: "2024-01-01T00:00:00Z",
    });
  });

  it("parses resolved message event and calls onResolvedMessage", () => {
    const handlers: Record<string, (event: unknown) => void> = {};

    const onResolvedMessage = vi.fn();
    renderHook(() =>
      useAutomodQueue({
        subscribe: makeSubscribeCapture(handlers),
        channelId: "ch-1",
        moderatorId: "mod-1",
        enabled: true,
        onHeldMessage: vi.fn(),
        onResolvedMessage,
      }),
    );

    const updateType = "automod.message.update";
    act(() => {
      handlers[updateType]({
        message_id: "msg-2",
        status: "approved",
      });
    });

    expect(onResolvedMessage).toHaveBeenCalledWith({
      messageId: "msg-2",
      status: "approved",
    });
  });
});

describe("useRaidDetection", () => {
  it("subscribes to channel.raid with from_broadcaster_user_id when isInitiator", async () => {
    let subscribeCondition: Record<string, string> | undefined;

    renderHook(() =>
      useRaidDetection({
        subscribe: (_type, _v, condition, _cb) => {
          subscribeCondition = condition;
          return vi.fn();
        },
        channelId: "somechannel",
        enabled: true,
        isInitiator: true,
        onRaid: vi.fn(),
      }),
    );

    await act(async () => {
      await vi.waitFor(() => expect(subscribeCondition).toBeDefined());
    });

    expect(subscribeCondition).toEqual({ from_broadcaster_user_id: "12345" });
  });

  it("subscribes to channel.raid with to_broadcaster_user_id when !isInitiator", async () => {
    let subscribeCondition: Record<string, string> | undefined;

    renderHook(() =>
      useRaidDetection({
        subscribe: (_type, _v, condition, _cb) => {
          subscribeCondition = condition;
          return vi.fn();
        },
        channelId: "somechannel",
        enabled: true,
        isInitiator: false,
        onRaid: vi.fn(),
      }),
    );

    await act(async () => {
      await vi.waitFor(() => expect(subscribeCondition).toBeDefined());
    });

    expect(subscribeCondition).toEqual({ to_broadcaster_user_id: "12345" });
  });

  it("parses raid notification and calls onRaid", async () => {
    let notificationHandler: ((event: unknown) => void) | undefined;

    renderHook(() =>
      useRaidDetection({
        subscribe: (_type, _v, _c, onNotification) => {
          notificationHandler = onNotification;
          return vi.fn();
        },
        channelId: "12345",
        enabled: true,
        isInitiator: true,
        onRaid: vi.fn(),
      }),
    );

    await act(async () => {
      await vi.waitFor(() => expect(notificationHandler).toBeDefined());
    });

    const onRaid = vi.fn();
    renderHook(() =>
      useRaidDetection({
        subscribe: (_type, _v, _c, onNotification) => {
          notificationHandler = onNotification;
          return vi.fn();
        },
        channelId: "12345",
        enabled: true,
        isInitiator: true,
        onRaid,
      }),
    );

    await act(async () => {
      await vi.waitFor(() => expect(notificationHandler).toBeDefined());
    });

    act(() => {
      notificationHandler!({
        to_broadcaster_user_login: "target",
        to_broadcaster_user_name: "TargetChannel",
        viewers: 200,
      });
    });

    expect(onRaid).toHaveBeenCalledWith({
      targetLogin: "target",
      targetDisplayName: "TargetChannel",
      viewerCount: 200,
    });
  });
});

describe("useChannelPointRedemptions", () => {
  it("subscribes to channel.channel_points_custom_reward_redemption.add", async () => {
    let subscribeCondition: Record<string, string> | undefined;

    renderHook(() =>
      useChannelPointRedemptions({
        subscribe: (_type, _v, condition, _cb) => {
          subscribeCondition = condition;
          return vi.fn();
        },
        channelId: "somechannel",
        enabled: true,
        onRedemption: vi.fn(),
      }),
    );

    await act(async () => {
      await vi.waitFor(() => expect(subscribeCondition).toBeDefined());
    });

    expect(subscribeCondition).toEqual({ broadcaster_user_id: "12345" });
  });

  it("parses redemption and calls onRedemption", async () => {
    let notificationHandler: ((event: unknown) => void) | undefined;

    const onRedemption = vi.fn();
    renderHook(() =>
      useChannelPointRedemptions({
        subscribe: (_type, _v, _c, onNotification) => {
          notificationHandler = onNotification;
          return vi.fn();
        },
        channelId: "12345",
        enabled: true,
        onRedemption,
      }),
    );

    await act(async () => {
      await vi.waitFor(() => expect(notificationHandler).toBeDefined());
    });

    act(() => {
      notificationHandler!({
        id: "red-1",
        user_id: "u-1",
        user_login: "user1",
        user_name: "User1",
        reward: { id: "rw-1", title: "Emote", cost: 500 },
        user_input: "",
        redeemed_at: "2024-01-01T00:00:00Z",
      });
    });

    expect(onRedemption).toHaveBeenCalledTimes(1);
    const msg = onRedemption.mock.calls[0][0];
    expect(msg.id).toBe("redemption-red-1");
    expect(msg.author).toBe("User1");
    expect(msg.messageType).toBe("redemption");
    expect(msg.rewardTitle).toBe("Emote");
    expect(msg.rewardCost).toBe(500);
  });

  it("skips redemptions with user input", async () => {
    let notificationHandler: ((event: unknown) => void) | undefined;

    const onRedemption = vi.fn();
    renderHook(() =>
      useChannelPointRedemptions({
        subscribe: (_type, _v, _c, onNotification) => {
          notificationHandler = onNotification;
          return vi.fn();
        },
        channelId: "12345",
        enabled: true,
        onRedemption,
      }),
    );

    await act(async () => {
      await vi.waitFor(() => expect(notificationHandler).toBeDefined());
    });

    act(() => {
      notificationHandler!({
        id: "red-2",
        user_id: "u-2",
        user_login: "user2",
        user_name: "User2",
        reward: { id: "rw-2", title: "Song Request", cost: 1000 },
        user_input: "never gonna give you up",
        redeemed_at: "2024-01-01T00:00:00Z",
      });
    });

    expect(onRedemption).not.toHaveBeenCalled();
  });
});

describe("useHypeTrainEventSub", () => {
  it("subscribes to hype_train.begin, progress, and end", async () => {
    const subscribedTypes: string[] = [];

    renderHook(() =>
      useHypeTrainEventSub({
        subscribe: (type, _v, _c, _cb) => {
          subscribedTypes.push(type);
          return vi.fn();
        },
        channelId: "somechannel",
        enabled: true,
        onHypeTrainBegin: vi.fn(),
        onHypeTrainProgress: vi.fn(),
        onHypeTrainEnd: vi.fn(),
      }),
    );

    await act(async () => {
      await vi.waitFor(() => expect(subscribedTypes).toHaveLength(3));
    });

    expect(subscribedTypes).toContain("channel.hype_train.begin");
    expect(subscribedTypes).toContain("channel.hype_train.progress");
    expect(subscribedTypes).toContain("channel.hype_train.end");
  });

  it("parses hype train begin event", async () => {
    let notificationHandler: ((event: unknown) => void) | undefined;

    renderHook(() =>
      useHypeTrainEventSub({
        subscribe: (type, _v, _c, onNotification) => {
          if (type === "channel.hype_train.begin") notificationHandler = onNotification;
          return vi.fn();
        },
        channelId: "12345",
        enabled: true,
        onHypeTrainBegin: vi.fn(),
        onHypeTrainProgress: vi.fn(),
        onHypeTrainEnd: vi.fn(),
      }),
    );

    await act(async () => {
      await vi.waitFor(() => expect(notificationHandler).toBeDefined());
    });

    const onBegin = vi.fn();
    renderHook(() =>
      useHypeTrainEventSub({
        subscribe: (type, _v, _c, onNotification) => {
          if (type === "channel.hype_train.begin") notificationHandler = onNotification;
          return vi.fn();
        },
        channelId: "12345",
        enabled: true,
        onHypeTrainBegin: onBegin,
        onHypeTrainProgress: vi.fn(),
        onHypeTrainEnd: vi.fn(),
      }),
    );

    await act(async () => {
      await vi.waitFor(() => expect(notificationHandler).toBeDefined());
    });

    act(() => {
      notificationHandler!({
        id: "ht-1",
        broadcaster_user_id: "12345",
        broadcaster_user_name: "Broadcaster",
        level: 1,
        total: 500,
        progress: 250,
        goal: 500,
        top_contributions: [
          { user_id: "u-1", user_name: "Fan", display_name: "Fan", type: "bits", total: 250 },
        ],
        started_at: "2024-01-01T00:00:00Z",
        expires_at: "2024-01-01T00:05:00Z",
      });
    });

    expect(onBegin).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "ht-1",
        broadcasterUserId: "12345",
        level: 1,
        total: 500,
        topContributions: expect.arrayContaining([
          expect.objectContaining({ displayName: "Fan", total: 250 }),
        ]),
      }),
    );
  });
});
