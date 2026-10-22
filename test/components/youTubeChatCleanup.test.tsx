import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import YouTubeChat from "../../src/components/chat/shared/YouTubeChat";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("YouTubeChat: effect cleanup", () => {
  it("aborts the SSE probe fetch on unmount", () => {
    // Hang forever: keeps the effect suspended at the probe fetch boundary
    // so we never reach EventSource creation or message handling.
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = render(<YouTubeChat videoId="test-video-id" />);

    // The SSE effect passes an AbortSignal to the probe fetch
    const probeCall = fetchMock.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === "string" &&
        args[0].includes("/api/youtube-stream-chat") &&
        (args[1] as Record<string, unknown>)?.signal instanceof AbortSignal,
    );
    expect(probeCall).toBeDefined();

    const signal = probeCall![1].signal as AbortSignal;
    expect(signal.aborted).toBe(false);

    unmount();

    expect(signal.aborted).toBe(true);
  });

  it("aborts the probe fetch on videoId change", () => {
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);

    const { unmount, rerender } = render(
      <YouTubeChat videoId="video-a" />,
    );

    // Grab signal from the first video
    const firstCall = fetchMock.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === "string" &&
        args[0].includes("video-a") &&
        (args[1] as Record<string, unknown>)?.signal instanceof AbortSignal,
    );
    const firstSignal = firstCall![1].signal as AbortSignal;
    expect(firstSignal.aborted).toBe(false);

    // Switch video: cleanup should abort the old probe
    rerender(<YouTubeChat videoId="video-b" />);

    expect(firstSignal.aborted).toBe(true);

    // New video's signal should be active
    const secondCall = fetchMock.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === "string" &&
        args[0].includes("video-b") &&
        (args[1] as Record<string, unknown>)?.signal instanceof AbortSignal,
    );
    expect(secondCall).toBeDefined();
    const secondSignal = secondCall![1].signal as AbortSignal;
    expect(secondSignal.aborted).toBe(false);

    unmount();
    expect(secondSignal.aborted).toBe(true);
  });

  it("clears reconnect timer on unmount after probe failure", async () => {
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

    // Simulate a failed probe that sets a reconnect timer:
    // Return 400 for the probe, which triggers error handling + reconnect
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: "Bad request" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = render(<YouTubeChat videoId="test-video-id" />);

    // Flush the async connect() chain: the probe fetch resolves (microtask 1),
    // json() resolves (microtask 2), then the error handler schedules a
    // reconnect setTimeout. advanceTimersByTimeAsync drains microtasks.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    clearTimeoutSpy.mockClear();

    unmount();

    // The cleanup should have cleared the reconnect timer
    expect(clearTimeoutSpy).toHaveBeenCalled();

    // Advancing timers after unmount should not throw: the reconnect
    // callback was cleared and should never fire
    act(() => {
      vi.advanceTimersByTime(60000);
    });
  });
});
