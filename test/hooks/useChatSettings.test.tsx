import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useChatSettings } from "../../src/hooks/app/useChatSettings";

describe("useChatSettings YouTube emote autocomplete", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("resets the suboption when third-party emote rendering is turned off", () => {
    const { result } = renderHook(() => useChatSettings());

    act(() => {
      result.current.setRenderThirdPartyEmotesOnYoutube(true);
      result.current.setShowEmoteAutocompleteOnYoutube(true);
    });
    expect(result.current.showEmoteAutocompleteOnYoutube).toBe(true);

    act(() => {
      result.current.setRenderThirdPartyEmotesOnYoutube(false);
    });

    expect(result.current.showEmoteAutocompleteOnYoutube).toBe(false);
  });

  it("defaults the embed resolution to 1080p", () => {
    const { result } = renderHook(() => useChatSettings());

    expect(result.current.defaultResolution).toBe("1080p");
  });

  it("carries a legacy HLS quality choice over to the resolution setting", () => {
    localStorage.setItem("mixchat_default_hls_quality", JSON.stringify("720p"));

    const { result } = renderHook(() => useChatSettings());

    expect(result.current.defaultResolution).toBe("720p");
    expect(localStorage.getItem("mixchat_default_hls_quality")).toBeNull();
  });

  it("falls back to 1080p when the legacy choice exceeds the cap", () => {
    localStorage.setItem(
      "mixchat_default_hls_quality",
      JSON.stringify("highest"),
    );

    const { result } = renderHook(() => useChatSettings());

    expect(result.current.defaultResolution).toBe("1080p");
  });
});
