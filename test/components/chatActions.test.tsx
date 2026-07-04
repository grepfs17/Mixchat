import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import type { TwitchMessage, Platform } from "../../src/lib/types";
import type {
  UnifiedEntry,
  YTMessage,
  MessagePart,
} from "../../src/components/chat/unified/types";
import {
  ModerationContext,
  type ModerationContextValue,
} from "../../src/contexts/ModerationContext";

//Mocks

vi.mock("react-dom", async () => {
  const actual = await vi.importActual("react-dom");
  return { ...actual, createPortal: (children: React.ReactNode) => children };
});

vi.mock("../../src/lib/emotes", () => ({
  parseMessageWithEmotes: (text: string) => text,
  searchEmotes: () => [],
  getAllEmotesOrganized: () => ({}),
}));

const mockHandleCopy = vi.fn();
const mockHandleTouchStart = vi.fn();
const mockHandleTouchEnd = vi.fn();
const mockHandleTouchMove = vi.fn();

vi.mock("../../src/hooks/chat/useChatTouchGestures", () => ({
  useChatTouchGestures: () => ({
    handleCopy: mockHandleCopy,
    handleTouchStart: mockHandleTouchStart,
    handleTouchEnd: mockHandleTouchEnd,
    handleTouchMove: mockHandleTouchMove,
  }),
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

// Helpers

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

function makeTwitchMsg(overrides: Partial<TwitchMessage> = {}): TwitchMessage {
  return {
    id: "msg-1",
    platform: "twitch",
    author: "TestUser",
    content: "Hello world",
    timestamp: new Date(),
    userId: "user-1",
    ...overrides,
  };
}

function makeYTMsg(overrides: Partial<YTMessage> = {}): YTMessage {
  return {
    id: "yt-1",
    author: "YTUser",
    authorAvatar: undefined,
    parts: [{ type: "text", text: "Hello from YouTube" }],
    timestamp: new Date(),
    ...overrides,
  };
}

function makeUnifiedTwitch(msg?: TwitchMessage): UnifiedEntry {
  return { source: "twitch", msg: msg ?? makeTwitchMsg() };
}

function makeUnifiedYouTube(msg?: YTMessage): UnifiedEntry {
  return { source: "youtube", msg: msg ?? makeYTMsg() };
}

// Components

import { TwitchMessageItem as DisplayTwitchMessageItem } from "../../src/components/chat/display/TwitchMessageItem";
import ChatDisplay from "../../src/components/chat/display";
import { TwitchMessageItem as UnifiedTwitchMessageItem } from "../../src/components/chat/unified/TwitchMessageItem";
import { YouTubeMessageItem } from "../../src/components/chat/unified/YouTubeMessageItem";
import MessageMenu from "../../src/components/chat/shared/MessageMenu";
import TimeoutMenu from "../../src/components/chat/shared/TimeoutMenu";
import UnifiedChat from "../../src/components/chat/unified";

//  DisplayTwitchMessageItem (used in Split / display chat)
describe("TwitchMessageItem (Split Chat)", () => {
  const baseProps = {
    msg: makeTwitchMsg(),
    index: 0,
    filteredMessages: [makeTwitchMsg()],
    authorColorById: new Map<string, string>(),
    onCopy: vi.fn(),
    onTimeoutMenu: vi.fn(),
    onScrollToMessage: vi.fn(),
    onTouchStart: vi.fn(),
    onTouchEnd: vi.fn(),
    onTouchMove: vi.fn(),
    onContextMenu: vi.fn(),
  };

  it("shows reply button when onReply is provided", () => {
    render(<DisplayTwitchMessageItem {...baseProps} onReply={vi.fn()} />);
    expect(screen.getByTitle("Reply to this message")).toBeInTheDocument();
  });

  it("does not show reply button when onReply is not provided", () => {
    render(<DisplayTwitchMessageItem {...baseProps} />);
    expect(
      screen.queryByTitle("Reply to this message"),
    ).not.toBeInTheDocument();
  });

  it("calls onReply when reply button is clicked", () => {
    const onReply = vi.fn();
    render(<DisplayTwitchMessageItem {...baseProps} onReply={onReply} />);
    fireEvent.click(screen.getByTitle("Reply to this message"));
    expect(onReply).toHaveBeenCalledWith(baseProps.msg);
  });

  it("calls onCopy when copy button is clicked", () => {
    const onCopy = vi.fn();
    render(<DisplayTwitchMessageItem {...baseProps} onCopy={onCopy} />);
    fireEvent.click(screen.getByTitle("Copy message"));
    expect(onCopy).toHaveBeenCalledWith(baseProps.msg);
  });

  it("hides action buttons in compact mode", () => {
    const { container } = render(
      withModeration(
        <DisplayTwitchMessageItem {...baseProps} onReply={vi.fn()} />,
        { compactActions: true },
      ),
    );
    expect(container.querySelector(".message-actions")).not.toBeInTheDocument();
  });

  it("keeps mod actions visible in compact mode when keepModActionsVisible is true", () => {
    render(
      withModeration(<DisplayTwitchMessageItem {...baseProps} />, {
        compactActions: true,
        keepModActionsVisible: true,
        isModerator: true,
        modModeActive: true,
        onDeleteMessage: vi.fn(),
        onTimeoutUser: vi.fn(),
        onBanUser: vi.fn(),
        onWarnUser: vi.fn(),
      }),
    );
    expect(screen.getByTitle("Delete message")).toBeInTheDocument();
    expect(
      screen.getByTitle("Timeout (10m) - Right-click for more"),
    ).toBeInTheDocument();
    expect(screen.getByTitle("Ban user")).toBeInTheDocument();
    expect(screen.getByTitle("Warn user")).toBeInTheDocument();
  });

  it("hides mod actions in compact mode when keepModActionsVisible is false", () => {
    const { container } = render(
      withModeration(<DisplayTwitchMessageItem {...baseProps} />, {
        compactActions: true,
        keepModActionsVisible: false,
        isModerator: true,
        modModeActive: true,
        onDeleteMessage: vi.fn(),
        onTimeoutUser: vi.fn(),
        onBanUser: vi.fn(),
        onWarnUser: vi.fn(),
      }),
    );
    expect(container.querySelector(".message-actions")).not.toBeInTheDocument();
  });

  it("shows undo button for timeout messages", () => {
    const msg = makeTwitchMsg({
      messageType: "timeout",
      targetUsername: "BadUser",
    });
    const onUntimeout = vi.fn();
    render(
      withModeration(<DisplayTwitchMessageItem {...baseProps} msg={msg} />, {
        isModerator: true,
        onUntimeoutUser: onUntimeout,
      }),
    );
    expect(screen.getByTitle("Undo moderation action")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Undo moderation action"));
    expect(onUntimeout).toHaveBeenCalledWith("BadUser");
  });

  it("calls onContextMenu on right-click", () => {
    const onContextMenu = vi.fn();
    const { container } = render(
      <DisplayTwitchMessageItem {...baseProps} onContextMenu={onContextMenu} />,
    );
    const messageEl = container.querySelector(".message")!;
    fireEvent.contextMenu(messageEl);
    expect(onContextMenu).toHaveBeenCalledTimes(1);
  });

  it("renders mod action buttons when mod mode is active", () => {
    render(
      withModeration(<DisplayTwitchMessageItem {...baseProps} />, {
        isModerator: true,
        modModeActive: true,
        onDeleteMessage: vi.fn(),
        onTimeoutUser: vi.fn(),
        onBanUser: vi.fn(),
        onWarnUser: vi.fn(),
      }),
    );
    expect(screen.getByTitle("Delete message")).toBeInTheDocument();
    expect(
      screen.getByTitle("Timeout (10m) - Right-click for more"),
    ).toBeInTheDocument();
    expect(screen.getByTitle("Ban user")).toBeInTheDocument();
    expect(screen.getByTitle("Warn user")).toBeInTheDocument();
  });
});

//  UnifiedTwitchMessageItem (used in Unified chat)

describe("TwitchMessageItem (Unified Chat)", () => {
  const baseProps = {
    entry: makeUnifiedTwitch(),
    index: 0,
    entries: [makeUnifiedTwitch()],
    onTimeoutMenu: vi.fn(),
    onMessageMenu: vi.fn(),
    onTouchStart: vi.fn(),
    onTouchEnd: vi.fn(),
    onTouchMove: vi.fn(),
  };

  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows reply button when onReply is provided", () => {
    render(<UnifiedTwitchMessageItem {...baseProps} onReply={vi.fn()} />);
    expect(screen.getByTitle("Reply to this message")).toBeInTheDocument();
  });

  it("calls onReply when reply button clicked", () => {
    const onReply = vi.fn();
    render(<UnifiedTwitchMessageItem {...baseProps} onReply={onReply} />);
    fireEvent.click(screen.getByTitle("Reply to this message"));
    expect(onReply).toHaveBeenCalledWith(baseProps.entry.msg);
  });

  it("copies to clipboard and fires onCopyMessage when copy button clicked", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const onCopyMessage = vi.fn();
    render(
      <UnifiedTwitchMessageItem {...baseProps} onCopyMessage={onCopyMessage} />,
    );
    fireEvent.click(screen.getByTitle("Copy message"));
    expect(writeText).toHaveBeenCalledWith("Hello world");
    await vi.waitFor(() => {
      expect(onCopyMessage).toHaveBeenCalled();
    });
  });

  it("shows undo button for timeout messages", () => {
    const msg = makeTwitchMsg({
      messageType: "timeout",
      targetUsername: "BadUser",
    });
    const onUntimeout = vi.fn();
    render(
      withModeration(
        <UnifiedTwitchMessageItem
          {...baseProps}
          entry={makeUnifiedTwitch(msg)}
        />,
        { isModerator: true, onUntimeoutUser: onUntimeout },
      ),
    );
    expect(screen.getByTitle("Undo moderation action")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Undo moderation action"));
    expect(onUntimeout).toHaveBeenCalledWith("BadUser");
  });

  it("opens message menu on right-click", () => {
    const onMessageMenu = vi.fn();
    const { container } = render(
      <UnifiedTwitchMessageItem {...baseProps} onMessageMenu={onMessageMenu} />,
    );
    const messageEl = container.querySelector(".message")!;
    fireEvent.contextMenu(messageEl);
    expect(onMessageMenu).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      baseProps.entry,
    );
  });

  it("renders mod action buttons when mod mode is active", () => {
    render(
      withModeration(<UnifiedTwitchMessageItem {...baseProps} />, {
        isModerator: true,
        modModeActive: true,
        onDeleteMessage: vi.fn(),
        onTimeoutUser: vi.fn(),
        onBanUser: vi.fn(),
        onWarnUser: vi.fn(),
      }),
    );
    expect(screen.getByTitle("Delete message")).toBeInTheDocument();
    expect(
      screen.getByTitle("Timeout (10m) - Right-click for more"),
    ).toBeInTheDocument();
    expect(screen.getByTitle("Ban user")).toBeInTheDocument();
    expect(screen.getByTitle("Warn user")).toBeInTheDocument();
  });

  it("hides action buttons in compact mode", () => {
    const { container } = render(
      withModeration(
        <UnifiedTwitchMessageItem {...baseProps} onReply={vi.fn()} />,
        { compactActions: true },
      ),
    );
    expect(container.querySelector(".message-actions")).not.toBeInTheDocument();
  });

  it("does not show mod actions for broadcaster messages", () => {
    const bcMsg = makeTwitchMsg({
      badges: { broadcaster: "1" },
    });
    render(
      withModeration(
        <UnifiedTwitchMessageItem
          {...baseProps}
          entry={makeUnifiedTwitch(bcMsg)}
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

  it("opens timeout submenu on right-click of timeout button", () => {
    const onTimeoutMenu = vi.fn();
    render(
      withModeration(
        <UnifiedTwitchMessageItem
          {...baseProps}
          onTimeoutMenu={onTimeoutMenu}
        />,
        {
          isModerator: true,
          modModeActive: true,
          onTimeoutUser: vi.fn(),
        },
      ),
    );
    const timeoutBtn = screen.getByTitle(
      "Timeout (10m) - Right-click for more",
    );
    fireEvent.contextMenu(timeoutBtn);
    expect(onTimeoutMenu).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      "user-1",
      "TestUser",
    );
  });
});

//  YouTubeMessageItem (Unified)
describe("YouTubeMessageItem (Unified Chat)", () => {
  const baseProps = {
    entry: makeUnifiedYouTube(),
    index: 0,
    onTouchStart: vi.fn(),
    onTouchEnd: vi.fn(),
    onTouchMove: vi.fn(),
  };

  it("renders message content without action buttons", () => {
    render(<YouTubeMessageItem {...baseProps} />);
    expect(screen.getByText("YTUser")).toBeInTheDocument();
    expect(screen.getByText("Hello from YouTube")).toBeInTheDocument();
    expect(screen.queryByTitle("Copy message")).not.toBeInTheDocument();
    expect(
      screen.queryByTitle("Reply to this message"),
    ).not.toBeInTheDocument();
  });

  it("fires touch handlers on touch events", () => {
    const { container } = render(<YouTubeMessageItem {...baseProps} />);
    const el = container.querySelector(".message")!;
    fireEvent.touchStart(el);
    expect(baseProps.onTouchStart).toHaveBeenCalledWith(baseProps.entry);
    fireEvent.touchEnd(el);
    expect(baseProps.onTouchEnd).toHaveBeenCalledWith(baseProps.entry);
  });

  it("renders event messages with config styles", () => {
    const eventMsg = makeYTMsg({
      messageType: "membership",
      superchat: { amount: "$4.99", color: "#0f9d58" },
    });
    const { container } = render(
      <YouTubeMessageItem
        {...baseProps}
        entry={makeUnifiedYouTube(eventMsg)}
      />,
    );
    const label = container.querySelector(".yt-event-label");
    expect(label).toBeInTheDocument();
    expect(label).toHaveTextContent("MEMBER");
  });

  it("renders super chat with amount", () => {
    const scMsg = makeYTMsg({
      superchat: { amount: "$20.00", color: "#ff4444" },
    });
    render(
      <YouTubeMessageItem {...baseProps} entry={makeUnifiedYouTube(scMsg)} />,
    );
    expect(screen.getByText("[$20.00]")).toBeInTheDocument();
  });

  it("renders the YouTube-style deleted-by-moderator text", () => {
    const deletedMsg = makeYTMsg({ isDeleted: true });
    render(
      <YouTubeMessageItem
        {...baseProps}
        entry={makeUnifiedYouTube(deletedMsg)}
      />,
    );
    expect(
      screen.getByText("Message deleted by a moderator"),
    ).toBeInTheDocument();
  });
});

//  MessageMenu (context menu)
describe("MessageMenu (Context Menu)", () => {
  const baseProps = {
    x: 100,
    y: 200,
    entry: makeTwitchMsg(),
    onCopy: vi.fn(),
    onClose: vi.fn(),
  };

  it("shows Copy message and Reply items for a Twitch chat message", () => {
    render(<MessageMenu {...baseProps} onReply={vi.fn()} />);
    expect(screen.getByText("Copy message")).toBeInTheDocument();
    expect(screen.getByText("Reply")).toBeInTheDocument();
  });

  it("calls onCopy with message when Copy message is clicked", () => {
    const onCopy = vi.fn();
    render(<MessageMenu {...baseProps} onCopy={onCopy} onReply={vi.fn()} />);
    fireEvent.click(screen.getByText("Copy message"));
    expect(onCopy).toHaveBeenCalledWith(baseProps.entry);
    expect(baseProps.onClose).toHaveBeenCalled();
  });

  it("calls onReply with TwitchMessage when Reply is clicked", () => {
    const onReply = vi.fn();
    const msg = makeTwitchMsg();
    render(<MessageMenu {...baseProps} entry={msg} onReply={onReply} />);
    fireEvent.click(screen.getByText("Reply"));
    expect(onReply).toHaveBeenCalledWith(msg);
    expect(baseProps.onClose).toHaveBeenCalled();
  });

  it("shows View History when onViewHistory is provided", () => {
    render(<MessageMenu {...baseProps} onViewHistory={vi.fn()} />);
    expect(screen.getByText("View History")).toBeInTheDocument();
  });

  it("calls onViewHistory with author and avatar", () => {
    const onViewHistory = vi.fn();
    render(
      <MessageMenu
        {...baseProps}
        onViewHistory={onViewHistory}
        entry={makeTwitchMsg({
          author: "Alice",
          authorAvatar: "https://example.com/avatar.png",
        })}
      />,
    );
    fireEvent.click(screen.getByText("View History"));
    expect(onViewHistory).toHaveBeenCalledWith(
      "Alice",
      "https://example.com/avatar.png",
    );
  });

  it("shows mod actions when mod mode is active", () => {
    render(
      withModeration(<MessageMenu {...baseProps} />, {
        isModerator: true,
        modModeActive: true,
        compactActions: true,
        keepModActionsVisible: false,
        onDeleteMessage: vi.fn(),
        onTimeoutUser: vi.fn(),
        onBanUser: vi.fn(),
        onWarnUser: vi.fn(),
      }),
    );
    expect(screen.getByText("Delete")).toBeInTheDocument();
    expect(screen.getByText("Timeout (10m)")).toBeInTheDocument();
    expect(screen.getByText("Ban")).toBeInTheDocument();
    expect(screen.getByText("Warn")).toBeInTheDocument();
  });

  it("keeps natural order (Reply, Copy, View History) in compact mode", () => {
    const { container } = render(
      withModeration(
        <MessageMenu
          {...baseProps}
          onReply={vi.fn()}
          onViewHistory={vi.fn()}
        />,
        { compactActions: true },
      ),
    );
    const buttons = container.querySelectorAll(".context-menu-item");
    const labels = Array.from(buttons).map((b) => b.textContent);
    expect(labels).toEqual(["Reply", "Copy message", "View History"]);
  });

  it("works with UnifiedEntry (YouTube)", () => {
    const onCopy = vi.fn();
    render(
      <MessageMenu
        {...baseProps}
        entry={makeUnifiedYouTube()}
        onCopy={onCopy}
      />,
    );
    expect(screen.getByText("Copy message")).toBeInTheDocument();
    expect(screen.queryByText("Reply")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Copy message"));
    expect(onCopy).toHaveBeenCalled();
  });

  it("works with UnifiedEntry (Twitch)", () => {
    render(
      <MessageMenu
        {...baseProps}
        entry={makeUnifiedTwitch()}
        onReply={vi.fn()}
      />,
    );
    expect(screen.getByText("Copy message")).toBeInTheDocument();
    expect(screen.getByText("Reply")).toBeInTheDocument();
  });

  it("does not show mod actions for non-Twitch entries", () => {
    render(
      withModeration(
        <MessageMenu {...baseProps} entry={makeUnifiedYouTube()} />,
        {
          isModerator: true,
          modModeActive: true,
        },
      ),
    );
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
    expect(screen.queryByText("Timeout (10m)")).not.toBeInTheDocument();
  });

  it("renders author header", () => {
    render(
      <MessageMenu
        {...baseProps}
        entry={makeTwitchMsg({ author: "CoolUser" })}
      />,
    );
    expect(screen.getByText("@CoolUser")).toBeInTheDocument();
  });

  it("does not show Reply for system messages", () => {
    const sysMsg = makeTwitchMsg({
      messageType: "timeout",
      content: "User was timed out",
      targetUsername: "BadUser",
    });
    render(<MessageMenu {...baseProps} entry={sysMsg} onReply={vi.fn()} />);
    expect(screen.queryByText("Reply")).not.toBeInTheDocument();
    expect(screen.getByText("Copy message")).toBeInTheDocument();
  });
});

//  TimeoutMenu
describe("TimeoutMenu", () => {
  it("renders timeout options", () => {
    render(
      <TimeoutMenu
        userId="user-1"
        username="BadUser"
        x={100}
        y={200}
        onTimeout={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Timeout BadUser")).toBeInTheDocument();
    expect(screen.getByText("10 Seconds")).toBeInTheDocument();
    expect(screen.getByText("10 Minutes")).toBeInTheDocument();
    expect(screen.getByText("1 Day")).toBeInTheDocument();
  });

  it("calls onTimeout and onClose when an option is clicked", () => {
    const onTimeout = vi.fn();
    const onClose = vi.fn();
    render(
      <TimeoutMenu
        userId="user-1"
        username="BadUser"
        x={100}
        y={200}
        onTimeout={onTimeout}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByText("1 Day"));
    expect(onTimeout).toHaveBeenCalledWith("user-1", 86400, "BadUser");
    expect(onClose).toHaveBeenCalled();
  });
});

//  ChatDisplay Integration (Split Chat)
describe("ChatDisplay Integration — Actions", () => {
  const defaultProps = {
    messages: [] as TwitchMessage[],
    isLoading: false,
    selectedPlatforms: ["twitch"] as Platform[],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens MessageMenu on right-click and triggers copy", () => {
    const msg = makeTwitchMsg();
    const onReply = vi.fn();
    const onCopyMessage = vi.fn();
    const { container } = render(
      <ChatDisplay
        {...defaultProps}
        messages={[msg]}
        onReply={onReply}
        onCopyMessage={onCopyMessage}
      />,
    );

    const messageEl = container.querySelector('[data-message-id="msg-1"]')!;
    fireEvent.contextMenu(messageEl);

    expect(screen.getByText("Copy message")).toBeInTheDocument();
    expect(screen.getByText("Reply")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Reply"));
    expect(onReply).toHaveBeenCalledWith(msg);
  });

  it("opens TimeoutMenu on right-click of timeout inline button", () => {
    const msg = makeTwitchMsg();
    const onTimeoutUser = vi.fn();
    render(
      withModeration(<ChatDisplay {...defaultProps} messages={[msg]} />, {
        isModerator: true,
        modModeActive: true,
        onDeleteMessage: vi.fn(),
        onTimeoutUser,
        onBanUser: vi.fn(),
        onWarnUser: vi.fn(),
      }),
    );

    const timeoutBtn = screen.getByTitle(
      "Timeout (10m) - Right-click for more",
    );
    fireEvent.contextMenu(timeoutBtn);

    expect(screen.getByText("Timeout TestUser")).toBeInTheDocument();
    expect(screen.getByText("10 Seconds")).toBeInTheDocument();

    fireEvent.click(screen.getByText("10 Seconds"));
    expect(onTimeoutUser).toHaveBeenCalledWith("user-1", 10, "TestUser");
  });

  it("fires onCopyMessage from inline copy button", () => {
    const msg = makeTwitchMsg();
    render(
      <ChatDisplay
        {...defaultProps}
        messages={[msg]}
        onCopyMessage={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTitle("Copy message"));
    expect(mockHandleCopy).toHaveBeenCalledWith(msg);
  });

  it("shows undo button for timeout messages when moderator", () => {
    const timeoutMsg = makeTwitchMsg({
      id: "msg-timeout",
      author: "system",
      messageType: "timeout",
      targetUsername: "BadUser",
    });
    const onUntimeoutUser = vi.fn();
    render(
      withModeration(
        <ChatDisplay {...defaultProps} messages={[timeoutMsg]} />,
        { isModerator: true, onUntimeoutUser },
      ),
    );
    expect(screen.getByTitle("Undo moderation action")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Undo moderation action"));
    expect(onUntimeoutUser).toHaveBeenCalledWith("BadUser");
  });

  it("calls inline timeout on left-click", () => {
    const msg = makeTwitchMsg();
    const onTimeoutUser = vi.fn();
    render(
      withModeration(<ChatDisplay {...defaultProps} messages={[msg]} />, {
        isModerator: true,
        modModeActive: true,
        onTimeoutUser,
      }),
    );

    const timeoutBtn = screen.getByTitle(
      "Timeout (10m) - Right-click for more",
    );
    fireEvent.click(timeoutBtn);
    expect(onTimeoutUser).toHaveBeenCalledWith("user-1", 600, "TestUser");
  });

  it("calls inline ban on click", () => {
    const msg = makeTwitchMsg();
    const onBanUser = vi.fn();
    render(
      withModeration(<ChatDisplay {...defaultProps} messages={[msg]} />, {
        isModerator: true,
        modModeActive: true,
        onBanUser,
      }),
    );
    fireEvent.click(screen.getByTitle("Ban user"));
    expect(onBanUser).toHaveBeenCalledWith("user-1", "TestUser");
  });

  it("calls inline warn on click", () => {
    const msg = makeTwitchMsg();
    const onWarnUser = vi.fn();
    render(
      withModeration(<ChatDisplay {...defaultProps} messages={[msg]} />, {
        isModerator: true,
        modModeActive: true,
        onWarnUser,
      }),
    );
    fireEvent.click(screen.getByTitle("Warn user"));
    expect(onWarnUser).toHaveBeenCalledWith("TestUser");
  });
});

//  UnifiedChat Integration
describe("UnifiedChat Integration — Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens MessageMenu on right-click of Twitch message and fires copy", () => {
    const twitchMsgs = [makeTwitchMsg()];
    const onReply = vi.fn();
    const onCopyMessage = vi.fn();
    const { container } = render(
      <UnifiedChat
        twitchMessages={twitchMsgs}
        ytMessages={[]}
        channelName="testchannel"
        onReply={onReply}
        onCopyMessage={onCopyMessage}
      />,
    );

    const messageEl = container.querySelector('[data-message-id="msg-1"]')!;
    fireEvent.contextMenu(messageEl);

    expect(screen.getByText("Copy message")).toBeInTheDocument();
    expect(screen.getByText("Reply")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Reply"));
    expect(onReply).toHaveBeenCalledWith(twitchMsgs[0]);
  });

  it("opens TimeoutMenu on right-click of timeout inline button", () => {
    const twitchMsgs = [makeTwitchMsg()];
    const onTimeoutUser = vi.fn();
    render(
      withModeration(
        <UnifiedChat
          channelName="testchannel"
          twitchMessages={twitchMsgs}
          ytMessages={[]}
        />,
        {
          isModerator: true,
          modModeActive: true,
          onDeleteMessage: vi.fn(),
          onTimeoutUser,
          onBanUser: vi.fn(),
          onWarnUser: vi.fn(),
        },
      ),
    );

    const timeoutBtn = screen.getByTitle(
      "Timeout (10m) - Right-click for more",
    );
    fireEvent.contextMenu(timeoutBtn);

    expect(screen.getByText("Timeout TestUser")).toBeInTheDocument();
    expect(screen.getByText("10 Seconds")).toBeInTheDocument();

    fireEvent.click(screen.getByText("1 Day"));
    expect(onTimeoutUser).toHaveBeenCalledWith("user-1", 86400, "TestUser");
  });

  it("shows View History from context menu and opens overlay", () => {
    const twitchMsgs = [
      makeTwitchMsg({
        author: "HistoryUser",
        authorAvatar: "https://example.com/avatar.png",
      }),
    ];
    const { container } = render(
      <UnifiedChat
        channelName="testchannel"
        twitchMessages={twitchMsgs}
        ytMessages={[]}
      />,
    );

    const messageEl = container.querySelector('[data-message-id="msg-1"]')!;
    fireEvent.contextMenu(messageEl);

    expect(screen.getByText("View History")).toBeInTheDocument();
    fireEvent.click(screen.getByText("View History"));

    const overlay = container.querySelector(".chatter-history-overlay");
    expect(overlay).toBeInTheDocument();
    expect(screen.getByText("HistoryUser")).toBeInTheDocument();
    expect(screen.getByText("Twitch Chatter")).toBeInTheDocument();
  });

  it("triggers copy from inline copy button on Twitch message", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const onCopyMessageCb = vi.fn();

    const twitchMsgs = [makeTwitchMsg({ content: "Copy this text" })];
    render(
      <UnifiedChat
        channelName="testchannel"
        twitchMessages={twitchMsgs}
        ytMessages={[]}
        onCopyMessage={onCopyMessageCb}
      />,
    );

    fireEvent.click(screen.getByTitle("Copy message"));
    expect(writeText).toHaveBeenCalledWith("Copy this text");
    await vi.waitFor(() => {
      expect(onCopyMessageCb).toHaveBeenCalled();
    });
  });

  it("fires inline reply on Twitch message", () => {
    const twitchMsgs = [makeTwitchMsg()];
    const onReply = vi.fn();
    render(
      <UnifiedChat
        channelName="testchannel"
        twitchMessages={twitchMsgs}
        ytMessages={[]}
        onReply={onReply}
      />,
    );

    fireEvent.click(screen.getByTitle("Reply to this message"));
    expect(onReply).toHaveBeenCalledWith(twitchMsgs[0]);
  });

  it("shows mod action buttons in mod mode", () => {
    const twitchMsgs = [makeTwitchMsg()];
    render(
      withModeration(
        <UnifiedChat
          channelName="testchannel"
          twitchMessages={twitchMsgs}
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
      screen.getByTitle("Timeout (10m) - Right-click for more"),
    ).toBeInTheDocument();
    expect(screen.getByTitle("Ban user")).toBeInTheDocument();
    expect(screen.getByTitle("Warn user")).toBeInTheDocument();
  });

  it("calls onDeleteMessage from inline button", () => {
    const twitchMsgs = [makeTwitchMsg()];
    const onDeleteMessage = vi.fn();
    render(
      withModeration(
        <UnifiedChat
          channelName="testchannel"
          twitchMessages={twitchMsgs}
          ytMessages={[]}
        />,
        {
          isModerator: true,
          modModeActive: true,
          onDeleteMessage,
          onTimeoutUser: vi.fn(),
          onBanUser: vi.fn(),
          onWarnUser: vi.fn(),
        },
      ),
    );

    fireEvent.click(screen.getByTitle("Delete message"));
    expect(onDeleteMessage).toHaveBeenCalledWith("msg-1");
  });

  it("renders YouTube messages alongside Twitch messages", () => {
    const twitchMsgs = [
      makeTwitchMsg({ author: "TwitchViewer", content: "Twitch chat" }),
    ];
    const ytMsgs = [
      makeYTMsg({
        author: "YTViewer",
        parts: [{ type: "text", text: "YouTube chat" }],
      }),
    ];

    render(
      <UnifiedChat
        channelName="testchannel"
        twitchMessages={twitchMsgs}
        ytMessages={ytMsgs}
      />,
    );

    expect(screen.getByText("TwitchViewer")).toBeInTheDocument();
    expect(screen.getByText("YTViewer")).toBeInTheDocument();
    expect(screen.getByText("Twitch chat")).toBeInTheDocument();
    expect(screen.getByText("YouTube chat")).toBeInTheDocument();
  });
});
