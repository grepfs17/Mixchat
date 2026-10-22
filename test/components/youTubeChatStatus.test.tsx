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
  authUserId?: string;
  showDeletedMessages?: boolean;
  onConnectionChange?: (state: {
    connected: boolean;
    loading: boolean;
    error: string | null;
    reconnecting: boolean;
  }) => void;
  onMessages?: (messages: unknown[]) => void;
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

describe("YouTubeChat — reconnect status indicator", () => {
  it("shows a banner while reconnecting and clears it after reconnecting", async () => {
    const { es, result } = await mountChat({});

    act(() => {
      es.emit("connected", { messages: [], count: 0 });
    });
    expect(screen.queryByText(/reconnecting/i)).toBeNull();

    // Server detects a transient block — notice event says reconnecting.
    act(() => {
      es.emit("notice", { status: "reconnecting" });
    });
    expect(screen.getByText(/YouTube chat reconnecting/i)).toBeDefined();

    // Reconnect succeeded — brief "reconnected" flash.
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

  it("replaces an AutoMod message when an update event arrives", async () => {
    const onMessages = vi.fn();
    const { es, result } = await mountChat({ onMessages });

    const base = {
      id: "held-1",
      author: "alice",
      authorChannelId: "UC-alice",
      parts: [{ type: "text", text: "held for review" }],
      timestamp: new Date().toISOString(),
      messageType: "automod",
    };

    act(() => {
      es.emit("connected", {
        messages: [
          {
            ...base,
            automodButtons: [{ text: "Approve", is_disabled: false }],
          },
        ],
        count: 1,
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Another moderator resolved/claimed the hold — YouTube replaces the
    // item with an updated one (here: buttons become disabled).
    act(() => {
      es.emit("update", {
        message: {
          ...base,
          id: "held-2",
          automodButtons: [{ text: "Approve", is_disabled: true }],
        },
        previousId: "held-1",
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const calls = onMessages.mock.calls;
    const last = calls[calls.length - 1]?.[0] as any[];
    expect(last).toHaveLength(1);
    expect(last[0].id).toBe("held-2");
    expect(last[0].automodButtons).toEqual([
      { text: "Approve", is_disabled: true },
    ]);

    result.unmount();
  });

  it("removes a resolved AutoMod hold even when deleted messages are shown", async () => {
    const onMessages = vi.fn();
    const { es, result } = await mountChat({
      showDeletedMessages: true,
      onMessages,
    });

    act(() => {
      es.emit("connected", {
        messages: [
          {
            id: "held-1",
            author: "alice",
            authorChannelId: "UC-alice",
            parts: [{ type: "text", text: "held for review" }],
            timestamp: new Date().toISOString(),
            messageType: "automod",
            automodButtons: [{ text: "Approve", is_disabled: false }],
          },
          {
            id: "normal-1",
            author: "bob",
            authorChannelId: "UC-bob",
            parts: [{ type: "text", text: "hello" }],
            timestamp: new Date().toISOString(),
          },
        ],
        count: 2,
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => {
      es.emit("delete", {
        messageId: "held-1",
        deletedByText: "Message removed",
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const calls = onMessages.mock.calls;
    const last = calls[calls.length - 1]?.[0] as any[];
    expect(last.map((m) => m.id)).toEqual(["normal-1"]);

    result.unmount();
  });

  it("clears messages when the YouTube auth identity changes", async () => {
    const onMessages = vi.fn();
    const { es, result } = await mountChat({ onMessages });

    act(() => {
      es.emit("connected", {
        messages: [
          {
            id: "held-1",
            author: "alice",
            authorChannelId: "UC-alice",
            parts: [{ type: "text", text: "held for review" }],
            timestamp: new Date().toISOString(),
            messageType: "automod",
            automodButtons: [{ text: "Approve", is_disabled: false }],
          },
        ],
        count: 1,
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(onMessages).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "held-1" })]),
    );

    await act(async () => {
      result.rerender(
        <YouTubeChat
          videoId="test-video-id"
          authUserId="UC-new-viewer"
          onMessages={onMessages}
        />,
      );
      await vi.advanceTimersByTimeAsync(0);
    });

    // The old session's AutoMod hold (and its buttons) must not survive the
    // account switch.
    expect(onMessages).toHaveBeenLastCalledWith([]);

    result.unmount();
  });
});