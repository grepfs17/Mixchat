import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  useEventSub,
  __resetSubscribedKeysForTests,
} from "../../../src/hooks/chat/useEventSub";

// --- Mocks ---

let wsInstances: MockWebSocket[] = [];

class MockWebSocket {
  url: string;
  onopen: ((e: any) => void) | null = null;
  onmessage: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  onclose: ((e: any) => void) | null = null;
  readyState = 0;
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url: string) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    wsInstances.push(this);
  }

  send = vi.fn();
  close = vi.fn((code?: number, reason?: string) => {
    this.readyState = MockWebSocket.CLOSED;
    // Real WebSocket defaults to 1005 when no code is provided
    this.onclose?.({ code: code ?? 1005, reason: reason ?? "" });
  });

  // Helper: simulate server sending a message
  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  // Helper: simulate open
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.({});
  }
}

const mockFetch = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  wsInstances = [];
  __resetSubscribedKeysForTests();
  vi.stubGlobal("WebSocket", MockWebSocket as any);
  vi.stubGlobal("fetch", mockFetch);
  // Reset the shared fetch mock completely so each test starts with a clean
  // call history and no leftover mockResolvedValueOnce entries.
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: [{ id: "sub-1" }] }),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// --- Helpers ---

function sessionWelcome(sessionId: string) {
  return {
    metadata: { message_type: "session_welcome" },
    payload: { session: { id: sessionId, keepalive_timeout_seconds: 10 } },
  };
}

function sessionKeepalive(timeout = 10) {
  return {
    metadata: { message_type: "session_keepalive" },
    payload: { session: { keepalive_timeout_seconds: timeout } },
  };
}

function notification(subType: string, condition: object, event: unknown) {
  return {
    metadata: { message_type: "notification" },
    payload: {
      subscription: { type: subType, condition },
      event,
    },
  };
}

function sessionReconnect(reconnectUrl: string) {
  return {
    metadata: { message_type: "session_reconnect" },
    payload: { session: { reconnect_url: reconnectUrl } },
  };
}

// --- Tests ---

describe("useEventSub", () => {
  it("does not open a WebSocket when disabled", () => {
    renderHook(() =>
      useEventSub({ accessToken: "tok", clientId: "cid", enabled: false }),
    );
    expect(wsInstances).toHaveLength(0);
  });

  it("opens a WebSocket when enabled", () => {
    renderHook(() =>
      useEventSub({ accessToken: "tok", clientId: "cid", enabled: true }),
    );
    expect(wsInstances).toHaveLength(1);
    expect(wsInstances[0].url).toBe("wss://eventsub.wss.twitch.tv/ws");
  });

  it("sets sessionId on session_welcome", () => {
    const { result } = renderHook(() =>
      useEventSub({ accessToken: "tok", clientId: "cid", enabled: true }),
    );

    const ws = wsInstances[0];
    act(() => ws.simulateOpen());
    act(() => ws.simulateMessage(sessionWelcome("sess-42")));

    expect(result.current.sessionId).toBe("sess-42");
  });

  it("subscribes via fetch after session_welcome", async () => {
    const { result } = renderHook(() =>
      useEventSub({ accessToken: "tok", clientId: "cid", enabled: true }),
    );

    const ws = wsInstances[0];
    act(() => ws.simulateOpen());
    act(() => ws.simulateMessage(sessionWelcome("sess-1")));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // No subscription registered yet, so no fetch call for subscriptions
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("routes notifications to the correct subscriber", async () => {
    const callbackA = vi.fn();
    const callbackB = vi.fn();

    const { result } = renderHook(() =>
      useEventSub({ accessToken: "tok", clientId: "cid", enabled: true }),
    );

    // Register subscriptions
    act(() => {
      result.current.subscribe(
        "channel.raid",
        "1",
        { from_broadcaster_user_id: "123" },
        callbackA,
      );
      result.current.subscribe(
        "channel.raid",
        "1",
        { from_broadcaster_user_id: "456" },
        callbackB,
      );
    });

    // Connect and welcome
    const ws = wsInstances[0];
    act(() => ws.simulateOpen());
    act(() => ws.simulateMessage(sessionWelcome("sess-1")));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Send notification for subscriber A's condition
    const raidEvent = {
      to_broadcaster_user_login: "target",
      to_broadcaster_user_name: "Target",
      viewers: 50,
    };

    act(() => {
      ws.simulateMessage(
        notification(
          "channel.raid",
          { from_broadcaster_user_id: "123" },
          raidEvent,
        ),
      );
    });

    expect(callbackA).toHaveBeenCalledTimes(1);
    expect(callbackA).toHaveBeenCalledWith(raidEvent);
    expect(callbackB).not.toHaveBeenCalled();
  });

  it("routes channel.raid notifications to the correct handler when both initiator and incoming subscriptions are registered (regression: incoming raid must not be delivered to the initiator handler)", async () => {
    const onInitiatorRaid = vi.fn();
    const onIncomingRaid = vi.fn();

    const { result } = renderHook(() =>
      useEventSub({ accessToken: "tok", clientId: "cid", enabled: true }),
    );

    // Initiator subscription is registered FIRST (as in useChatAppState).
    act(() => {
      result.current.subscribe(
        "channel.raid",
        "1",
        { from_broadcaster_user_id: "user-A" },
        onInitiatorRaid,
      );
      result.current.subscribe(
        "channel.raid",
        "1",
        { to_broadcaster_user_id: "channel-B" },
        onIncomingRaid,
      );
    });

    const ws = wsInstances[0];
    act(() => ws.simulateOpen());
    act(() => ws.simulateMessage(sessionWelcome("sess-1")));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Incoming raid for channel-B (the user is watching channel-B and a third
    // party raids it). The notification must be delivered to onIncomingRaid
    // and NEVER to onInitiatorRaid.
    const incomingRaidEvent = {
      from_broadcaster_user_login: "raider",
      from_broadcaster_user_name: "Raider",
      to_broadcaster_user_login: "channel-b",
      to_broadcaster_user_name: "ChannelB",
      viewers: 42,
    };

    act(() => {
      ws.simulateMessage(
        notification(
          "channel.raid",
          { to_broadcaster_user_id: "channel-B" },
          incomingRaidEvent,
        ),
      );
    });

    expect(onIncomingRaid).toHaveBeenCalledTimes(1);
    expect(onIncomingRaid).toHaveBeenCalledWith(incomingRaidEvent);
    expect(onInitiatorRaid).not.toHaveBeenCalled();
  });

  it("routes channel.raid notifications to the watched-channel raid-out handler (regression: when the channel you watch raids another, the Follow Raid popup must appear)", async () => {
    const onSelfInitiatorRaid = vi.fn();
    const onIncomingRaid = vi.fn();
    const onWatchedChannelRaidOut = vi.fn();

    const { result } = renderHook(() =>
      useEventSub({ accessToken: "tok", clientId: "cid", enabled: true }),
    );

    // Mirror the order and conditions used by useChatAppState:
    //   1. self-initiator sub (from = user-A)
    //   2. incoming sub       (to   = channel-B)
    //   3. watched-channel raid-out sub (from = channel-B)
    act(() => {
      result.current.subscribe(
        "channel.raid",
        "1",
        { from_broadcaster_user_id: "user-A" },
        onSelfInitiatorRaid,
      );
      result.current.subscribe(
        "channel.raid",
        "1",
        { to_broadcaster_user_id: "channel-B" },
        onIncomingRaid,
      );
      result.current.subscribe(
        "channel.raid",
        "1",
        { from_broadcaster_user_id: "channel-B" },
        onWatchedChannelRaidOut,
      );
    });

    const ws = wsInstances[0];
    act(() => ws.simulateOpen());
    act(() => ws.simulateMessage(sessionWelcome("sess-1")));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Event: the watched channel (channel-B) is raiding target-C.
    const watchedRaidOutEvent = {
      from_broadcaster_user_login: "channel-b",
      from_broadcaster_user_name: "ChannelB",
      to_broadcaster_user_login: "target-c",
      to_broadcaster_user_name: "TargetC",
      viewers: 17,
    };

    act(() => {
      ws.simulateMessage(
        notification(
          "channel.raid",
          { from_broadcaster_user_id: "channel-B" },
          watchedRaidOutEvent,
        ),
      );
    });

    // Must reach the watched-channel raid-out handler exactly once.
    expect(onWatchedChannelRaidOut).toHaveBeenCalledTimes(1);
    expect(onWatchedChannelRaidOut).toHaveBeenCalledWith(watchedRaidOutEvent);

    // Must not be misrouted to the other two handlers.
    expect(onSelfInitiatorRaid).not.toHaveBeenCalled();
    expect(onIncomingRaid).not.toHaveBeenCalled();
  });

  it("resets keepalive on session_keepalive", () => {
    renderHook(() =>
      useEventSub({ accessToken: "tok", clientId: "cid", enabled: true }),
    );

    const ws = wsInstances[0];
    act(() => ws.simulateOpen());
    act(() => ws.simulateMessage(sessionWelcome("sess-1")));

    // Advance partway, keepalive should not fire yet
    act(() => vi.advanceTimersByTime(12_000));
    expect(ws.close).not.toHaveBeenCalled();

    // Send keepalive to reset the timer
    act(() => ws.simulateMessage(sessionKeepalive(10)));

    // Advance another 12s, still under the new window (10 + 5 grace = 15s)
    act(() => vi.advanceTimersByTime(12_000));
    expect(ws.close).not.toHaveBeenCalled();
  });

  it("reconnects on keepalive timeout", () => {
    renderHook(() =>
      useEventSub({ accessToken: "tok", clientId: "cid", enabled: true }),
    );

    const ws = wsInstances[0];
    act(() => ws.simulateOpen());
    act(() => ws.simulateMessage(sessionWelcome("sess-1")));

    // Advance past keepalive window (10s + 5s grace = 15s)
    act(() => vi.advanceTimersByTime(16_000));

    // The original WS should have been closed
    expect(ws.close).toHaveBeenCalled();
    // A new WS should have been created for reconnection
    expect(wsInstances).toHaveLength(2);
  });

  it("handles session_reconnect", () => {
    renderHook(() =>
      useEventSub({ accessToken: "tok", clientId: "cid", enabled: true }),
    );

    const ws = wsInstances[0];
    act(() => ws.simulateOpen());
    act(() => ws.simulateMessage(sessionWelcome("sess-1")));
    act(() =>
      ws.simulateMessage(
        sessionReconnect("wss://eventsub.wss.twitch.tv/ws?reconnect=test"),
      ),
    );

    expect(ws.close).toHaveBeenCalledWith(
      1000,
      "reconnect requested by server",
    );
    expect(wsInstances).toHaveLength(2);
    expect(wsInstances[1].url).toBe(
      "wss://eventsub.wss.twitch.tv/ws?reconnect=test",
    );
  });

  it("does not let a stale socket's onclose wipe the new session after a Twitch reconnect", async () => {
    const { result } = renderHook(() =>
      useEventSub({ accessToken: "tok", clientId: "cid", enabled: true }),
    );

    const ws1 = wsInstances[0];
    act(() => ws1.simulateOpen());
    act(() => ws1.simulateMessage(sessionWelcome("sess-1")));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Request reconnect
    act(() =>
      ws1.simulateMessage(
        sessionReconnect("wss://eventsub.wss.twitch.tv/ws?reconnect=test"),
      ),
    );

    const ws2 = wsInstances[1];
    act(() => ws2.simulateOpen());
    act(() => ws2.simulateMessage(sessionWelcome("sess-2")));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.sessionId).toBe("sess-2");

    // Now the old socket finally closes. It should not reset the new session.
    // Trigger the onclose handler on the stale socket by invoking close,
    // simulating the delayed close from the server.
    ws1.close(1000, "stale close");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Session should still be the new one, not null.
    expect(result.current.sessionId).toBe("sess-2");
  });

  it("retries failed subscriptions with exponential backoff", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: "Server Error" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: "sub-1" }] }),
      });

    const callback = vi.fn();

    const { result } = renderHook(() =>
      useEventSub({ accessToken: "tok", clientId: "cid", enabled: true }),
    );

    act(() => {
      result.current.subscribe(
        "automod.message.hold",
        "1",
        { broadcaster_user_id: "1", moderator_user_id: "2" },
        callback,
      );
    });

    const ws = wsInstances[0];
    act(() => ws.simulateOpen());
    act(() => ws.simulateMessage(sessionWelcome("sess-1")));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // First attempt should fail
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Advance to the first retry window (2s base)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    // Second attempt should succeed
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does not resubscribe after a Twitch-managed reconnect", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: "sub-1" }] }),
    });

    const callback = vi.fn();

    const { result } = renderHook(() =>
      useEventSub({ accessToken: "tok", clientId: "cid", enabled: true }),
    );

    act(() => {
      result.current.subscribe(
        "automod.message.hold",
        "1",
        { broadcaster_user_id: "1", moderator_user_id: "2" },
        callback,
      );
    });

    const ws1 = wsInstances[0];
    act(() => ws1.simulateOpen());
    act(() => ws1.simulateMessage(sessionWelcome("sess-1")));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Twitch requests reconnect
    act(() =>
      ws1.simulateMessage(
        sessionReconnect("wss://eventsub.wss.twitch.tv/ws?reconnect=test"),
      ),
    );

    const ws2 = wsInstances[1];
    act(() => ws2.simulateOpen());
    act(() => ws2.simulateMessage(sessionWelcome("sess-2")));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Should not have made a second subscription request
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("cleans up on unmount", () => {
    const { unmount } = renderHook(() =>
      useEventSub({ accessToken: "tok", clientId: "cid", enabled: true }),
    );

    const ws = wsInstances[0];
    act(() => ws.simulateOpen());

    unmount();

    expect(ws.close).toHaveBeenCalledWith(1000, "hook unmounting");
  });

  it("accumulates keys when multiple subscriptions are registered synchronously after session is active (regression: debounce was overwriting keys)", async () => {
    const callbackHold = vi.fn();
    const callbackUpdate = vi.fn();
    const callbackRaid = vi.fn();

    const { result } = renderHook(() =>
      useEventSub({ accessToken: "tok", clientId: "cid", enabled: true }),
    );

    // Connect and establish session FIRST
    const ws = wsInstances[0];
    act(() => ws.simulateOpen());
    act(() => ws.simulateMessage(sessionWelcome("sess-1")));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const fetchCountBefore = mockFetch.mock.calls.length;

    // Register 3 subscriptions synchronously, mimics useAutomodQueue
    // calling subscribe() for hold + update back-to-back, plus another
    // hook subscribing simultaneously.
    act(() => {
      result.current.subscribe(
        "automod.message.hold",
        "1",
        { broadcaster_user_id: "1", moderator_user_id: "2" },
        callbackHold,
      );
      result.current.subscribe(
        "automod.message.update",
        "1",
        { broadcaster_user_id: "1", moderator_user_id: "2" },
        callbackUpdate,
      );
      result.current.subscribe(
        "channel.raid",
        "1",
        { to_broadcaster_user_id: "1" },
        callbackRaid,
      );
    });

    // All 3 should show as pending
    const statuses = result.current.subscriptionStatuses;
    const holdKey =
      'automod.message.hold:{"broadcaster_user_id":"1","moderator_user_id":"2"}';
    const updateKey =
      'automod.message.update:{"broadcaster_user_id":"1","moderator_user_id":"2"}';
    const raidKey = 'channel.raid:{"to_broadcaster_user_id":"1"}';

    expect(statuses.get(holdKey)).toBe("pending");
    expect(statuses.get(updateKey)).toBe("pending");
    expect(statuses.get(raidKey)).toBe("pending");

    // Advance past the 300ms debounce + 2x 250ms stagger between subs
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    // All 3 subscriptions should have been sent to Twitch
    const newCalls = mockFetch.mock.calls.slice(fetchCountBefore);
    expect(newCalls).toHaveLength(3);

    const subscribedTypes = newCalls.map((call: any[]) =>
      JSON.parse(call[1].body).type,
    );
    expect(subscribedTypes).toContain("automod.message.hold");
    expect(subscribedTypes).toContain("automod.message.update");
    expect(subscribedTypes).toContain("channel.raid");

    // All should be connected now
    expect(result.current.subscriptionStatuses.get(holdKey)).toBe("connected");
    expect(result.current.subscriptionStatuses.get(updateKey)).toBe(
      "connected",
    );
    expect(result.current.subscriptionStatuses.get(raidKey)).toBe("connected");
  });

  it("evicts stale subscribedKeys entry and re-registers when cleanup and re-subscribe happen within the same session (regression: stuck in disabled/connected with no pending status)", async () => {
    const callback = vi.fn();

    const { result } = renderHook(() =>
      useEventSub({ accessToken: "tok", clientId: "cid", enabled: true }),
    );

    // Connect and establish session
    const ws = wsInstances[0];
    act(() => ws.simulateOpen());
    act(() => ws.simulateMessage(sessionWelcome("sess-1")));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Subscribe, should go through fetch and become connected
    let unsubscribe: () => void;
    act(() => {
      unsubscribe = result.current.subscribe(
        "automod.message.hold",
        "1",
        { broadcaster_user_id: "1", moderator_user_id: "2" },
        callback,
      );
    });

    // Advance past debounce + stagger
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    const holdKey =
      'automod.message.hold:{"broadcaster_user_id":"1","moderator_user_id":"2"}';
    expect(result.current.subscriptionStatuses.get(holdKey)).toBe("connected");

    const fetchCountAfterFirst = mockFetch.mock.calls.length;

    // Simulate effect cleanup (e.g. useAutomodQueue effect re-ran).
    // The cleanup removes from subscriptionsRef + subscriptionStatuses,
    // but the module-level subscribedKeys STILL has the stale entry.
    act(() => {
      unsubscribe!();
    });

    // Status should be removed after cleanup
    expect(result.current.subscriptionStatuses.has(holdKey)).toBe(false);

    // Re-subscribe with the same key (effect re-runs and calls subscribe again).
    // Without the fix, subscribedKeys.has(key) === true and
    // subscribedKeys.get(key) === currentSid, so "pending" is never set
    // and triggerResubscribeRef is never called, subscription gets stuck.
    act(() => {
      result.current.subscribe(
        "automod.message.hold",
        "1",
        { broadcaster_user_id: "1", moderator_user_id: "2" },
        callback,
      );
    });

    // Status should be "pending" immediately after re-subscribe
    expect(result.current.subscriptionStatuses.get(holdKey)).toBe("pending");

    // Advance past debounce + stagger for the re-registration
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    // Should have made a NEW fetch call to re-register with Twitch
    expect(mockFetch.mock.calls.length).toBeGreaterThan(fetchCountAfterFirst);

    // Status should be connected again
    expect(result.current.subscriptionStatuses.get(holdKey)).toBe("connected");
  });

  it("calls onScopeError on 403 subscription response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: "Forbidden" }),
    });

    const onScopeError = vi.fn();

    const { result } = renderHook(() =>
      useEventSub({ accessToken: "tok", clientId: "cid", enabled: true }),
    );

    act(() => {
      result.current.subscribe(
        "automod.message.hold",
        "1",
        { broadcaster_user_id: "1", moderator_user_id: "2" },
        vi.fn(),
        onScopeError,
      );
    });

    const ws = wsInstances[0];
    act(() => ws.simulateOpen());
    act(() => ws.simulateMessage(sessionWelcome("sess-1")));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(onScopeError).toHaveBeenCalled();
  });
});
