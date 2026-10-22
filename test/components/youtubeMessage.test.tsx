import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { YouTubeMessageContent } from "../../src/components/chat/shared/YouTubeMessageContent";
import type { YTMessage } from "../../src/components/chat/unified/types";
import {
  ModerationContext,
  type ModerationContextValue,
} from "../../src/contexts/ModerationContext";

function makeYTMsg(overrides: Partial<YTMessage> = {}): YTMessage {
  return {
    id: "yt-1",
    author: "YTUser",
    parts: [{ type: "text", text: "Hello from YouTube" }],
    timestamp: new Date("2025-01-15T12:30:45"),
    ...overrides,
  };
}

function renderWithModeration(
  msg: YTMessage,
  value: Partial<ModerationContextValue>,
) {
  const full: ModerationContextValue = {
    isModerator: false,
    modModeActive: false,
    compactActions: false,
    isYouTubeModerator: false,
    youtubeModModeActive: false,
    youtubeVideoId: null,
    youtubeOwnChannelId: null,
    ...value,
  };
  return render(
    <ModerationContext.Provider value={full}>
      <YouTubeMessageContent msg={msg} />
    </ModerationContext.Provider>,
  );
}

describe("YouTubeMessageContent", () => {
  describe("basic rendering", () => {
    it("renders author name and message parts", () => {
      const msg = makeYTMsg();
      render(<YouTubeMessageContent msg={msg} />);
      expect(screen.getByText("YTUser")).toBeInTheDocument();
      expect(screen.getByText("Hello from YouTube")).toBeInTheDocument();
    });

    it("renders timestamp", () => {
      const msg = makeYTMsg();
      render(<YouTubeMessageContent msg={msg} />);
      const timestamp = screen.getByText(/12:30:45/);
      expect(timestamp).toBeInTheDocument();
    });

    it("renders author avatar when provided", () => {
      const msg = makeYTMsg({ authorAvatar: "https://example.com/avatar.jpg" });
      const { container } = render(<YouTubeMessageContent msg={msg} />);
      const img = container.querySelector("img.avatar");
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute("src", "https://example.com/avatar.jpg");
    });
  });

  describe("event messages", () => {
    it("renders membership event with MEMBER label", () => {
      const msg = makeYTMsg({
        messageType: "membership",
        superchat: { amount: "$4.99", color: "#0f9d58" },
      });
      const { container } = render(<YouTubeMessageContent msg={msg} />);
      const label = container.querySelector(".yt-event-label");
      expect(label).toBeInTheDocument();
      expect(label).toHaveTextContent("MEMBER");
    });

    it("renders gift purchase event with GIFT label", () => {
      const msg = makeYTMsg({
        messageType: "gift-purchase",
        superchat: { amount: "$4.99", color: "#9c27b0" },
      });
      const { container } = render(<YouTubeMessageContent msg={msg} />);
      const label = container.querySelector(".yt-event-label");
      expect(label).toBeInTheDocument();
      expect(label).toHaveTextContent("GIFT");
    });

    it("renders gift redemption event with GIFT RECEIVED label", () => {
      const msg = makeYTMsg({
        messageType: "gift-redemption",
        superchat: { amount: "$4.99", color: "#4caf50" },
      });
      const { container } = render(<YouTubeMessageContent msg={msg} />);
      const label = container.querySelector(".yt-event-label");
      expect(label).toBeInTheDocument();
      expect(label).toHaveTextContent("GIFT RECEIVED");
    });
  });

  describe("super chat", () => {
    it("renders super chat with amount", () => {
      const msg = makeYTMsg({
        superchat: { amount: "$20.00", color: "#ff4444" },
      });
      render(<YouTubeMessageContent msg={msg} />);
      expect(screen.getByText("[$20.00]")).toBeInTheDocument();
    });

    it("renders super chat sticker", () => {
      const msg = makeYTMsg({
        superchat: {
          amount: "$50.00",
          color: "#ff0000",
          sticker: { url: "https://example.com/sticker.png", alt: "Sticker" },
        },
      });
      const { container } = render(<YouTubeMessageContent msg={msg} />);
      const sticker = container.querySelector(".yt-superchat-sticker");
      expect(sticker).toBeInTheDocument();
      expect(sticker).toHaveAttribute("src", "https://example.com/sticker.png");
    });

    it("renders super chat label for messages with superchat but no messageType", () => {
      const msg = makeYTMsg({
        superchat: { amount: "$10.00", color: "#ff4444" },
      });
      const { container } = render(<YouTubeMessageContent msg={msg} />);
      const label = container.querySelector(".yt-event-label");
      expect(label).toBeInTheDocument();
      expect(label).toHaveTextContent("SUPER CHAT");
    });
  });

  describe("deleted messages", () => {
    it("renders fallback deleted-by-moderator text when no deletedByText is set", () => {
      const msg = makeYTMsg({ isDeleted: true });
      render(<YouTubeMessageContent msg={msg} />);
      expect(
        screen.getByText("Message deleted by a moderator"),
      ).toBeInTheDocument();
    });

    it("uses the deletedByText from the stream when present", () => {
      const msg = makeYTMsg({
        isDeleted: true,
        deletedByText: "Message deleted by @mod",
      });
      render(<YouTubeMessageContent msg={msg} />);
      expect(
        screen.getByText("Message deleted by @mod"),
      ).toBeInTheDocument();
    });

    it("shows View deleted message button only when showDeletedMessages is true", () => {
      const msg = makeYTMsg({ isDeleted: true });
      const { rerender } = render(
        <YouTubeMessageContent msg={msg} showDeletedMessages={false} />,
      );
      expect(
        screen.queryByText("View deleted message"),
      ).not.toBeInTheDocument();
      rerender(<YouTubeMessageContent msg={msg} showDeletedMessages={true} />);
      expect(screen.getByText("View deleted message")).toBeInTheDocument();
    });

    it("reveals deleted message content on click of View deleted message", () => {
      const msg = makeYTMsg({ isDeleted: true });
      render(<YouTubeMessageContent msg={msg} showDeletedMessages={true} />);
      fireEvent.click(screen.getByText("View deleted message"));
      expect(screen.getByText("Hello from YouTube")).toBeInTheDocument();
    });
  });

  describe("platform tag", () => {
    it("renders PlatformTag when showPlatformTag is true", () => {
      const msg = makeYTMsg();
      const { container } = render(
        <YouTubeMessageContent msg={msg} showPlatformTag />,
      );
      expect(
        container.querySelector(".platform-tag.youtube"),
      ).toBeInTheDocument();
    });

    it("does not render PlatformTag when showPlatformTag is false", () => {
      const msg = makeYTMsg();
      const { container } = render(
        <YouTubeMessageContent msg={msg} showPlatformTag={false} />,
      );
      expect(container.querySelector(".platform-tag")).not.toBeInTheDocument();
    });
  });

  describe("badges", () => {
    it("renders moderator shield when authorIsModerator is true", () => {
      const msg = makeYTMsg({
        authorIsModerator: true,
        badges: { Moderator: "https://example.com/mod.png" },
      });
      const { container } = render(<YouTubeMessageContent msg={msg} />);
      const shield = container.querySelector(".yt-mod-shield");
      expect(shield).toBeInTheDocument();
    });

    it("does not render moderator shield when no moderator flag is set", () => {
      const msg = makeYTMsg({
        badges: { member: "https://example.com/member.png" },
      });
      const { container } = render(<YouTubeMessageContent msg={msg} />);
      const shield = container.querySelector(".yt-mod-shield");
      expect(shield).not.toBeInTheDocument();
    });

    it("does NOT render moderator shield from a label-only 'moderator' badge", () => {
      // Only the authoritative server-side flag counts now. Arbitrary badge
      // labels can be set by community roles and must not promote a viewer.
      const msg = makeYTMsg({
        badges: { moderator: "https://example.com/mod.png" },
      });
      const { container } = render(<YouTubeMessageContent msg={msg} />);
      const shield = container.querySelector(".yt-mod-shield");
      expect(shield).not.toBeInTheDocument();
    });
  });

  describe("touch handlers", () => {
    it("calls onTouchStart on touch start", () => {
      const onTouchStart = vi.fn();
      const msg = makeYTMsg();
      const { container } = render(
        <YouTubeMessageContent msg={msg} onTouchStart={onTouchStart} />,
      );
      fireEvent.touchStart(container.querySelector(".message")!);
      expect(onTouchStart).toHaveBeenCalledTimes(1);
    });

    it("calls onTouchEnd on touch end", () => {
      const onTouchEnd = vi.fn();
      const msg = makeYTMsg();
      const { container } = render(
        <YouTubeMessageContent msg={msg} onTouchEnd={onTouchEnd} />,
      );
      fireEvent.touchEnd(container.querySelector(".message")!);
      expect(onTouchEnd).toHaveBeenCalledTimes(1);
    });
  });

  describe("username click", () => {
    it("calls onUsernameClick with author and avatar", () => {
      const onUsernameClick = vi.fn();
      const msg = makeYTMsg({ authorAvatar: "https://example.com/avatar.jpg" });
      render(
        <YouTubeMessageContent msg={msg} onUsernameClick={onUsernameClick} />,
      );
      fireEvent.click(screen.getByText("YTUser"));
      expect(onUsernameClick).toHaveBeenCalledWith(
        expect.any(Object),
        "YTUser",
        "https://example.com/avatar.jpg",
      );
    });
  });

  describe("moderator action buttons", () => {
    const VIEWER_CHANNEL = "UC-viewer";
    const ME = "UC-mine";

    it("shows timeout and ban buttons on a regular viewer message when mod mode is on", () => {
      const msg = makeYTMsg({ authorChannelId: VIEWER_CHANNEL });
      const onDelete = vi.fn();
      const onTimeout = vi.fn();
      const onBan = vi.fn();
      renderWithModeration(msg, {
        isYouTubeModerator: true,
        youtubeModModeActive: true,
        youtubeOwnChannelId: ME,
        onDeleteYouTubeMessage: onDelete,
        onTimeoutYouTubeUser: onTimeout,
        onBanYouTubeUser: onBan,
      });
      const buttons = screen.getAllByTitle(/Delete message|Timeout|Ban/);
      expect(buttons.length).toBe(3);
      // Delete is always present (no isUnmoderatable guard).
      expect(screen.getByTitle("Delete message")).toBeInTheDocument();
      // Timeout + Ban are gated on !isUnmoderatable.
      expect(
        screen.getByTitle(/Timeout/),
      ).toBeInTheDocument();
      expect(
        screen.getByTitle(/Ban \(this chat\)/),
      ).toBeInTheDocument();
    });

    it("hides timeout and ban for the signed-in user's own messages", () => {
      const msg = makeYTMsg({ authorChannelId: ME });
      renderWithModeration(msg, {
        isYouTubeModerator: true,
        youtubeModModeActive: true,
        youtubeOwnChannelId: ME,
        onDeleteYouTubeMessage: vi.fn(),
        onTimeoutYouTubeUser: vi.fn(),
        onBanYouTubeUser: vi.fn(),
      });
      expect(screen.queryByTitle("Delete message")).toBeInTheDocument();
      expect(
        screen.queryByTitle(/Timeout \(10m\) - Right-click for more/),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTitle(/Ban \(this chat\)/),
      ).not.toBeInTheDocument();
    });

    it("hides timeout and ban for the broadcaster (authorIsOwner=true)", () => {
      const msg = makeYTMsg({
        authorChannelId: "UC-streamer",
        authorIsOwner: true,
      });
      renderWithModeration(msg, {
        isYouTubeModerator: true,
        youtubeModModeActive: true,
        youtubeOwnChannelId: ME,
      });
      expect(screen.queryByTitle("Delete message")).toBeInTheDocument();
      expect(
        screen.queryByTitle(/Timeout \(10m\) - Right-click for more/),
      ).not.toBeInTheDocument();
    });

    it("hides timeout and ban for moderators (authorIsModerator=true)", () => {
      const msg = makeYTMsg({
        authorChannelId: "UC-another-mod",
        authorIsModerator: true,
      });
      renderWithModeration(msg, {
        isYouTubeModerator: true,
        youtubeModModeActive: true,
        youtubeOwnChannelId: ME,
      });
      expect(screen.queryByTitle("Delete message")).toBeInTheDocument();
      expect(
        screen.queryByTitle(/Timeout \(10m\) - Right-click for more/),
      ).not.toBeInTheDocument();
    });

    it("hides all mod actions when mod mode is off", () => {
      const msg = makeYTMsg({ authorChannelId: VIEWER_CHANNEL });
      renderWithModeration(msg, {
        isYouTubeModerator: true,
        youtubeModModeActive: false,
        youtubeOwnChannelId: ME,
      });
      expect(screen.queryByTitle("Delete message")).not.toBeInTheDocument();
    });

    it("hides all mod actions when user is not a YouTube moderator", () => {
      const msg = makeYTMsg({ authorChannelId: VIEWER_CHANNEL });
      renderWithModeration(msg, {
        isYouTubeModerator: false,
        youtubeModModeActive: true,
        youtubeOwnChannelId: ME,
      });
      expect(screen.queryByTitle("Delete message")).not.toBeInTheDocument();
    });

    it("clicking the timeout button opens the YouTube timeout dialog (no auto-timeout)", () => {
      const onTimeout = vi.fn();
      const onTimeoutMenu = vi.fn();
      const msg = makeYTMsg({ authorChannelId: VIEWER_CHANNEL });
      render(
        <ModerationContext.Provider
          value={{
            isModerator: false,
            modModeActive: false,
            compactActions: false,
            isYouTubeModerator: true,
            youtubeModModeActive: true,
            youtubeVideoId: null,
            youtubeOwnChannelId: ME,
            onTimeoutYouTubeUser: onTimeout,
          }}
        >
          <YouTubeMessageContent msg={msg} onTimeoutMenu={onTimeoutMenu} />
        </ModerationContext.Provider>,
      );
      fireEvent.click(
        screen.getByTitle(/Timeout/),
      );
      expect(onTimeout).not.toHaveBeenCalled();
      expect(onTimeoutMenu).toHaveBeenCalledWith(expect.anything());
    });
  });
});
