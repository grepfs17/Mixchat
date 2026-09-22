import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import React from "react";
import {
  ModerationContext,
  type ModerationContextValue,
} from "../../src/contexts/ModerationContext";
import { TwitchMessageContent } from "../../src/components/chat/shared/TwitchMessageContent";
import type { TwitchMessage } from "../../src/lib/types";

vi.mock("react-dom", async () => {
  const actual = await vi.importActual("react-dom");
  return { ...actual, createPortal: (children: React.ReactNode) => children };
});

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

function withModeration(ui: React.ReactNode) {
  const value: Partial<ModerationContextValue> = {
    isModerator: false,
    modModeActive: false,
    compactActions: false,
  };
  return (
    <ModerationContext.Provider value={value as ModerationContextValue}>
      {ui}
    </ModerationContext.Provider>
  );
}

function renderMsg(
  msg: TwitchMessage,
  mentionColors?: Map<string, string>,
) {
  return render(
    withModeration(
      <TwitchMessageContent
        msg={msg}
        index={0}
        previousMsg={null}
        mentionColors={mentionColors}
        onCopy={() => {}}
        onTimeoutMenu={() => {}}
        onContextMenu={() => {}}
        onScrollToMessage={() => {}}
        onTouchStart={() => {}}
        onTouchEnd={() => {}}
        onTouchMove={() => {}}
      />,
    ),
  );
}

const baseMessage: TwitchMessage = {
  id: "mention-msg",
  platform: "twitch",
  author: "sender",
  content: "hi @friend",
  timestamp: new Date(),
  userId: "1",
  emotes: {},
};

describe("TwitchMessageContent mention colours", () => {
  it("colours a mention with the mentioned user's chat colour", () => {
    renderMsg(baseMessage, new Map([["friend", "#ff0000"]]));
    const strong = document.querySelector(
      ".message-text strong",
    ) as HTMLElement | null;
    expect(strong).not.toBeNull();
    expect(strong!.textContent).toBe("@friend");
    expect(strong!.style.color).toBe("rgb(255, 0, 0)");
  });

  it("leaves the mention uncoloured when the user is unknown", () => {
    renderMsg(baseMessage, new Map([["someone-else", "#00ff00"]]));
    const strong = document.querySelector(
      ".message-text strong",
    ) as HTMLElement | null;
    expect(strong).not.toBeNull();
    expect(strong!.style.color).toBe("");
  });
});

const replyMessage: TwitchMessage = {
  ...baseMessage,
  id: "reply-msg",
  author: "sender",
  content: "I agree",
  replyTo: { id: "orig-msg", author: "friend", content: "hello there" },
};

describe("TwitchMessageContent reply preview", () => {
  it("colours the reply header with the target user's chat colour", () => {
    renderMsg(replyMessage, new Map([["friend", "#ff0000"]]));
    const header = screen.getByText("@friend:") as HTMLElement;
    expect(header.style.color).toBe("rgb(255, 0, 0)");
  });

  it("strips a repeated @name from the quoted reply content", () => {
    renderMsg({
      ...replyMessage,
      replyTo: {
        id: "orig-msg",
        author: "friend",
        content: "@friend hello there",
      },
    });
    const target = document.querySelector(".reply-target-content");
    expect(target?.textContent).toBe("hello there");
  });

  it("keeps an unrelated mention in the quoted reply content", () => {
    renderMsg({
      ...replyMessage,
      replyTo: {
        id: "orig-msg",
        author: "friend",
        content: "@other hello",
      },
    });
    const target = document.querySelector(".reply-target-content");
    expect(target?.textContent).toBe("@other hello");
  });
});
