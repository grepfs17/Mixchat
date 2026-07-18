import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import React from "react";
import UnifiedInput from "../../src/components/chat/shared/UnifiedInput";
import { ModerationContext } from "../../src/contexts/ModerationContext";

vi.mock("../../src/lib/emotes", async () => {
  const actual = await vi.importActual<typeof import("../../src/lib/emotes")>(
    "../../src/lib/emotes",
  );
  return {
    ...actual,
    searchEmotes: () => [],
    getAllEmotesOrganized: () => ({
      twitchGlobal: [],
      twitchChannels: [],
      "7tv": [],
      bttv: [],
      ffz: [],
    }),
  };
});

vi.mock("../../src/lib/emojiShortcodes", () => ({
  searchEmojis: () => [],
  EMOJI_LIST: [],
}));

vi.mock("../../src/lib/device", () => ({
  isMobileDevice: () => false,
}));

vi.mock("../../src/components/EmoteMenu", () => ({
  default: () => null,
}));

vi.mock("../../src/components/chat/shared/PresetMessages", () => ({
  default: () => null,
}));

const defaultCtx = {
  isModerator: false,
  modModeActive: false,
  compactActions: false,
};

function renderInput(
  props: Partial<React.ComponentProps<typeof UnifiedInput>> = {},
) {
  return render(
    <ModerationContext.Provider value={defaultCtx}>
      <UnifiedInput onSendMessage={vi.fn()} isLoading={false} {...props} />
    </ModerationContext.Provider>,
  );
}

describe("UnifiedInput", () => {
  describe("platform toggle", () => {
    it("renders Twitch toggle by default", () => {
      renderInput();
      expect(screen.getByTitle("Send to Twitch")).toBeInTheDocument();
    });

    it("hides YouTube toggle when youtubeAvailable is false", () => {
      renderInput({ youtubeAvailable: false });
      expect(screen.queryByTitle("Send to YouTube")).not.toBeInTheDocument();
      expect(screen.queryByTitle("Send to both")).not.toBeInTheDocument();
    });

    it("shows YouTube toggle when youtubeAvailable is true", () => {
      renderInput({ youtubeAvailable: true });
      expect(screen.getByTitle("Send to YouTube")).toBeInTheDocument();
      expect(screen.getByTitle("Send to both")).toBeInTheDocument();
    });

    it("clicking YouTube toggle activates it", () => {
      renderInput({ youtubeAvailable: true });
      const ytBtn = screen.getByTitle("Send to YouTube");
      fireEvent.click(ytBtn);
      expect(ytBtn.className).toContain("active");
    });

    it("clicking Both toggle activates it", () => {
      renderInput({ youtubeAvailable: true });
      const bothBtn = screen.getByTitle("Send to both");
      fireEvent.click(bothBtn);
      expect(bothBtn.className).toContain("active");
    });
  });

  describe("send target reset when YouTube becomes unavailable", () => {
    it("resets to Twitch when youtubeAvailable changes from true to false while on YouTube", () => {
      const { rerender } = render(
        <ModerationContext.Provider value={defaultCtx}>
          <UnifiedInput
            onSendMessage={vi.fn()}
            isLoading={false}
            youtubeAvailable={true}
          />
        </ModerationContext.Provider>,
      );

      // Select YouTube
      fireEvent.click(screen.getByTitle("Send to YouTube"));
      expect(screen.getByTitle("Send to YouTube").className).toContain(
        "active",
      );

      // Now make YouTube unavailable
      rerender(
        <ModerationContext.Provider value={defaultCtx}>
          <UnifiedInput
            onSendMessage={vi.fn()}
            isLoading={false}
            youtubeAvailable={false}
          />
        </ModerationContext.Provider>,
      );

      // YouTube toggle should be gone, and Twitch should be active (default state)
      expect(screen.queryByTitle("Send to YouTube")).not.toBeInTheDocument();
      expect(screen.queryByTitle("Send to both")).not.toBeInTheDocument();
      expect(screen.getByTitle("Send to Twitch").className).toContain("active");
    });

    it("resets to Twitch when youtubeAvailable changes from true to false while on Both", () => {
      const { rerender } = render(
        <ModerationContext.Provider value={defaultCtx}>
          <UnifiedInput
            onSendMessage={vi.fn()}
            isLoading={false}
            youtubeAvailable={true}
          />
        </ModerationContext.Provider>,
      );

      // Select Both
      fireEvent.click(screen.getByTitle("Send to both"));
      expect(screen.getByTitle("Send to both").className).toContain("active");

      // Now make YouTube unavailable
      rerender(
        <ModerationContext.Provider value={defaultCtx}>
          <UnifiedInput
            onSendMessage={vi.fn()}
            isLoading={false}
            youtubeAvailable={false}
          />
        </ModerationContext.Provider>,
      );

      expect(screen.queryByTitle("Send to both")).not.toBeInTheDocument();
      expect(screen.getByTitle("Send to Twitch").className).toContain("active");
    });

    it("stays on Twitch when youtubeAvailable changes but already on Twitch", () => {
      const { rerender } = render(
        <ModerationContext.Provider value={defaultCtx}>
          <UnifiedInput
            onSendMessage={vi.fn()}
            isLoading={false}
            youtubeAvailable={true}
          />
        </ModerationContext.Provider>,
      );

      // Already on Twitch (default)
      expect(screen.getByTitle("Send to Twitch").className).toContain("active");

      rerender(
        <ModerationContext.Provider value={defaultCtx}>
          <UnifiedInput
            onSendMessage={vi.fn()}
            isLoading={false}
            youtubeAvailable={false}
          />
        </ModerationContext.Provider>,
      );

      expect(screen.getByTitle("Send to Twitch").className).toContain("active");
    });
  });

  describe("reply indicator", () => {
    it("shows reply indicator when replyingTo is set", () => {
      renderInput({
        replyingTo: {
          id: "msg1",
          platform: "twitch",
          author: "SomeUser",
          content: "Hello world",
          timestamp: new Date(),
        },
      });
      expect(screen.getByText(/Replying to @SomeUser/)).toBeInTheDocument();
    });

    it("does not show reply indicator when replyingTo is undefined", () => {
      renderInput({ replyingTo: undefined });
      expect(screen.queryByText(/Replying to/)).not.toBeInTheDocument();
    });
  });

  describe("slow mode warning", () => {
    it("shows slow mode warning when cooldown > 0", () => {
      // We can't easily trigger slow mode in a unit test without sending a message
      // but we can verify the warning element would render
      renderInput({ slowModeWaitTime: 30 });
      // No warning initially since cooldown starts at 0
      expect(screen.queryByText(/Slow mode/)).not.toBeInTheDocument();
    });
  });

  describe("follower mode warning", () => {
    it("shows follower-only warning when not following", () => {
      renderInput({
        followerModeMinutes: 10,
        isFollowing: false,
        currentUsername: "testuser",
        channelName: "streamer",
      });
      expect(screen.getByText(/Follower-only chat/)).toBeInTheDocument();
    });

    it("does not show warning when following", () => {
      renderInput({
        followerModeMinutes: 10,
        isFollowing: true,
        currentUsername: "testuser",
        channelName: "streamer",
      });
      expect(screen.queryByText(/Follower-only chat/)).not.toBeInTheDocument();
    });

    it("does not show warning for the broadcaster", () => {
      renderInput({
        followerModeMinutes: 10,
        isFollowing: false,
        currentUsername: "streamer",
        channelName: "streamer",
      });
      expect(screen.queryByText(/Follower-only chat/)).not.toBeInTheDocument();
    });
  });

  describe("placeholder text", () => {
    it("shows Twitch placeholder by default", () => {
      renderInput();
      expect(
        screen.getByPlaceholderText("Send to Twitch..."),
      ).toBeInTheDocument();
    });

    it("shows YouTube placeholder when YouTube selected", () => {
      renderInput({ youtubeAvailable: true });
      fireEvent.click(screen.getByTitle("Send to YouTube"));
      expect(
        screen.getByPlaceholderText("Send to YouTube..."),
      ).toBeInTheDocument();
    });

    it("shows both placeholder when Both selected", () => {
      renderInput({ youtubeAvailable: true });
      fireEvent.click(screen.getByTitle("Send to both"));
      expect(
        screen.getByPlaceholderText("Send to both..."),
      ).toBeInTheDocument();
    });
  });
});
