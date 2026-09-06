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

function renderMsg(msg: TwitchMessage) {
  return render(
    withModeration(
      <TwitchMessageContent
        msg={msg}
        index={0}
        previousMsg={null}
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

const GIPHY_URL =
  "https://media4.giphy.com/media/joSNxeswxuc74Juo8X/giphy.gif?cid=095d7a5d&rid=giphy.gif&ct=g";

describe("TwitchMessageContent GIF rendering", () => {
  it("renders a Giphy image in place of the GIF caption", () => {
    const caption = "[Y A Y Yes GIF by Djemilah Birnie]";
    const msg: TwitchMessage = {
      id: "gif-msg",
      platform: "twitch",
      author: "TwitchDev",
      content: caption,
      timestamp: new Date(),
      userId: "1",
      emotes: {},
      gifs: [
        {
          id: "joSNxeswxuc74Juo8X",
          url: GIPHY_URL,
          start: 0,
          end: caption.length,
        },
      ],
    };
    renderMsg(msg);
    const img = document.querySelector("img.chat-gif") as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img!.src).toBe(GIPHY_URL);
    // The caption text is replaced by the image.
    expect(screen.queryByText(caption)).toBeNull();
  });

  it("keeps surrounding text when a GIF only covers part of the message", () => {
    const msg: TwitchMessage = {
      id: "gif-msg-2",
      platform: "twitch",
      author: "TwitchDev",
      content: "prefix [gif] suffix",
      timestamp: new Date(),
      userId: "1",
      emotes: {},
      gifs: [
        {
          id: "gifA",
          url: "https://media1.giphy.com/media/gifA/giphy.gif",
          start: 7,
          end: 12,
        },
      ],
    };
    renderMsg(msg);
    expect(document.querySelector("img.chat-gif")).not.toBeNull();
    expect(screen.getByText("prefix")).toBeTruthy();
    expect(screen.getByText("suffix")).toBeTruthy();
  });

  it("renders plain messages without GIF markup", () => {
    renderMsg({
      id: "txt",
      platform: "twitch",
      author: "A",
      content: "hello",
      timestamp: new Date(),
      userId: "1",
      emotes: {},
    });
    expect(document.querySelector("img.chat-gif")).toBeNull();
    expect(screen.getByText("hello")).toBeTruthy();
  });
});
