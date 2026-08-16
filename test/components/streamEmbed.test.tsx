import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import StreamEmbed from "../../src/components/StreamEmbed";

// Mock HLS.js so the module-level import doesn't fail in jsdom
vi.mock("hls.js", () => ({
  default: {
    isSupported: vi.fn(() => false),
    Events: {
      MANIFEST_PARSED: "hlsManifestParsed",
      ERROR: "hlsError",
    },
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("StreamEmbed — effect cleanup", () => {
  it("aborts the stream-playlist fetch on unmount", () => {
    // Hang forever — keeps the effect suspended at the fetch boundary
    // so we never reach HLS.js, EventSource, or other complex deps.
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = render(
      <StreamEmbed channelName="test-channel" playerType="m3u8" />,
    );

    // The stream-loading effect passes an AbortSignal to fetch
    const streamCall = fetchMock.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === "string" &&
        args[0].includes("/api/stream-playlist") &&
        (args[1] as Record<string, unknown>)?.signal instanceof AbortSignal,
    );
    expect(streamCall).toBeDefined();

    const signal = streamCall![1].signal as AbortSignal;
    expect(signal.aborted).toBe(false);

    unmount();

    expect(signal.aborted).toBe(true);
  });

  it("aborts the stream-playlist fetch on channel change", () => {
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);

    const { unmount, rerender } = render(
      <StreamEmbed channelName="channel-a" playerType="m3u8" />,
    );

    // Grab the signal from the first channel load
    const firstCall = fetchMock.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === "string" &&
        args[0].includes("channel-a") &&
        (args[1] as Record<string, unknown>)?.signal instanceof AbortSignal,
    );
    const firstSignal = firstCall![1].signal as AbortSignal;
    expect(firstSignal.aborted).toBe(false);

    // Switch channels — the effect cleanup should abort the old signal
    rerender(<StreamEmbed channelName="channel-b" playerType="m3u8" />);

    expect(firstSignal.aborted).toBe(true);

    // The new channel's signal should be active
    const secondCall = fetchMock.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === "string" &&
        args[0].includes("channel-b") &&
        (args[1] as Record<string, unknown>)?.signal instanceof AbortSignal,
    );
    expect(secondCall).toBeDefined();
    const secondSignal = secondCall![1].signal as AbortSignal;
    expect(secondSignal.aborted).toBe(false);

    unmount();
    expect(secondSignal.aborted).toBe(true);
  });

  it("does not log an error when fetch rejects after abort (realistic cleanup scenario)", async () => {
    // Simulate the realistic cleanup scenario: fetch hangs, then unmount
    // aborts the signal, which causes the hanging fetch to reject with
    // AbortError. The component should silently swallow this.
    let rejectFetch: (err: unknown) => void;
    const fetchPromise = new Promise<Response>((_resolve, reject) => {
      rejectFetch = reject;
    });
    const fetchMock = vi.fn().mockReturnValue(fetchPromise);
    vi.stubGlobal("fetch", fetchMock);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { unmount } = render(
      <StreamEmbed channelName="test-channel" playerType="m3u8" />,
    );

    // Verify the fetch was called
    expect(fetchMock).toHaveBeenCalled();

    // Now unmount — this aborts the AbortController, and the hanging fetch
    // will reject with AbortError (just like in a real browser)
    unmount();

    // Simulate the browser's AbortError rejection after the signal is aborted
    rejectFetch!(new DOMException("The operation was aborted.", "AbortError"));

    // Give the rejected promise a microtask to settle
    await vi.waitFor(() => {
      // The component's catch block should have returned early because
      // abortController.signal.aborted is true after unmount
    });

    // "Failed to load stream" should NOT appear — the abort was expected
    const errorCalls = consoleSpy.mock.calls.filter(
      (call) =>
        typeof call[0] === "string" &&
        call[0].includes("Failed to load stream"),
    );
    expect(errorCalls).toHaveLength(0);
  });
});

