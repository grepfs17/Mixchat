import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, screen } from "@testing-library/react";
import YouTubeChat from "../../src/components/chat/shared/YouTubeChat";

/** Minimal EventSource stub that lets tests emit SSE events. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners: Record<string, ((e: { data: string }) => void)[]> = {};
  url: string;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(name: string, cb: (e: { data: string }) => void) {
    (this.listeners[name] ||= []).push(cb);
  }

  close() {}

  emit(name: string, data: unknown) {
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    for (const cb of this.listeners[name] || []) cb({ data: payload });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeEventSource.instances = [];
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function mountChat(props: {
  onConnectionChange?: (state: {
    connected: boolean;
    loading: boolean;
    error: string | null;
    reconnecting: boolean;
  }) => void;
}) {
  // Probe succeeds so the component proceeds to EventSource creation.
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, body: { cancel: () => {} } }),
  );
  vi.stubGlobal("EventSource", FakeEventSource as unknown as typeof EventSource);

  const result = render(
    <YouTubeChat videoId="test-video-id" {...props} />,
  );

  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });

  const es = FakeEventSource.instances[0];
  expect(es).toBeDefined();
  return { result, es };
}

describe("YouTubeChat: reconnect status indicator", () => {
  it("shows a banner while reconnecting and clears it after reconnecting", async () => {
    const { es, result } = await mountChat({});

    act(() => {
      es.emit("connected", { messages: [], count: 0 });
    });
    expect(screen.queryByText(/reconnecting/i)).toBeNull();

    // Server detects a transient block: notice event says reconnecting.
    act(() => {
      es.emit("notice", { status: "reconnecting" });
    });
    expect(screen.getByText(/YouTube chat reconnecting/i)).toBeDefined();

    // Reconnect succeeded: brief "reconnected" flash.
    act(() => {
      es.emit("notice", { status: "reconnected" });
    });
    expect(screen.getByText(/YouTube chat reconnected/i)).toBeDefined();

    // Flash auto-clears after 2.5s.
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(screen.queryByText(/YouTube chat reconnected/i)).toBeNull();

    result.unmount();
  });

  it("reports the reconnecting state through onConnectionChange", async () => {
    const onConnectionChange = vi.fn();
    const { es, result } = await mountChat({ onConnectionChange });

    act(() => {
      es.emit("connected", { messages: [], count: 0 });
    });
    act(() => {
      es.emit("notice", { status: "reconnecting" });
    });

    const calls = onConnectionChange.mock.calls;
    const lastCall = calls[calls.length - 1]?.[0];
    expect(lastCall).toEqual(
      expect.objectContaining({ reconnecting: true }),
    );

    act(() => {
      es.emit("notice", { status: "reconnected" });
    });
    const afterCalls = onConnectionChange.mock.calls;
    const afterReconnect = afterCalls[afterCalls.length - 1]?.[0];
    expect(afterReconnect).toEqual(
      expect.objectContaining({ reconnecting: false }),
    );

    result.unmount();
  });
});