import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import type { YTMessage } from "../../src/components/chat/unified/types";
import {
  ModerationContext,
  type ModerationContextValue,
} from "../../src/contexts/ModerationContext";
import { YouTubeMessageContent } from "../../src/components/chat/shared/YouTubeMessageContent";
import { YouTubeMessageItem } from "../../src/components/chat/unified/YouTubeMessageItem";
import MessageMenu from "../../src/components/chat/shared/MessageMenu";

vi.mock("react-dom", async () => {
  const actual = await vi.importActual("react-dom");
  return { ...actual, createPortal: (children: React.ReactNode) => children };
});

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
        isYouTubeModerator: false,
        youtubeModModeActive: false,
        youtubeVideoId: "vid-1",
        ...values,
      }}
    >
      {ui}
    </ModerationContext.Provider>
  );
}

function makeYTMsg(overrides: Partial<YTMessage> = {}): YTMessage {
  return {
    id: "yt-1",
    author: "YTUser",
    authorChannelId: "UCyt123",
    parts: [{ type: "text" as const, text: "Hello from YouTube" }],
    timestamp: new Date(),
    ...overrides,
  };
}

function makeUnifiedYT(msg: YTMessage) {
  return { source: "youtube" as const, msg };
}

describe("YouTube Moderator Mode", () => {
  describe("YouTubeMessageContent - Mod Actions", () => {
    it("renders inline mod action buttons when isYouTubeModerator and youtubeModModeActive", () => {
      render(
        withModeration(<YouTubeMessageContent msg={makeYTMsg()} />, {
          isYouTubeModerator: true,
          youtubeModModeActive: true,
          onDeleteYouTubeMessage: vi.fn(),
          onTimeoutYouTubeUser: vi.fn(),
          onBanYouTubeUser: vi.fn(),
        }),
      );
      expect(screen.getByTitle("Delete message")).toBeInTheDocument();
      expect(
        screen.getByTitle("Timeout (10m) - Right-click for more"),
      ).toBeInTheDocument();
      expect(screen.getByTitle(/Ban \(this chat\)/)).toBeInTheDocument();
    });

    it("does not render mod action buttons when youtubeModModeActive is false", () => {
      render(
        withModeration(<YouTubeMessageContent msg={makeYTMsg()} />, {
          isYouTubeModerator: true,
          youtubeModModeActive: false,
        }),
      );
      expect(screen.queryByTitle("Delete message")).not.toBeInTheDocument();
      expect(
        screen.queryByTitle("Timeout (10m) - Right-click for more"),
      ).not.toBeInTheDocument();
      expect(screen.queryByTitle(/Ban \(this chat\)/)).not.toBeInTheDocument();
    });

    it("does not render mod action buttons when isYouTubeModerator is false", () => {
      render(
        withModeration(<YouTubeMessageContent msg={makeYTMsg()} />, {
          isYouTubeModerator: false,
          youtubeModModeActive: true,
        }),
      );
      expect(screen.queryByTitle("Delete message")).not.toBeInTheDocument();
    });

    it("hides timeout/ban for moderator-authored messages", () => {
      const modMsg = makeYTMsg({
        authorIsModerator: true,
        author: "ChannelMod",
      });
      render(
        withModeration(<YouTubeMessageContent msg={modMsg} />, {
          isYouTubeModerator: true,
          youtubeModModeActive: true,
          onDeleteYouTubeMessage: vi.fn(),
          onTimeoutYouTubeUser: vi.fn(),
          onBanYouTubeUser: vi.fn(),
        }),
      );
      expect(screen.getByTitle("Delete message")).toBeInTheDocument();
      expect(
        screen.queryByTitle("Timeout (10m) - Right-click for more"),
      ).not.toBeInTheDocument();
      expect(screen.queryByTitle(/Ban \(this chat\)/)).not.toBeInTheDocument();
    });

    it("hides timeout/ban for owner-authored messages", () => {
      const ownerMsg = makeYTMsg({ authorIsOwner: true, author: "Owner" });
      render(
        withModeration(<YouTubeMessageContent msg={ownerMsg} />, {
          isYouTubeModerator: true,
          youtubeModModeActive: true,
          onDeleteYouTubeMessage: vi.fn(),
          onTimeoutYouTubeUser: vi.fn(),
          onBanYouTubeUser: vi.fn(),
        }),
      );
      expect(screen.getByTitle("Delete message")).toBeInTheDocument();
      expect(
        screen.queryByTitle("Timeout (10m) - Right-click for more"),
      ).not.toBeInTheDocument();
      expect(screen.queryByTitle(/Ban \(this chat\)/)).not.toBeInTheDocument();
    });

    it("hides timeout/ban for the signed-in user's own messages", () => {
      const myMsg = makeYTMsg({ authorChannelId: "UC-mine" });
      render(
        withModeration(<YouTubeMessageContent msg={myMsg} />, {
          isYouTubeModerator: true,
          youtubeModModeActive: true,
          youtubeOwnChannelId: "UC-mine",
          onDeleteYouTubeMessage: vi.fn(),
          onTimeoutYouTubeUser: vi.fn(),
          onBanYouTubeUser: vi.fn(),
        }),
      );
      expect(screen.getByTitle("Delete message")).toBeInTheDocument();
      expect(
        screen.queryByTitle("Timeout (10m) - Right-click for more"),
      ).not.toBeInTheDocument();
      expect(screen.queryByTitle(/Ban \(this chat\)/)).not.toBeInTheDocument();
    });

    it("does not render mod actions for messages without an authorChannelId", () => {
      const anon = makeYTMsg({ authorChannelId: undefined });
      render(
        withModeration(<YouTubeMessageContent msg={anon} />, {
          isYouTubeModerator: true,
          youtubeModModeActive: true,
        }),
      );
      expect(screen.queryByTitle("Delete message")).not.toBeInTheDocument();
    });

    it("calls onDeleteYouTubeMessage with the message id when delete is clicked", () => {
      const onDelete = vi.fn();
      render(
        withModeration(<YouTubeMessageContent msg={makeYTMsg()} />, {
          isYouTubeModerator: true,
          youtubeModModeActive: true,
          onDeleteYouTubeMessage: onDelete,
          onTimeoutYouTubeUser: vi.fn(),
          onBanYouTubeUser: vi.fn(),
        }),
      );
      fireEvent.click(screen.getByTitle("Delete message"));
      expect(onDelete).toHaveBeenCalledWith("yt-1");
    });

    it("calls onTimeoutYouTubeUser with channelId, 600s and author when timeout is clicked", () => {
      const onTimeout = vi.fn();
      render(
        withModeration(<YouTubeMessageContent msg={makeYTMsg()} />, {
          isYouTubeModerator: true,
          youtubeModModeActive: true,
          onDeleteYouTubeMessage: vi.fn(),
          onTimeoutYouTubeUser: onTimeout,
          onBanYouTubeUser: vi.fn(),
        }),
      );
      fireEvent.click(
        screen.getByTitle("Timeout (10m) - Right-click for more"),
      );
      expect(onTimeout).toHaveBeenCalledWith("UCyt123", 600, "YTUser");
    });

    it("calls onBanYouTubeUser with channelId and author when ban is clicked", () => {
      const onBan = vi.fn();
      render(
        withModeration(<YouTubeMessageContent msg={makeYTMsg()} />, {
          isYouTubeModerator: true,
          youtubeModModeActive: true,
          onDeleteYouTubeMessage: vi.fn(),
          onTimeoutYouTubeUser: vi.fn(),
          onBanYouTubeUser: onBan,
        }),
      );
      fireEvent.click(screen.getByTitle(/Ban \(this chat\)/));
      expect(onBan).toHaveBeenCalledWith("UCyt123", "YTUser");
    });

    it("right-click on the message bubbles onContextMenu prop", () => {
      const onContextMenu = vi.fn();
      const { container } = render(
        withModeration(
          <YouTubeMessageContent
            msg={makeYTMsg()}
            onContextMenu={onContextMenu}
          />,
          {
            isYouTubeModerator: true,
            youtubeModModeActive: true,
          },
        ),
      );
      const messageEl = container.querySelector(".message")!;
      fireEvent.contextMenu(messageEl);
      expect(onContextMenu).toHaveBeenCalled();
    });
  });

  describe("YouTubeMessageItem (Unified) - Mod Actions", () => {
    const baseEntry = makeUnifiedYT(makeYTMsg());

    const baseProps = {
      entry: baseEntry,
      index: 0,
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

    it("renders mod action buttons in mod mode", () => {
      render(
        withModeration(<YouTubeMessageItem {...baseProps} />, {
          isYouTubeModerator: true,
          youtubeModModeActive: true,
          onDeleteYouTubeMessage: vi.fn(),
          onTimeoutYouTubeUser: vi.fn(),
          onBanYouTubeUser: vi.fn(),
        }),
      );
      expect(screen.getByTitle("Delete message")).toBeInTheDocument();
      expect(
        screen.getByTitle("Timeout (10m) - Right-click for more"),
      ).toBeInTheDocument();
      expect(screen.getByTitle(/Ban \(this chat\)/)).toBeInTheDocument();
    });

    it("calls onContextMenu on right-click with x, y, entry", () => {
      const onContextMenu = vi.fn();
      const { container } = render(
        <YouTubeMessageItem {...baseProps} onContextMenu={onContextMenu} />,
      );
      const messageEl = container.querySelector(".message")!;
      fireEvent.contextMenu(messageEl);
      expect(onContextMenu).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number),
        baseProps.entry,
      );
    });

    it("right-click on timeout button invokes onTimeoutMenu with channelId", () => {
      const onTimeoutMenu = vi.fn();
      render(
        withModeration(
          <YouTubeMessageItem {...baseProps} onTimeoutMenu={onTimeoutMenu} />,
          {
            isYouTubeModerator: true,
            youtubeModModeActive: true,
            onDeleteYouTubeMessage: vi.fn(),
            onTimeoutYouTubeUser: vi.fn(),
            onBanYouTubeUser: vi.fn(),
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
        "UCyt123",
        "YTUser",
      );
    });

    it("does not show mod actions for moderator-authored messages", () => {
      const modEntry = makeUnifiedYT(
        makeYTMsg({ authorIsModerator: true, author: "Mod" }),
      );
      render(
        withModeration(<YouTubeMessageItem {...baseProps} entry={modEntry} />, {
          isYouTubeModerator: true,
          youtubeModModeActive: true,
          onDeleteYouTubeMessage: vi.fn(),
          onTimeoutYouTubeUser: vi.fn(),
          onBanYouTubeUser: vi.fn(),
        }),
      );
      expect(screen.getByTitle("Delete message")).toBeInTheDocument();
      expect(
        screen.queryByTitle("Timeout (10m) - Right-click for more"),
      ).not.toBeInTheDocument();
    });
  });

  describe("MessageMenu - YouTube Mod Actions", () => {
    const ytEntry = makeUnifiedYT(
      makeYTMsg({ id: "menu-yt-1", authorChannelId: "UC-abc" }),
    );

    it("shows YouTube mod actions when isYouTubeModerator and youtubeModModeActive", () => {
      render(
        withModeration(
          <MessageMenu
            x={100}
            y={200}
            entry={ytEntry}
            onCopy={vi.fn()}
            onClose={vi.fn()}
          />,
          {
            isYouTubeModerator: true,
            youtubeModModeActive: true,
            onDeleteYouTubeMessage: vi.fn(),
            onTimeoutYouTubeUser: vi.fn(),
            onBanYouTubeUser: vi.fn(),
          },
        ),
      );
      expect(screen.getByText("Delete")).toBeInTheDocument();
      expect(screen.getByText("Timeout…")).toBeInTheDocument();
      expect(screen.getByText("Ban (this chat)")).toBeInTheDocument();
    });

    it("does not show YouTube mod actions when youtubeModModeActive is false", () => {
      render(
        withModeration(
          <MessageMenu
            x={100}
            y={200}
            entry={ytEntry}
            onCopy={vi.fn()}
            onClose={vi.fn()}
          />,
          {
            isYouTubeModerator: true,
            youtubeModModeActive: false,
          },
        ),
      );
      expect(screen.queryByText("Delete")).not.toBeInTheDocument();
      expect(screen.queryByText("Ban (this chat)")).not.toBeInTheDocument();
    });

    it("hides YouTube mod actions for moderator-authored messages", () => {
      const modEntry = makeUnifiedYT(
        makeYTMsg({ authorIsModerator: true, author: "Mod" }),
      );
      render(
        withModeration(
          <MessageMenu
            x={100}
            y={200}
            entry={modEntry}
            onCopy={vi.fn()}
            onClose={vi.fn()}
          />,
          {
            isYouTubeModerator: true,
            youtubeModModeActive: true,
          },
        ),
      );
      expect(screen.queryByText("Delete")).not.toBeInTheDocument();
      expect(screen.queryByText("Ban (this chat)")).not.toBeInTheDocument();
    });

    it("hides YouTube mod actions for the signed-in user's own messages", () => {
      const ownEntry = makeUnifiedYT(makeYTMsg({ authorChannelId: "UC-mine" }));
      render(
        withModeration(
          <MessageMenu
            x={100}
            y={200}
            entry={ownEntry}
            onCopy={vi.fn()}
            onClose={vi.fn()}
          />,
          {
            isYouTubeModerator: true,
            youtubeModModeActive: true,
            youtubeOwnChannelId: "UC-mine",
          },
        ),
      );
      expect(screen.queryByText("Delete")).not.toBeInTheDocument();
      expect(screen.queryByText("Ban (this chat)")).not.toBeInTheDocument();
    });

    it("calls onDeleteYouTubeMessage from menu", () => {
      const onDelete = vi.fn();
      render(
        withModeration(
          <MessageMenu
            x={100}
            y={200}
            entry={ytEntry}
            onCopy={vi.fn()}
            onClose={vi.fn()}
          />,
          {
            isYouTubeModerator: true,
            youtubeModModeActive: true,
            onDeleteYouTubeMessage: onDelete,
            onTimeoutYouTubeUser: vi.fn(),
            onBanYouTubeUser: vi.fn(),
          },
        ),
      );
      fireEvent.click(screen.getByText("Delete"));
      expect(onDelete).toHaveBeenCalledWith("menu-yt-1");
    });

    it("falls back to onTimeoutYouTubeUser (600s) when no onOpenYouTubeTimeoutMenu is provided", () => {
      const onTimeout = vi.fn();
      render(
        withModeration(
          <MessageMenu
            x={100}
            y={200}
            entry={ytEntry}
            onCopy={vi.fn()}
            onClose={vi.fn()}
          />,
          {
            isYouTubeModerator: true,
            youtubeModModeActive: true,
            onDeleteYouTubeMessage: vi.fn(),
            onTimeoutYouTubeUser: onTimeout,
            onBanYouTubeUser: vi.fn(),
          },
        ),
      );
      fireEvent.click(screen.getByText("Timeout…"));
      expect(onTimeout).toHaveBeenCalledWith("UC-abc", 600, "YTUser");
    });

    it("opens the YouTube timeout picker via onOpenYouTubeTimeoutMenu when provided", () => {
      const onOpen = vi.fn();
      const onTimeout = vi.fn();
      render(
        withModeration(
          <MessageMenu
            x={120}
            y={220}
            entry={ytEntry}
            onCopy={vi.fn()}
            onClose={vi.fn()}
            onOpenYouTubeTimeoutMenu={onOpen}
          />,
          {
            isYouTubeModerator: true,
            youtubeModModeActive: true,
            onDeleteYouTubeMessage: vi.fn(),
            onTimeoutYouTubeUser: onTimeout,
            onBanYouTubeUser: vi.fn(),
          },
        ),
      );
      fireEvent.click(screen.getByText("Timeout…"));
      expect(onOpen).toHaveBeenCalledWith(120, 220, "UC-abc", "YTUser");
      // The 600s fallback must NOT fire when a picker is provided.
      expect(onTimeout).not.toHaveBeenCalled();
    });

    it("calls onBanYouTubeUser from menu", () => {
      const onBan = vi.fn();
      render(
        withModeration(
          <MessageMenu
            x={100}
            y={200}
            entry={ytEntry}
            onCopy={vi.fn()}
            onClose={vi.fn()}
          />,
          {
            isYouTubeModerator: true,
            youtubeModModeActive: true,
            onDeleteYouTubeMessage: vi.fn(),
            onTimeoutYouTubeUser: vi.fn(),
            onBanYouTubeUser: onBan,
          },
        ),
      );
      fireEvent.click(screen.getByText("Ban (this chat)"));
      expect(onBan).toHaveBeenCalledWith("UC-abc", "YTUser");
    });
  });

  describe("modActionsFirst placement", () => {
    function renderYT(modActionsFirst: boolean) {
      return render(
        withModeration(<YouTubeMessageContent msg={makeYTMsg()} />, {
          isYouTubeModerator: true,
          youtubeModModeActive: true,
          modActionsFirst,
          onDeleteYouTubeMessage: vi.fn(),
          onTimeoutYouTubeUser: vi.fn(),
          onBanYouTubeUser: vi.fn(),
        }),
      );
    }

    it("renders the mod action strip at the end of the line by default", () => {
      const { container } = renderYT(false);
      expect(container.querySelectorAll(".message-actions")).toHaveLength(1);
      const line = container.querySelector(".message-single-line")!;
      const actions = line.querySelector(".message-actions")!;
      const timestamp = line.querySelector(".timestamp")!;
      expect(Array.from(line.children).indexOf(actions)).toBeGreaterThan(
        Array.from(line.children).indexOf(timestamp),
      );
    });

    it("moves the mod action strip to the start of the line when modActionsFirst is on", () => {
      const { container } = renderYT(true);
      expect(container.querySelectorAll(".message-actions")).toHaveLength(1);
      const line = container.querySelector(".message-single-line")!;
      const actions = line.querySelector(".message-actions")!;
      const timestamp = line.querySelector(".timestamp")!;
      expect(Array.from(line.children).indexOf(actions)).toBeLessThan(
        Array.from(line.children).indexOf(timestamp),
      );
    });

    it("never renders the mod action strip twice (start AND end)", () => {
      const { container } = renderYT(true);
      const line = container.querySelector(".message-single-line")!;
      expect(line.querySelectorAll(".message-actions")).toHaveLength(1);
    });
  });
});
