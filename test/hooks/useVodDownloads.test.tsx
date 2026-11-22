import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVodDownloads } from "../../src/hooks/chat/useVodDownloads";

let clickedHref = "";
const clickSpy = vi
  .spyOn(HTMLAnchorElement.prototype, "click")
  .mockImplementation(function (this: HTMLAnchorElement) {
    clickedHref = this.getAttribute("href") ?? "";
  });

function stubPreflight(status = 204) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(null, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  clickedHref = "";
  clickSpy.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useVodDownloads", () => {
  it("preflights and starts the media download for the active video", async () => {
    const fetchMock = stubPreflight();
    const onNotify = vi.fn();
    const { result } = renderHook(() =>
      useVodDownloads({ videoId: "123", onNotify }),
    );

    await act(async () => {
      await result.current.downloadVod();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/twitch-vod-download?video_id=123",
      { method: "HEAD" },
    );
    expect(clickedHref).toBe("/api/twitch-vod-download?video_id=123");
    expect(onNotify).toHaveBeenCalledWith("VOD download started", "info");
  });

  it("shows an error instead of saving the error response", async () => {
    stubPreflight(401);
    const onNotify = vi.fn();
    const { result } = renderHook(() =>
      useVodDownloads({ videoId: "123", onNotify }),
    );

    await act(async () => {
      await result.current.downloadVod();
    });

    expect(clickedHref).toBe("");
    expect(onNotify).toHaveBeenCalledWith(
      "Twitch session expired. Re-login to download this VOD.",
      "error",
    );
  });

  it("passes encoded chat export metadata", () => {
    const onNotify = vi.fn();
    const { result } = renderHook(() =>
      useVodDownloads({
        videoId: "456",
        title: "Title & more",
        channelName: "Some Channel",
        onNotify,
      }),
    );

    act(() => {
      result.current.downloadVodChat("html");
    });

    expect(clickedHref).toBe(
      "/api/twitch-vod-chat-download?video_id=456&format=html&title=Title+%26+more&channel=Some+Channel",
    );
    expect(onNotify).toHaveBeenCalledWith("Chat download started", "info");
  });

  it("does nothing without a video id", async () => {
    const fetchMock = stubPreflight();
    const onNotify = vi.fn();
    const { result } = renderHook(() =>
      useVodDownloads({ videoId: null, onNotify }),
    );

    await act(async () => {
      await result.current.downloadVod();
      result.current.downloadVodChat("json");
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(clickedHref).toBe("");
    expect(onNotify).not.toHaveBeenCalled();
  });
});
