import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import React from "react";
import ChatDisplay from "../../src/components/chat/display";
import UnifiedChat from "../../src/components/chat/unified";
import MessageInput from "../../src/components/chat/shared/MessageInput";
import type { TwitchMessage, Platform } from "../../src/lib/types";
import {
  ModerationContext,
  type ModerationContextValue,
} from "../../src/contexts/ModerationContext";

vi.mock("react-dom", async () => {
  const actual = await vi.importActual("react-dom");
  return {
    ...actual,
    createPortal: (children: React.ReactNode) => children,
  };
});

vi.mock("../../src/lib/emotes", () => ({
  parseMessageWithEmotes: (text: string) => text,
  searchEmotes: () => [],
  getAllEmotesOrganized: () => ({}),
}));

vi.mock("../../src/hooks/chat/useChatTouchGestures", () => ({
  useChatTouchGestures: () => ({}),
}));

vi.mock("../../src/hooks/chat/useScrollToBottomOnKeyboard", () => ({
  useScrollToBottomOnKeyboard: () => ({}),
}));

vi.mock("../../src/components/EmoteMenu", () => ({
  default: () => null,
  __esModule: true,
}));

vi.mock("../../src/components/MessageBadges", () => ({
  default: () => null,
  __esModule: true,
}));

vi.mock("../../src/components/TwitchEventIcon", () => ({
  default: () => null,
  EVENT_CONFIG: {},
  __esModule: true,
}));

vi.mock("../../src/lib/device", () => ({
  isMobileDevice: () => false,
}));

function withModeration(
  ui: React.ReactNode,
  values: Partial<ModerationContextValue> = {},
) {
  return (
    <ModerationContext.Provider
      value={{
        isModerator: false,
        modModeActive: false,
        compactActions: false,
        ...values,
      }}
    >
      {ui}
    </ModerationContext.Provider>
  );
}

const baseMessage: TwitchMessage = {
  id: "msg-1",
  platform: "twitch",
  author: "TestUser",
  content: "Hello world",
  timestamp: new Date(),
  userId: "user-1",
};

const broadcasterMessage: TwitchMessage = {
  ...baseMessage,
  id: "msg-bc",
  author: "BroadcasterUser",
  badges: { broadcaster: "1" },
};

const moderatorMessage: TwitchMessage = {
  ...baseMessage,
  id: "msg-mod",
  author: "ModUser",
  badges: { moderator: "1" },
};

const ownMessage: TwitchMessage = {
  ...baseMessage,
  id: "msg-self",
  author: "MySelf",
  isCurrentUser: true,
};

const timeoutMessage: TwitchMessage = {
  ...baseMessage,
  id: "msg-timeout",
  author: "system",
  messageType: "timeout",
  targetUsername: "TimedOutUser",
  content: "TimedOutUser was timed out",
};

const banMessage: TwitchMessage = {
  ...baseMessage,
  id: "msg-ban",
  author: "system",
  messageType: "ban",
  targetUsername: "BannedUser",
  content: "BannedUser was banned",
};

describe("Moderator Mode", () => {
  describe("ChatDisplay - Mod Mode Toggle", () => {
    const defaultProps = {
      messages: [] as TwitchMessage[],
      isLoading: false,
      selectedPlatforms: ["twitch"] as Platform[],
    };

    it("renders mod mode button when user is a moderator", () => {
      render(
        withModeration(<ChatDisplay {...defaultProps} />, {
          isModerator: true,
          onSetModMode: vi.fn(),
        }),
      );
      expect(screen.getByTitle("Mod Mode")).toBeInTheDocument();
    });

    it("does not render mod mode button when user is not a moderator", () => {
      render(
        withModeration(<ChatDisplay {...defaultProps} />, {
          isModerator: false,
          onSetModMode: vi.fn(),
        }),
      );
      expect(screen.queryByTitle("Mod Mode")).not.toBeInTheDocument();
    });

    it("shows active state when mod mode is enabled", () => {
      render(
        withModeration(<ChatDisplay {...defaultProps} />, {
          isModerator: true,
          modModeActive: true,
          onSetModMode: vi.fn(),
        }),
      );
      expect(screen.getByTitle("Mod Mode")).toBeInTheDocument();
    });

    it("opens dropdown and calls onSetModMode when option is clicked", async () => {
      const onSetModMode = vi.fn();
      render(
        withModeration(<ChatDisplay {...defaultProps} />, {
          isModerator: true,
          modModeActive: false,
          onSetModMode,
        }),
      );
      fireEvent.click(screen.getByTitle("Mod Mode"));
      expect(screen.getByText("Off")).toBeInTheDocument();
      expect(screen.getByText("Twitch")).toBeInTheDocument();
      fireEvent.click(screen.getByText("Twitch"));
      expect(onSetModMode).toHaveBeenCalledWith("twitch");
    });

    it("renders mod mode button when user is only a YouTube moderator", () => {
      render(
        withModeration(<ChatDisplay {...defaultProps} />, {
          isModerator: false,
          isYouTubeModerator: true,
          onSetModMode: vi.fn(),
        }),
      );
      expect(screen.getByTitle("Mod Mode")).toBeInTheDocument();
    });

    it("shows Off and YouTube options for YouTube-only moderator", () => {
      render(
        withModeration(<ChatDisplay {...defaultProps} />, {
          isModerator: false,
          isYouTubeModerator: true,
          youtubeModModeActive: false,
          onSetModMode: vi.fn(),
        }),
      );
      fireEvent.click(screen.getByTitle("Mod Mode"));
      expect(screen.getByText("Off")).toBeInTheDocument();
      expect(screen.getByText("YouTube")).toBeInTheDocument();
      expect(screen.queryByText("Twitch")).not.toBeInTheDocument();
      expect(screen.queryByText("Both")).not.toBeInTheDocument();
    });

    it("calls onSetModMode when YouTube-only moderator selects YouTube", () => {
      const onSetModMode = vi.fn();
      render(
        withModeration(<ChatDisplay {...defaultProps} />, {
          isModerator: false,
          isYouTubeModerator: true,
          youtubeModModeActive: false,
          onSetModMode,
        }),
      );
      fireEvent.click(screen.getByTitle("Mod Mode"));
      fireEvent.click(screen.getByText("YouTube"));
      expect(onSetModMode).toHaveBeenCalledWith("youtube");
    });
  });

  describe("ChatDisplay - Mod Actions (inline buttons)", () => {
    it("shows mod action buttons when isModerator and modModeActive", () => {
      render(
        withModeration(
          <ChatDisplay
            messages={[baseMessage]}
            isLoading={false}
            selectedPlatforms={["twitch"]}
          />,
          {
            isModerator: true,
            modModeActive: true,
            onDeleteMessage: vi.fn(),
            onTimeoutUser: vi.fn(),
            onBanUser: vi.fn(),
            onWarnUser: vi.fn(),
          },
        ),
      );
      expect(screen.getByTitle("Delete message")).toBeInTheDocument();
      expect(
        screen.getByTitle("Timeout (10m) - Right-click for more"),
      ).toBeInTheDocument();
      expect(screen.getByTitle("Ban user")).toBeInTheDocument();
      expect(screen.getByTitle("Warn user")).toBeInTheDocument();
    });

    it("does not show mod action buttons when modModeActive is false", () => {
      render(
        withModeration(
          <ChatDisplay
            messages={[baseMessage]}
            isLoading={false}
            selectedPlatforms={["twitch"]}
          />,
          {
            isModerator: true,
            modModeActive: false,
            onDeleteMessage: vi.fn(),
            onTimeoutUser: vi.fn(),
            onBanUser: vi.fn(),
            onWarnUser: vi.fn(),
          },
        ),
      );
      expect(screen.queryByTitle("Delete message")).not.toBeInTheDocument();
      expect(
        screen.queryByTitle("Timeout (10m) - Right-click for more"),
      ).not.toBeInTheDocument();
      expect(screen.queryByTitle("Ban user")).not.toBeInTheDocument();
      expect(screen.queryByTitle("Warn user")).not.toBeInTheDocument();
    });

    it("does not show mod action buttons when isModerator is false", () => {
      render(
        withModeration(
          <ChatDisplay
            messages={[baseMessage]}
            isLoading={false}
            selectedPlatforms={["twitch"]}
          />,
          {
            isModerator: false,
            modModeActive: true,
            onDeleteMessage: vi.fn(),
            onTimeoutUser: vi.fn(),
            onBanUser: vi.fn(),
            onWarnUser: vi.fn(),
          },
        ),
      );
      expect(screen.queryByTitle("Delete message")).not.toBeInTheDocument();
    });

    it("shows delete but not timeout/ban/warn for broadcaster messages", () => {
      render(
        withModeration(
          <ChatDisplay
            messages={[broadcasterMessage]}
            isLoading={false}
            selectedPlatforms={["twitch"]}
          />,
          {
            isModerator: true,
            modModeActive: true,
            onDeleteMessage: vi.fn(),
            onTimeoutUser: vi.fn(),
            onBanUser: vi.fn(),
            onWarnUser: vi.fn(),
          },
        ),
      );
      expect(screen.getByTitle("Delete message")).toBeInTheDocument();
      expect(
        screen.queryByTitle("Timeout (10m) - Right-click for more"),
      ).not.toBeInTheDocument();
      expect(screen.queryByTitle("Ban user")).not.toBeInTheDocument();
      expect(screen.queryByTitle("Warn user")).not.toBeInTheDocument();
    });

    it("shows delete but not timeout/ban/warn for moderator messages", () => {
      render(
        withModeration(
          <ChatDisplay
            messages={[moderatorMessage]}
            isLoading={false}
            selectedPlatforms={["twitch"]}
          />,
          {
            isModerator: true,
            modModeActive: true,
            onDeleteMessage: vi.fn(),
            onTimeoutUser: vi.fn(),
            onBanUser: vi.fn(),
            onWarnUser: vi.fn(),
          },
        ),
      );
      expect(screen.getByTitle("Delete message")).toBeInTheDocument();
      expect(
        screen.queryByTitle("Timeout (10m) - Right-click for more"),
      ).not.toBeInTheDocument();
      expect(screen.queryByTitle("Ban user")).not.toBeInTheDocument();
      expect(screen.queryByTitle("Warn user")).not.toBeInTheDocument();
    });

    it("shows delete but not timeout/ban/warn for current user messages", () => {
      render(
        withModeration(
          <ChatDisplay
            messages={[ownMessage]}
            isLoading={false}
            selectedPlatforms={["twitch"]}
          />,
          {
            isModerator: true,
            modModeActive: true,
            onDeleteMessage: vi.fn(),
            onTimeoutUser: vi.fn(),
            onBanUser: vi.fn(),
            onWarnUser: vi.fn(),
          },
        ),
      );
      expect(screen.getByTitle("Delete message")).toBeInTheDocument();
      expect(
        screen.queryByTitle("Timeout (10m) - Right-click for more"),
      ).not.toBeInTheDocument();
      expect(screen.queryByTitle("Ban user")).not.toBeInTheDocument();
    });

    it("calls onDeleteMessage when delete is clicked", () => {
      const onDelete = vi.fn();
      render(
        withModeration(
          <ChatDisplay
            messages={[baseMessage]}
            isLoading={false}
            selectedPlatforms={["twitch"]}
          />,
          {
            isModerator: true,
            modModeActive: true,
            onDeleteMessage: onDelete,
            onTimeoutUser: vi.fn(),
            onBanUser: vi.fn(),
            onWarnUser: vi.fn(),
          },
        ),
      );
      fireEvent.click(screen.getByTitle("Delete message"));
      expect(onDelete).toHaveBeenCalledWith("msg-1");
    });

    it("calls onTimeoutUser when timeout is clicked", () => {
      const onTimeout = vi.fn();
      render(
        withModeration(
          <ChatDisplay
            messages={[baseMessage]}
            isLoading={false}
            selectedPlatforms={["twitch"]}
          />,
          {
            isModerator: true,
            modModeActive: true,
            onDeleteMessage: vi.fn(),
            onTimeoutUser: onTimeout,
            onBanUser: vi.fn(),
            onWarnUser: vi.fn(),
          },
        ),
      );
      fireEvent.click(
        screen.getByTitle("Timeout (10m) - Right-click for more"),
      );
      expect(onTimeout).toHaveBeenCalledWith("user-1", 600, "TestUser");
    });

    it("calls onBanUser when ban is clicked", () => {
      const onBan = vi.fn();
      render(
        withModeration(
          <ChatDisplay
            messages={[baseMessage]}
            isLoading={false}
            selectedPlatforms={["twitch"]}
          />,
          {
            isModerator: true,
            modModeActive: true,
            onDeleteMessage: vi.fn(),
            onTimeoutUser: vi.fn(),
            onBanUser: onBan,
            onWarnUser: vi.fn(),
          },
        ),
      );
      fireEvent.click(screen.getByTitle("Ban user"));
      expect(onBan).toHaveBeenCalledWith("user-1", "TestUser");
    });
  });

  describe("ChatDisplay - Timeout/Ban message undo", () => {
    it("shows Undo button for timeout messages when user is moderator", () => {
      render(
        withModeration(
          <ChatDisplay
            messages={[timeoutMessage]}
            isLoading={false}
            selectedPlatforms={["twitch"]}
          />,
          { isModerator: true, onUntimeoutUser: vi.fn() },
        ),
      );
      expect(screen.getByTitle("Undo moderation action")).toBeInTheDocument();
    });

    it("shows Undo button for ban messages when user is moderator", () => {
      render(
        withModeration(
          <ChatDisplay
            messages={[banMessage]}
            isLoading={false}
            selectedPlatforms={["twitch"]}
          />,
          { isModerator: true, onUntimeoutUser: vi.fn() },
        ),
      );
      expect(screen.getByTitle("Undo moderation action")).toBeInTheDocument();
    });

    it("calls onUntimeoutUser with targetUsername when Undo is clicked", () => {
      const onUntimeout = vi.fn();
      render(
        withModeration(
          <ChatDisplay
            messages={[timeoutMessage]}
            isLoading={false}
            selectedPlatforms={["twitch"]}
          />,
          { isModerator: true, onUntimeoutUser: onUntimeout },
        ),
      );
      fireEvent.click(screen.getByTitle("Undo moderation action"));
      expect(onUntimeout).toHaveBeenCalledWith("TimedOutUser");
    });

    it("does not show Undo button when user is not a moderator", () => {
      render(
        withModeration(
          <ChatDisplay
            messages={[timeoutMessage]}
            isLoading={false}
            selectedPlatforms={["twitch"]}
          />,
          { isModerator: false },
        ),
      );
      expect(
        screen.queryByTitle("Undo moderation action"),
      ).not.toBeInTheDocument();
    });
  });

  describe("ChatDisplay - Context Menu Mod Actions", () => {
    it("shows mod actions in context menu when isModerator and modModeActive", () => {
      const { container } = render(
        withModeration(
          <ChatDisplay
            messages={[baseMessage]}
            isLoading={false}
            selectedPlatforms={["twitch"]}
          />,
          {
            isModerator: true,
            modModeActive: true,
            compactActions: true,
            keepModActionsVisible: false,
            onDeleteMessage: vi.fn(),
            onTimeoutUser: vi.fn(),
            onBanUser: vi.fn(),
            onWarnUser: vi.fn(),
          },
        ),
      );

      const messageEl = container.querySelector('[data-message-id="msg-1"]');
      expect(messageEl).toBeTruthy();
      fireEvent.contextMenu(messageEl!);

      expect(screen.getByText("Delete")).toBeInTheDocument();
      expect(screen.getByText("Timeout (10m)")).toBeInTheDocument();
      expect(screen.getByText("Ban")).toBeInTheDocument();
      expect(screen.getByText("Warn")).toBeInTheDocument();
    });

    it("does not show mod actions in context menu when modModeActive is false", () => {
      const { container } = render(
        withModeration(
          <ChatDisplay
            messages={[baseMessage]}
            isLoading={false}
            selectedPlatforms={["twitch"]}
          />,
          {
            isModerator: true,
            modModeActive: false,
            onDeleteMessage: vi.fn(),
            onTimeoutUser: vi.fn(),
            onBanUser: vi.fn(),
            onWarnUser: vi.fn(),
          },
        ),
      );

      const messageEl = container.querySelector('[data-message-id="msg-1"]');
      expect(messageEl).toBeTruthy();
      fireEvent.contextMenu(messageEl!);

      expect(screen.queryByText("Delete")).not.toBeInTheDocument();
      expect(screen.queryByText("Timeout (10m)")).not.toBeInTheDocument();
      expect(screen.queryByText("Ban")).not.toBeInTheDocument();
      expect(screen.queryByText("Warn")).not.toBeInTheDocument();
    });

    it("hides all mod actions for broadcaster in context menu", () => {
      const { container } = render(
        withModeration(
          <ChatDisplay
            messages={[broadcasterMessage]}
            isLoading={false}
            selectedPlatforms={["twitch"]}
          />,
          {
            isModerator: true,
            modModeActive: true,
            onDeleteMessage: vi.fn(),
            onTimeoutUser: vi.fn(),
            onBanUser: vi.fn(),
            onWarnUser: vi.fn(),
          },
        ),
      );

      const messageEl = container.querySelector('[data-message-id="msg-bc"]');
      expect(messageEl).toBeTruthy();
      fireEvent.contextMenu(messageEl!);

      expect(screen.queryByText("Delete")).not.toBeInTheDocument();
      expect(screen.queryByText("Timeout (10m)")).not.toBeInTheDocument();
      expect(screen.queryByText("Ban")).not.toBeInTheDocument();
    });

    it("calls onDeleteMessage from context menu", () => {
      const onDelete = vi.fn();
      const { container } = render(
        withModeration(
          <ChatDisplay
            messages={[baseMessage]}
            isLoading={false}
            selectedPlatforms={["twitch"]}
          />,
          {
            isModerator: true,
            modModeActive: true,
            compactActions: true,
            keepModActionsVisible: false,
            onDeleteMessage: onDelete,
            onTimeoutUser: vi.fn(),
            onBanUser: vi.fn(),
            onWarnUser: vi.fn(),
          },
        ),
      );

      const messageEl = container.querySelector('[data-message-id="msg-1"]');
      fireEvent.contextMenu(messageEl!);
      fireEvent.click(screen.getByText("Delete"));
      expect(onDelete).toHaveBeenCalledWith("msg-1");
    });

    it("calls onTimeoutUser from context menu", () => {
      const onTimeout = vi.fn();
      const { container } = render(
        withModeration(
          <ChatDisplay
            messages={[baseMessage]}
            isLoading={false}
            selectedPlatforms={["twitch"]}
          />,
          {
            isModerator: true,
            modModeActive: true,
            compactActions: true,
            keepModActionsVisible: false,
            onDeleteMessage: vi.fn(),
            onTimeoutUser: onTimeout,
            onBanUser: vi.fn(),
            onWarnUser: vi.fn(),
          },
        ),
      );

      const messageEl = container.querySelector('[data-message-id="msg-1"]');
      fireEvent.contextMenu(messageEl!);
      fireEvent.click(screen.getByText("Timeout (10m)"));
      expect(onTimeout).toHaveBeenCalledWith("user-1", 600, "TestUser");
    });

    it("calls onBanUser from context menu", () => {
      const onBan = vi.fn();
      const { container } = render(
        withModeration(
          <ChatDisplay
            messages={[baseMessage]}
            isLoading={false}
            selectedPlatforms={["twitch"]}
          />,
          {
            isModerator: true,
            modModeActive: true,
            compactActions: true,
            keepModActionsVisible: false,
            onDeleteMessage: vi.fn(),
            onTimeoutUser: vi.fn(),
            onBanUser: onBan,
            onWarnUser: vi.fn(),
          },
        ),
      );

      const messageEl = container.querySelector('[data-message-id="msg-1"]');
      fireEvent.contextMenu(messageEl!);
      fireEvent.click(screen.getByText("Ban"));
      expect(onBan).toHaveBeenCalledWith("user-1", "TestUser");
    });

    it("calls onWarnUser from context menu", () => {
      const onWarn = vi.fn();
      const { container } = render(
        withModeration(
          <ChatDisplay
            messages={[baseMessage]}
            isLoading={false}
            selectedPlatforms={["twitch"]}
          />,
          {
            isModerator: true,
            modModeActive: true,
            compactActions: true,
            keepModActionsVisible: false,
            onDeleteMessage: vi.fn(),
            onTimeoutUser: vi.fn(),
            onBanUser: vi.fn(),
            onWarnUser: onWarn,
          },
        ),
      );

      const messageEl = container.querySelector('[data-message-id="msg-1"]');
      fireEvent.contextMenu(messageEl!);
      fireEvent.click(screen.getByText("Warn"));
      expect(onWarn).toHaveBeenCalledWith("TestUser");
    });
  });

  describe("UnifiedChat - Mod Actions", () => {
    const baseYtMessage = {
      id: "yt-1",
      author: "YTUser",
      parts: [{ type: "text" as const, text: "Hello from YouTube" }],
      timestamp: new Date(),
    };

    it("shows mod action buttons on Twitch messages when isModerator and modModeActive", () => {
      render(
        withModeration(
          <UnifiedChat
            channelName="testchannel"
            twitchMessages={[baseMessage]}
            ytMessages={[baseYtMessage]}
          />,
          {
            isModerator: true,
            modModeActive: true,
            onDeleteMessage: vi.fn(),
            onTimeoutUser: vi.fn(),
            onBanUser: vi.fn(),
            onWarnUser: vi.fn(),
          },
        ),
      );
      expect(screen.getByTitle("Delete message")).toBeInTheDocument();
      expect(
        screen.getByTitle("Timeout (10m) - Right-click for more"),
      ).toBeInTheDocument();
      expect(screen.getByTitle("Ban user")).toBeInTheDocument();
      expect(screen.getByTitle("Warn user")).toBeInTheDocument();
    });

    it("does not show mod action buttons when modModeActive is false", () => {
      render(
        withModeration(
          <UnifiedChat
            channelName="testchannel"
            twitchMessages={[baseMessage]}
            ytMessages={[baseYtMessage]}
          />,
          {
            isModerator: true,
            modModeActive: false,
            onDeleteMessage: vi.fn(),
            onTimeoutUser: vi.fn(),
            onBanUser: vi.fn(),
            onWarnUser: vi.fn(),
          },
        ),
      );
      expect(screen.queryByTitle("Delete message")).not.toBeInTheDocument();
      expect(
        screen.queryByTitle("Timeout (10m) - Right-click for more"),
      ).not.toBeInTheDocument();
    });

    it("shows delete but not timeout/ban/warn for broadcaster messages", () => {
      render(
        withModeration(
          <UnifiedChat
            channelName="testchannel"
            twitchMessages={[broadcasterMessage]}
            ytMessages={[]}
          />,
          {
            isModerator: true,
            modModeActive: true,
            onDeleteMessage: vi.fn(),
            onTimeoutUser: vi.fn(),
            onBanUser: vi.fn(),
            onWarnUser: vi.fn(),
          },
        ),
      );
      expect(screen.getByTitle("Delete message")).toBeInTheDocument();
      expect(
        screen.queryByTitle("Timeout (10m) - Right-click for more"),
      ).not.toBeInTheDocument();
      expect(screen.queryByTitle("Ban user")).not.toBeInTheDocument();
    });

    it("shows Undo button for timeout messages when isModerator", () => {
      render(
        withModeration(
          <UnifiedChat
            channelName="testchannel"
            twitchMessages={[timeoutMessage]}
            ytMessages={[]}
          />,
          { isModerator: true, onUntimeoutUser: vi.fn() },
        ),
      );
      expect(screen.getByTitle("Undo moderation action")).toBeInTheDocument();
    });

    it("calls onDeleteMessage from inline button", () => {
      const onDelete = vi.fn();
      render(
        withModeration(
          <UnifiedChat
            channelName="testchannel"
            twitchMessages={[baseMessage]}
            ytMessages={[]}
          />,
          {
            isModerator: true,
            modModeActive: true,
            onDeleteMessage: onDelete,
            onTimeoutUser: vi.fn(),
            onBanUser: vi.fn(),
            onWarnUser: vi.fn(),
          },
        ),
      );
      fireEvent.click(screen.getByTitle("Delete message"));
      expect(onDelete).toHaveBeenCalledWith("msg-1");
    });
  });

  describe("modActionsFirst placement (Twitch inline)", () => {
    function modActionsContainer(): HTMLElement {
      const deleteBtn = screen.getByTitle("Delete message");
      return deleteBtn.closest(".message-actions") as HTMLElement;
    }

    function renderTwitchWithModActions(modActionsFirst: boolean) {
      return render(
        withModeration(
          <UnifiedChat
            channelName="testchannel"
            twitchMessages={[baseMessage]}
            ytMessages={[]}
            onReply={vi.fn()}
          />,
          {
            isModerator: true,
            modModeActive: true,
            modActionsFirst,
            onDeleteMessage: vi.fn(),
            onTimeoutUser: vi.fn(),
            onBanUser: vi.fn(),
            onWarnUser: vi.fn(),
          },
        ),
      );
    }

    it("renders the mod strip after the inline (reply/copy) strip by default", () => {
      const { container } = renderTwitchWithModActions(false);
      const line = container.querySelector(".message-single-line")!;
      const strips = line.querySelectorAll(".message-actions");
      expect(strips).toHaveLength(2);
      const modStrip = Array.from(strips).find((s) =>
        s.querySelector('.action-button[title="Delete message"]'),
      )!;
      const inlineStrip = Array.from(strips).find(
        (s) => !s.querySelector('.action-button[title="Delete message"]'),
      )!;
      // In default mode the inline strip precedes the mod strip, and a
      // vertical divider sits between them.
      const children = Array.from(line.children);
      expect(children.indexOf(inlineStrip)).toBeLessThan(
        children.indexOf(modStrip),
      );
      expect(line.querySelector(".message-actions-divider")).not.toBeNull();
    });

    it("moves the mod strip to the start of the line when modActionsFirst is on", () => {
      const { container } = renderTwitchWithModActions(true);
      const line = container.querySelector(".message-single-line")!;
      const strips = line.querySelectorAll(".message-actions");
      expect(strips).toHaveLength(2);
      // When mod is at the start, no inline divider should be needed because
      // the two strips are already separated by the message content.
      expect(line.querySelector(".message-actions-divider")).toBeNull();
      // Mod strip must contain the mod-action buttons and be the first strip
      const modStrip = Array.from(strips).find((s) =>
        s.querySelector('.action-button[title="Delete message"]'),
      )!;
      const inlineStrip = Array.from(strips).find(
        (s) => !s.querySelector('.action-button[title="Delete message"]'),
      )!;
      expect(modStrip).toBe(strips[0]);
      expect(inlineStrip).toBe(strips[1]);
      // Mod strip appears before the timestamp in the line
      const modIdx = Array.from(line.children).indexOf(modStrip);
      const tsIdx = Array.from(line.children).indexOf(
        line.querySelector(".timestamp")!,
      );
      const inlineIdx = Array.from(line.children).indexOf(inlineStrip);
      expect(modIdx).toBeLessThan(tsIdx);
      expect(inlineIdx).toBeGreaterThan(tsIdx);
    });

    it("never renders the mod strip twice (start AND end)", () => {
      const { container } = renderTwitchWithModActions(true);
      const line = container.querySelector(".message-single-line")!;
      // One inline strip + one mod strip, never two mod strips
      expect(line.querySelectorAll(".message-actions")).toHaveLength(2);
      expect(
        line.querySelectorAll(".message-actions .action-button.mod-action"),
      ).toHaveLength(4); // delete, timeout, ban, warn
    });

    it("does not render the inline divider when modActionsFirst is on (the message content already separates the strips)", () => {
      const { container } = renderTwitchWithModActions(true);
      const line = container.querySelector(".message-single-line")!;
      expect(line.querySelector(".message-actions-divider")).toBeNull();
    });
  });

  describe("MessageInput - Mod Commands", () => {
    it("shows command menu when isModerator and typing /", () => {
      render(
        withModeration(
          <MessageInput
            onSendMessage={vi.fn()}
            isLoading={false}
            isConnected={{ twitch: true }}
            chatMessages={[baseMessage]}
            currentUsername="TestUser"
          />,
          { isModerator: true },
        ),
      );

      const textarea = screen.getByPlaceholderText("Send to Twitch...");
      fireEvent.change(textarea, { target: { value: "/" } });
      fireEvent.change(textarea, { target: { value: "/ban" } });

      expect(screen.getByText("/ban <username> [reason]")).toBeInTheDocument();
    });

    it("does not show command menu when isModerator is false", () => {
      render(
        withModeration(
          <MessageInput
            onSendMessage={vi.fn()}
            isLoading={false}
            isConnected={{ twitch: true }}
            chatMessages={[baseMessage]}
            currentUsername="TestUser"
          />,
          { isModerator: false },
        ),
      );

      const textarea = screen.getByPlaceholderText("Send to Twitch...");
      fireEvent.change(textarea, { target: { value: "/ban" } });

      expect(
        screen.queryByText("Permanently ban a user"),
      ).not.toBeInTheDocument();
    });
  });
});
