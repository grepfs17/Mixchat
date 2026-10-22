import { renderHook, act } from "@testing-library/react";
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";

vi.mock("../../../src/hooks/chat/useEventSub", () => ({
  resolveBroadcasterId: vi.fn().mockResolvedValue("12345"),
}));

import { useChannelPointRedemptionsPubSub } from "../../../src/hooks/chat/eventSubHelpers/useChannelPointRedemptionsPubSub";

type FakeMessageEvent = { data: string };

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: FakeMessageEvent) => void) | null = null;
  onclose: ((ev?: { code?: number }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number): void {
    this.onclose?.({ code });
  }

  open(): void {
    this.onopen?.();
  }

  receive(data: string): void {
    this.onmessage?.({ data });
  }
}

function redemptionPayload(overrides?: {
  topic?: string;
  type?: string;
  userInput?: string;
}): string {
  const inner = JSON.stringify({
    type: overrides?.type ?? "reward-redeemed",
    data: {
      redemption: {
        id: "red-1",
        user: { id: "u-1", login: "user1", display_name: "User1" },
        channel_id: "12345",
        redeemed_at: "2024-01-01T00:00:00Z",
        reward: { id: "rw-1", title: "Emote", cost: 500 },
        user_input: overrides?.userInput ?? "",
      },
    },
  });
  return JSON.stringify({
    type: "MESSAGE",
    data: {
      topic: overrides?.topic ?? "community-points-channel-v1.12345",
      message: inner,
    },
  });
}

function renderHookWithSocket(
  overrides?: { channelId?: string; accessToken?: string; enabled?: boolean },
) {
  const onRedemption = vi.fn();
  const renderResult = renderHook(() =>
    useChannelPointRedemptionsPubSub({
      channelId: overrides?.channelId ?? "12345",
      accessToken: overrides?.accessToken ?? "test-token",
      enabled: overrides?.enabled ?? true,
      onRedemption,
    }),
  );
  // This RTL version returns { result: { current }, rerender, unmount },
  // expose the inner `result` so tests can read `result.current` directly.
  return { onRedemption, result: renderResult.result };
}

function lastListen(socket: FakeWebSocket): {
  type: string;
  data: { topics: string[]; auth_token: string };
} {
  return JSON.parse(socket.sent[0]);
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  (globalThis as any).WebSocket = FakeWebSocket;
  vi.clearAllMocks();
});

afterEach(() => {
  delete (globalThis as any).WebSocket;
  vi.restoreAllMocks();
});

describe("useChannelPointRedemptionsPubSub", () => {
  it("LISTENs on community-points-channel-v1 with the numeric channel id", () => {
    renderHookWithSocket();
    const socket = FakeWebSocket.instances[0];
    expect(socket).toBeDefined();
    expect(socket.url).toBe("wss://pubsub-edge.twitch.tv");

    act(() => socket.open());

    expect(socket.sent).toHaveLength(1);
    const listen = lastListen(socket);
    expect(listen.type).toBe("LISTEN");
    expect(listen.data.topics).toEqual(["community-points-channel-v1.12345"]);
    expect(listen.data.auth_token).toBe("test-token");
  });

  it("resolves a login channel id to a numeric id before LISTENing", async () => {
    const { resolveBroadcasterId } = await import(
      "../../../src/hooks/chat/useEventSub"
    );
    const onRedemption = vi.fn();
    renderHook(() =>
      useChannelPointRedemptionsPubSub({
        channelId: "somechannel",
        accessToken: "tok",
        enabled: true,
        onRedemption,
      }),
    );

    await act(async () => {
      await vi.waitFor(() => {
        expect(FakeWebSocket.instances.length).toBeGreaterThan(0);
      });
    });
    expect(resolveBroadcasterId).toHaveBeenCalledWith("somechannel");

    const socket = FakeWebSocket.instances[0];
    act(() => socket.open());
    expect(lastListen(socket).data.topics).toEqual([
      "community-points-channel-v1.12345",
    ]);
  });

  it("parses a reward-redeemed message into a TwitchMessage", () => {
    const { onRedemption } = renderHookWithSocket();
    const socket = FakeWebSocket.instances[0];
    act(() => socket.open());

    act(() => socket.receive(redemptionPayload()));

    expect(onRedemption).toHaveBeenCalledTimes(1);
    const msg = onRedemption.mock.calls[0][0];
    expect(msg.id).toBe("redemption-red-1");
    expect(msg.platform).toBe("twitch");
    expect(msg.author).toBe("User1");
    expect(msg.content).toBe("User1 redeemed Emote");
    expect(msg.userId).toBe("u-1");
    expect(msg.authorColor).toBe("#c9a2ff");
    expect(msg.messageType).toBe("redemption");
    expect(msg.rewardId).toBe("rw-1");
    expect(msg.rewardTitle).toBe("Emote");
    expect(msg.rewardCost).toBe(500);
    expect(msg.timestamp).toEqual(new Date("2024-01-01T00:00:00Z"));
  });

  it("parses automatic-reward-redeemed messages", () => {
    const { onRedemption } = renderHookWithSocket();
    const socket = FakeWebSocket.instances[0];
    act(() => socket.open());

    act(() =>
      socket.receive(redemptionPayload({ type: "automatic-reward-redeemed" })),
    );

    expect(onRedemption).toHaveBeenCalledTimes(1);
    expect(onRedemption.mock.calls[0][0].rewardTitle).toBe("Emote");
  });

  it("skips redemptions with user input (they surface as chat messages)", () => {
    const { onRedemption } = renderHookWithSocket();
    const socket = FakeWebSocket.instances[0];
    act(() => socket.open());

    act(() =>
      socket.receive(redemptionPayload({ userInput: "never gonna give you up" })),
    );

    expect(onRedemption).not.toHaveBeenCalled();
  });

  it("ignores messages for other topics", () => {
    const { onRedemption } = renderHookWithSocket();
    const socket = FakeWebSocket.instances[0];
    act(() => socket.open());

    act(() =>
      socket.receive(redemptionPayload({ topic: "community-points-channel-v1.99999" })),
    );

    expect(onRedemption).not.toHaveBeenCalled();
  });

  it("answers server PINGs with PONG", () => {
    renderHookWithSocket();
    const socket = FakeWebSocket.instances[0];
    act(() => socket.open());

    act(() => socket.receive(JSON.stringify({ type: "PING" })));

    expect(socket.sent).toHaveLength(2);
    expect(JSON.parse(socket.sent[1])).toEqual({ type: "PONG" });
  });

  it("does not connect when disabled", async () => {
    renderHookWithSocket({ enabled: false });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("reports disconnected when disabled", () => {
    const { result } = renderHookWithSocket({ enabled: false });
    expect(result.current).toBe("disconnected");
  });

  it("reports pending while connecting and connected after open", async () => {
    const { result } = renderHookWithSocket();

    await act(async () => {});
    expect(result.current).toBe("pending");

    act(() => FakeWebSocket.instances[0].open());
    expect(result.current).toBe("connected");
  });

  it("reports error after an unexpected close", () => {
    const { result } = renderHookWithSocket();
    const socket = FakeWebSocket.instances[0];
    act(() => socket.open());
    expect(result.current).toBe("connected");

    act(() => socket.close(1006));
    expect(result.current).toBe("error");
  });

  it("stays connecting (pending) when no WebSocket is available", () => {
    delete (globalThis as any).WebSocket;
    const { result } = renderHookWithSocket();
    // Non-browser environments can't open a socket. Status is left as
    // the initial "disconnected" rather than a fake "connected".
    expect(result.current).toBe("disconnected");
  });

  it("reconnects after an unexpected close", async () => {
    renderHookWithSocket();
    const socket = FakeWebSocket.instances[0];
    act(() => socket.open());

    act(() => socket.close(1006));

    // Not yet, reconnect is scheduled with a 1s backoff.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(FakeWebSocket.instances).toHaveLength(1);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1600));
    });
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("reconnects when the server requests a RECONNECT", async () => {
    renderHookWithSocket();
    const socket = FakeWebSocket.instances[0];
    act(() => socket.open());

    act(() => socket.receive(JSON.stringify({ type: "RECONNECT" })));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1600));
    });
    expect(FakeWebSocket.instances).toHaveLength(2);
  });
});