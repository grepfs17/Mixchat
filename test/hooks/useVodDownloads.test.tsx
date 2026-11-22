import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useVodDownloads } from "../../src/hooks/chat/useVodDownloads";

let clickedHref = "";
const clickSpy = vi
  .spyOn(HTMLAnchorElement.prototype, "click")
  .mockImplementation(function (this: HTMLAnchorElement) {
    clickedHref = this.getAttribute("href") ?? "";
  });

afterEach(() => {
  clickedHref = "";
  vi.clearAllMocks();
});

describe("useVodDownloads", () => {
  it("starts the media download for the active video", () => {
    const onNotify = vi.fn();
    const { result } = renderHook(() =>
      useVodDownloads({ videoId: "123", onNotify }),
    );

    act(() => {
      result.current.downloadVod();
    });

    expect(clickedHref).toBe("/api/twitch-vod-download?video_id=123");
    expect(onNotify).toHaveBeenCalledWith("VOD download started", "info");
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

  it("does nothing without a video id", () => {
    const onNotify = vi.fn();
    const { result } = renderHook(() =>
      useVodDownloads({ videoId: null, onNotify }),
    );

    act(() => {
      result.current.downloadVod();
      result.current.downloadVodChat("json");
    });

    expect(clickedHref).toBe("");
    expect(onNotify).not.toHaveBeenCalled();
  });
});
