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
});
