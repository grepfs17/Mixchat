import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { YouTubeMessageContent } from "../../src/components/chat/shared/YouTubeMessageContent";
import type { YTMessage } from "../../src/components/chat/unified/types";

function makeYTMsg(overrides: Partial<YTMessage> = {}): YTMessage {
  return {
    id: "yt-1",
    author: "YTUser",
    parts: [{ type: "text", text: "Hello from YouTube" }],
    timestamp: new Date("2025-01-15T12:30:45"),
    ...overrides,
  };
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
    it("renders deleted notice for deleted messages", () => {
      const msg = makeYTMsg({ isDeleted: true });
      render(<YouTubeMessageContent msg={msg} />);
      expect(screen.getByText("Deleted by a moderator")).toBeInTheDocument();
    });

    it("shows click to reveal for deleted messages", () => {
      const msg = makeYTMsg({ isDeleted: true });
      render(<YouTubeMessageContent msg={msg} />);
      expect(
        screen.getByText("click to see the deleted message"),
      ).toBeInTheDocument();
    });

    it("reveals deleted message content on click", () => {
      const msg = makeYTMsg({ isDeleted: true });
      render(<YouTubeMessageContent msg={msg} />);
      fireEvent.click(screen.getByText("click to see the deleted message"));
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
    it("renders moderator shield when badges contain Moderator", () => {
      const msg = makeYTMsg({
        badges: {
          Moderator: "https://example.com/mod.png",
        },
      });
      const { container } = render(<YouTubeMessageContent msg={msg} />);
      const shield = container.querySelector(".yt-mod-shield");
      expect(shield).toBeInTheDocument();
    });

    it("does not render moderator shield when no moderator badge", () => {
      const msg = makeYTMsg({
        badges: {
          member: "https://example.com/member.png",
        },
      });
      const { container } = render(<YouTubeMessageContent msg={msg} />);
      const shield = container.querySelector(".yt-mod-shield");
      expect(shield).not.toBeInTheDocument();
    });

    it("renders moderator shield case-insensitively", () => {
      const msg = makeYTMsg({
        badges: {
          moderator: "https://example.com/mod.png",
        },
      });
      const { container } = render(<YouTubeMessageContent msg={msg} />);
      const shield = container.querySelector(".yt-mod-shield");
      expect(shield).toBeInTheDocument();
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
});
