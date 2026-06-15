import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useEventSub } from "../../../src/hooks/chat/eventSub/useEventSub";

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
  vi.stubGlobal("WebSocket", MockWebSocket as any);
  vi.stubGlobal("fetch", mockFetch);
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

  it("resets keepalive on session_keepalive", () => {
    renderHook(() =>
      useEventSub({ accessToken: "tok", clientId: "cid", enabled: true }),
    );

    const ws = wsInstances[0];
    act(() => ws.simulateOpen());
    act(() => ws.simulateMessage(sessionWelcome("sess-1")));

    // Advance partway — keepalive should not fire yet
    act(() => vi.advanceTimersByTime(12_000));
    expect(ws.close).not.toHaveBeenCalled();

    // Send keepalive to reset the timer
    act(() => ws.simulateMessage(sessionKeepalive(10)));

    // Advance another 12s — still under the new window (10 + 5 grace = 15s)
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

  it("cleans up on unmount", () => {
    const { unmount } = renderHook(() =>
      useEventSub({ accessToken: "tok", clientId: "cid", enabled: true }),
    );

    const ws = wsInstances[0];
    act(() => ws.simulateOpen());

    unmount();

    expect(ws.close).toHaveBeenCalledWith(1000, "hook unmounting");
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
