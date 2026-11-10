import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import {
  ModerationContext,
  type ModerationContextValue,
} from "../../src/contexts/ModerationContext";
import { TwitchMessageContent } from "../../src/components/chat/shared/TwitchMessageContent";
import YTMessageParts, {
  type YTMessagePart,
} from "../../src/components/YTMessageParts";
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

function renderTwitchMsg(content: string) {
  const msg: TwitchMessage = {
    id: "msg-with-clip",
    platform: "twitch",
    author: "TwitchDev",
    content,
    timestamp: new Date(),
    userId: "1",
    emotes: {},
  };
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

const CLIP_URL = "https://clips.twitch.tv/PlayfulPunchyKangarooPogChamp";

describe("Twitch clip preview position", () => {
  beforeEach(() => {
    // Never resolves, so the component keeps rendering its loading
    // skeleton (which carries the .twitch-link-preview class).
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the preview after the trailing text when the clip URL is mid-message", () => {
    const { container } = renderTwitchMsg(`check this ${CLIP_URL} out`);
    const textEl = container.querySelector(".message-text");
    expect(textEl).not.toBeNull();
    const preview = textEl!.querySelector(".twitch-link-preview");
    expect(preview).not.toBeNull();
    // The preview is the last child of the message text, never mid-text.
    expect(textEl!.lastElementChild).toBe(preview);
    const trailing = Array.from(textEl!.querySelectorAll("span")).find(
      (s) => s.textContent?.trim() === "out",
    );
    expect(trailing).toBeTruthy();
    expect(
      trailing!.compareDocumentPosition(preview!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders the preview at the bottom when the clip URL starts the message", () => {
    const { container } = renderTwitchMsg(`${CLIP_URL} look at that`);
    const textEl = container.querySelector(".message-text");
    expect(textEl).not.toBeNull();
    const preview = textEl!.querySelector(".twitch-link-preview");
    expect(preview).not.toBeNull();
    expect(textEl!.lastElementChild).toBe(preview);
  });

  it("keeps plain messages without Twitch links on the single-shot pipeline", () => {
    renderTwitchMsg("just a normal message");
    expect(document.querySelector(".twitch-link-preview")).toBeNull();
    expect(screen.getByText("just a normal message")).toBeTruthy();
  });
});

describe("YTMessageParts twitch-link preview position", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the preview after the other parts when the link sits mid-message", () => {
    const parts: YTMessagePart[] = [
      { type: "text", text: "check this " },
      {
        type: "twitch-link",
        twitchUrl: CLIP_URL,
        text: CLIP_URL,
      },
      { type: "text", text: " out" },
    ];
    const { container } = render(<YTMessageParts parts={parts} variant="standalone" />);
    const preview = container.querySelector(".twitch-link-preview");
    expect(preview).not.toBeNull();
    const root = container.firstElementChild;
    expect(root).not.toBeNull();
    expect(root!.lastChild).toBe(preview);
  });

  it("keeps text and emoji parts in order before the preview", () => {
    const parts: YTMessagePart[] = [
      { type: "text", text: "wow " },
      { type: "emoji", url: "https://example.com/e.png", alt: "😀", emojiText: "😀" },
      { type: "text", text: " nice " },
      { type: "twitch-link", twitchUrl: CLIP_URL, text: CLIP_URL },
      { type: "text", text: " end" },
    ];
    const { container } = render(<YTMessageParts parts={parts} variant="standalone" />);
    const preview = container.querySelector(".twitch-link-preview");
    expect(preview).not.toBeNull();
    expect(container.firstElementChild!.lastChild).toBe(preview);
    expect(container.textContent).toContain("nice");
    expect(container.textContent).toContain("end");
  });
});
