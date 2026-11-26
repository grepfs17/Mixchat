import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import YouTubeMessageInput from "../../src/components/chat/shared/YouTubeMessageInput";

const { searchEmotesMock } = vi.hoisted(() => ({
  searchEmotesMock: vi.fn(
    (
      _query: string,
      _limit?: number,
      _allowEmptyQuery?: boolean,
    ): Array<{ name: string; url: string; source: string }> => [],
  ),
}));

vi.mock("../../src/lib/emotes", async () => {
  const actual = await vi.importActual<typeof import("../../src/lib/emotes")>(
    "../../src/lib/emotes",
  );
  return {
    ...actual,
    searchEmotes: searchEmotesMock,
  };
});

vi.mock("../../src/lib/emojiShortcodes", () => ({
  searchEmojis: () => [],
  EMOJI_LIST: [],
}));

vi.mock("../../src/lib/youtubeChat", () => ({
  sendYouTubeChatMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/lib/device", () => ({
  isMobileDevice: () => false,
}));

const KEKW = {
  name: "KEKW",
  url: "https://example.com/kekw.png",
  source: "7TV",
};

function renderInput(
  props: Partial<React.ComponentProps<typeof YouTubeMessageInput>> = {},
) {
  return render(<YouTubeMessageInput youtubeVideoId="video-1" {...props} />);
}

function getInput() {
  return screen.getByPlaceholderText("Send to YouTube...");
}

describe("YouTubeMessageInput emote autocomplete", () => {
  beforeEach(() => {
    searchEmotesMock.mockReset();
    searchEmotesMock.mockReturnValue([KEKW]);
  });

  it("suggests emotes in default mode and inserts the selection", () => {
    renderInput({ showEmoteAutocomplete: true });
    const input = getInput();

    fireEvent.change(input, { target: { value: "KE" } });

    expect(screen.getByText("KEKW")).toBeInTheDocument();
    expect(searchEmotesMock).toHaveBeenCalledWith("KE", 10, false);

    fireEvent.click(screen.getByText("KEKW"));
    expect(input).toHaveValue("KEKW ");
  });

  it("requires the : prefix in colon mode", () => {
    renderInput({
      showEmoteAutocomplete: true,
      emoteAutocompleteMode: "colon",
    });
    const input = getInput();

    fireEvent.change(input, { target: { value: "KE" } });
    expect(searchEmotesMock).not.toHaveBeenCalled();
    expect(screen.queryByText("KEKW")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: ":KE" } });
    expect(searchEmotesMock).toHaveBeenCalledWith("KE", 10, true);
    expect(screen.getByText("KEKW")).toBeInTheDocument();
  });

  it("does not suggest emotes when the option is off", () => {
    renderInput();
    const input = getInput();

    fireEvent.change(input, { target: { value: "KE" } });

    expect(searchEmotesMock).not.toHaveBeenCalled();
    expect(screen.queryByText("KEKW")).not.toBeInTheDocument();
  });

  it("skips emote matching for @mentions and /commands", () => {
    renderInput({ showEmoteAutocomplete: true });
    const input = getInput();

    fireEvent.change(input, { target: { value: "@KE" } });
    expect(searchEmotesMock).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "/KE" } });
    expect(searchEmotesMock).not.toHaveBeenCalled();
    expect(screen.queryByText("KEKW")).not.toBeInTheDocument();
  });
});
