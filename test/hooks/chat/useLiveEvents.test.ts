import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RaidOutEvent } from "../../../src/hooks/chat/eventSubHelpers/useRaidDetection";
import type { SubscribeFn } from "../../../src/hooks/chat/useEventSub";

// Track all useRaidDetection calls
const raidDetectionCalls: Array<{
  channelId: string;
  enabled: boolean;
  isInitiator: boolean;
  onRaid: (event: RaidOutEvent) => void;
  onScopeError?: () => void;
}> = [];

vi.mock("../../../src/hooks/chat/eventSubHelpers/useRaidDetection", () => ({
  useRaidDetection: vi.fn((opts: (typeof raidDetectionCalls)[0]) => {
    raidDetectionCalls.push(opts);
  }),
}));

vi.mock(
  "../../../src/hooks/chat/eventSubHelpers/useChannelPointRedemptions",
  () => ({
    useChannelPointRedemptions: vi.fn(),
  }),
);

vi.mock("../../../src/hooks/chat/eventSubHelpers/useHypeTrainEventSub", () => ({
  useHypeTrainEventSub: vi.fn(),
}));

vi.mock("../../../src/hooks/chat/eventSubHelpers/useAutomodQueue", () => ({
  useAutomodQueue: vi.fn(),
}));

vi.mock("../../../src/hooks/chat/eventSubHelpers/usePollEventSub", () => ({
  usePollEventSub: vi.fn(),
}));

vi.mock(
  "../../../src/hooks/chat/eventSubHelpers/usePredictionEventSub",
  () => ({
    usePredictionEventSub: vi.fn(),
  }),
);

vi.mock(
  "../../../src/hooks/chat/eventSubHelpers/useBitsPowerUpEventSub",
  () => ({
    useBitsPowerUpEventSub: vi.fn(),
  }),
);

// Must import after mocks are set up
import { useLiveEvents } from "../../../src/hooks/chat/chatAppStateHelpers/useLiveEvents";

const mockSubscribe: SubscribeFn = vi.fn(() => vi.fn());

function makeOptions(overrides?: {
  channelId?: string;
  userId?: string;
  accessToken?: string;
  isOnOwnChannel?: boolean;
  setPendingRaid?: React.Dispatch<React.SetStateAction<RaidOutEvent | null>>;
  setIsRaidInitiator?: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  return {
    subscribe: mockSubscribe,
    channelId: overrides?.channelId ?? "channel-100",
    twitchSession: {
      accessToken: overrides?.accessToken ?? "test-token",
      userId: overrides?.userId ?? "user-200",
      broadcasterType: "partner",
    },
    badgesReady: true,
    isModerator: true,
    isOnOwnChannel: overrides?.isOnOwnChannel ?? false,
    selectedTwitchChannelName: "testchannel",
    setHypeTrain: vi.fn(),
    setPoll: vi.fn(),
    setPrediction: vi.fn(),
    setCelebration: vi.fn(),
    setPendingRaid: overrides?.setPendingRaid ?? vi.fn(),
    setIsRaidInitiator: overrides?.setIsRaidInitiator ?? vi.fn(),
    setMessages: vi.fn(),
    setNotification: vi.fn(),
    notificationIdRef: { current: 0 },
    recentRedemptionsRef: { current: new Map() },
    currentUserBadgesRef: {
      current: { badges: {}, badgeDetails: {} },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  raidDetectionCalls.length = 0;
});

describe("useLiveEvents — raid subscriptions", () => {
  it("registers three useRaidDetection calls", () => {
    renderHook(() => useLiveEvents(makeOptions()));

    expect(raidDetectionCalls).toHaveLength(3);
  });

  it("incoming raids: subscribes with isInitiator=false and channelId", () => {
    renderHook(() =>
      useLiveEvents(makeOptions({ channelId: "channel-100", userId: "user-200" })),
    );

    const incoming = raidDetectionCalls[0];
    expect(incoming.channelId).toBe("channel-100");
    expect(incoming.isInitiator).toBe(false);
    expect(incoming.enabled).toBe(true);
  });

  it("self-initiator raids: subscribes with isInitiator=true and userId", () => {
    renderHook(() =>
      useLiveEvents(makeOptions({ channelId: "channel-100", userId: "user-200" })),
    );

    const selfInit = raidDetectionCalls[1];
    expect(selfInit.channelId).toBe("user-200");
    expect(selfInit.isInitiator).toBe(true);
    expect(selfInit.enabled).toBe(true);
  });

  it("watched-channel raid-out: subscribes with isInitiator=true and channelId", () => {
    renderHook(() =>
      useLiveEvents(makeOptions({ channelId: "channel-100", userId: "user-200" })),
    );

    const watchedRaidOut = raidDetectionCalls[2];
    expect(watchedRaidOut.channelId).toBe("channel-100");
    expect(watchedRaidOut.isInitiator).toBe(true);
    expect(watchedRaidOut.enabled).toBe(true);
  });

  it("watched-channel raid-out: disabled when on own channel (channelId === userId)", () => {
    renderHook(() =>
      useLiveEvents(
        makeOptions({
          channelId: "user-200",
          userId: "user-200",
          isOnOwnChannel: true,
        }),
      ),
    );

    const watchedRaidOut = raidDetectionCalls[2];
    expect(watchedRaidOut.channelId).toBe("user-200");
    expect(watchedRaidOut.isInitiator).toBe(true);
    // channelId === userId → guard disables the subscription
    expect(watchedRaidOut.enabled).toBe(false);
  });

  it("watched-channel raid-out: disabled when no access token", () => {
    // Pass empty string for accessToken — it's falsy (like "no token")
    // and won't be swallowed by the ?? operator in makeOptions.
    renderHook(() =>
      useLiveEvents(
        makeOptions({
          accessToken: "",
          channelId: "channel-100",
          userId: "user-200",
        }),
      ),
    );

    expect(raidDetectionCalls).toHaveLength(3);
    const watchedRaidOut = raidDetectionCalls[2];
    expect(watchedRaidOut.enabled).toBe(false);
  });

  it("incoming raids: disabled when on own channel (channelId === userId)", () => {
    renderHook(() =>
      useLiveEvents(
        makeOptions({
          channelId: "user-200",
          userId: "user-200",
        }),
      ),
    );

    const incoming = raidDetectionCalls[0];
    expect(incoming.enabled).toBe(false);
  });

  it("watched-channel raid-out callback calls setPendingRaid with the raid event", () => {
    const setPendingRaid = vi.fn();
    const setIsRaidInitiator = vi.fn();

    renderHook(() =>
      useLiveEvents(
        makeOptions({
          channelId: "channel-100",
          userId: "user-200",
          isOnOwnChannel: false,
          setPendingRaid,
          setIsRaidInitiator,
        }),
      ),
    );

    const watchedRaidOut = raidDetectionCalls[2];
    const raidEvent: RaidOutEvent = {
      fromLogin: "channel-100",
      fromDisplayName: "Channel100",
      targetLogin: "target-channel",
      targetDisplayName: "TargetChannel",
      viewerCount: 42,
    };

    watchedRaidOut.onRaid(raidEvent);

    expect(setPendingRaid).toHaveBeenCalledWith(raidEvent);
  });

  it("watched-channel raid-out callback sets isRaidInitiator(false) when watching another channel", () => {
    const setPendingRaid = vi.fn();
    const setIsRaidInitiator = vi.fn();

    renderHook(() =>
      useLiveEvents(
        makeOptions({
          channelId: "channel-100",
          userId: "user-200",
          isOnOwnChannel: false,
          setPendingRaid,
          setIsRaidInitiator,
        }),
      ),
    );

    const watchedRaidOut = raidDetectionCalls[2];
    watchedRaidOut.onRaid({
      fromLogin: "channel-100",
      fromDisplayName: "Channel100",
      targetLogin: "target",
      targetDisplayName: "Target",
      viewerCount: 10,
    });

    expect(setIsRaidInitiator).toHaveBeenCalledWith(false);
  });

  it("self-initiator callback sets isRaidInitiator(true) when on own channel", () => {
    const setPendingRaid = vi.fn();
    const setIsRaidInitiator = vi.fn();

    renderHook(() =>
      useLiveEvents(
        makeOptions({
          channelId: "user-200",
          userId: "user-200",
          isOnOwnChannel: true,
          setPendingRaid,
          setIsRaidInitiator,
        }),
      ),
    );

    const selfInit = raidDetectionCalls[1];
    selfInit.onRaid({
      fromLogin: "user-200",
      fromDisplayName: "User200",
      targetLogin: "target",
      targetDisplayName: "Target",
      viewerCount: 5,
    });

    expect(setPendingRaid).toHaveBeenCalled();
    expect(setIsRaidInitiator).toHaveBeenCalledWith(true);
  });

  it("all three subscriptions use the same onScopeError callback", () => {
    renderHook(() => useLiveEvents(makeOptions()));

    const scopeErrors = raidDetectionCalls.map((c) => c.onScopeError);
    // All three should be the same function reference (shared onRaidScopeError)
    expect(scopeErrors[0]).toBe(scopeErrors[1]);
    expect(scopeErrors[1]).toBe(scopeErrors[2]);
  });

  it("onScopeError triggers setNotification and increments the id ref", () => {
    const setNotification = vi.fn();
    const notificationIdRef = { current: 5 };

    const opts = makeOptions({ channelId: "channel-100", userId: "user-200" });
    opts.setNotification = setNotification;
    opts.notificationIdRef = notificationIdRef;
    renderHook(() => useLiveEvents(opts));

    // Call the shared scope error handler from any of the three subscriptions
    const onScopeError = raidDetectionCalls[0].onScopeError!;
    onScopeError();

    expect(notificationIdRef.current).toBe(6);
    expect(setNotification).toHaveBeenCalledWith({
      message: expect.stringContaining("Raid detection"),
      type: "info",
      id: 6,
    });
  });

  it("incoming raid callback is a no-op (does not set pending raid)", () => {
    const setPendingRaid = vi.fn();
    const setIsRaidInitiator = vi.fn();

    renderHook(() =>
      useLiveEvents(
        makeOptions({
          channelId: "channel-100",
          userId: "user-200",
          setPendingRaid,
          setIsRaidInitiator,
        }),
      ),
    );

    const incoming = raidDetectionCalls[0];
    incoming.onRaid({
      fromLogin: "some-raider",
      fromDisplayName: "SomeRaider",
      targetLogin: "channel-100",
      targetDisplayName: "Channel100",
      viewerCount: 100,
    });

    // Incoming raid handler is intentionally a no-op
    expect(setPendingRaid).not.toHaveBeenCalled();
    expect(setIsRaidInitiator).not.toHaveBeenCalled();
  });
});
