import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import PinnedChatBanner, {
  type PinnedChatHighlightState,
} from "../../src/components/chat/shared/PinnedChatBanner";
import {
  setEmotes7tv,
  bumpEmoteMapVersion,
  notifyEmotesReloaded,
} from "../../src/lib/emotes";

vi.mock("react-icons/fa", () => ({
  FaThumbtack: () => <span data-testid="fa-thumbtack" />,
  FaTimes: () => <span data-testid="fa-times">X</span>,
}));

const baseHighlight: PinnedChatHighlightState = {
  channel: "lunateac",
  messageId: "msg-1",
  senderLogin: "xeeija",
  senderDisplayName: "xeeija",
  message: "hello world",
  pinnedAt: new Date("2026-08-01T12:00:00Z"),
};

describe("PinnedChatBanner", () => {
  beforeEach(() => {
    setEmotes7tv({});
    bumpEmoteMapVersion();
    notifyEmotesReloaded();
  });
  it("renders the PINNED label and the sender display name", () => {
    render(
      <PinnedChatBanner highlight={baseHighlight} onDismiss={vi.fn()} />,
    );

    expect(screen.getByText("PINNED")).toBeInTheDocument();
    expect(screen.getByText("xeeija")).toBeInTheDocument();
  });

  it("applies the sender chat color via inline style when provided", () => {
    const colored = { ...baseHighlight, senderColor: "#8AD68F" };
    render(<PinnedChatBanner highlight={colored} onDismiss={vi.fn()} />);

    const senderEl = screen.getByText("xeeija");
    expect(senderEl).toHaveStyle({ color: "#8AD68F" });
  });

  it("renders the plain-text message body", () => {
    render(
      <PinnedChatBanner highlight={baseHighlight} onDismiss={vi.fn()} />,
    );

    expect(screen.getByText("hello world")).toBeInTheDocument();
  });

  it("renders URLs as anchor tags with safe attributes", () => {
    const linked = {
      ...baseHighlight,
      message: "check https://example.com/path",
    };
    render(<PinnedChatBanner highlight={linked} onDismiss={vi.fn()} />);

    const anchor = document.querySelector(
      ".pinned-banner-message a[href='https://example.com/path']",
    );
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute("target")).toBe("_blank");
    expect(anchor?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("renders @mentions as <strong>", () => {
    const mentioned = { ...baseHighlight, message: "hi @friend" };
    render(<PinnedChatBanner highlight={mentioned} onDismiss={vi.fn()} />);

    const strong = document.querySelector(".pinned-banner-message strong");
    expect(strong?.textContent).toBe("@friend");
  });

  it("renders the thumb-tack icon", () => {
    render(
      <PinnedChatBanner highlight={baseHighlight} onDismiss={vi.fn()} />,
    );

    expect(screen.getByTestId("fa-thumbtack")).toBeInTheDocument();
  });

  it("has an accessible role and aria-live on the shell", () => {
    render(
      <PinnedChatBanner highlight={baseHighlight} onDismiss={vi.fn()} />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
  });

  it("requires double-click to dismiss (confirm-close pattern)", () => {
    const onDismiss = vi.fn();
    render(
      <PinnedChatBanner highlight={baseHighlight} onDismiss={onDismiss} />,
    );

    const closeBtn = screen.getByLabelText("Dismiss pinned message");

    fireEvent.click(closeBtn);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByText("Press again to close")).toBeInTheDocument();

    fireEvent.click(closeBtn);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not render a pinned-by line or #channel footer", () => {
    render(
      <PinnedChatBanner highlight={baseHighlight} onDismiss={vi.fn()} />,
    );

    expect(
      document.querySelector(".pinned-banner-channel"),
    ).toBeNull();
    expect(screen.queryByText(/Pinned by/)).toBeNull();
    expect(screen.queryByText(/in #/)).toBeNull();
  });

  it("re-parses the message and renders emotes once the emote maps load", () => {
    // The banner mounts before the 7TV/BTTV/FFZ/Twitch maps have resolved —
    // exactly the page-load race where the pinned poll beats the emote
    // providers. The message must first render as plain text.
    const withEmote = { ...baseHighlight, message: "hello Cool" };
    render(<PinnedChatBanner highlight={withEmote} onDismiss={vi.fn()} />);

    expect(
      document.querySelector(".pinned-banner-message img"),
    ).toBeNull();
    expect(screen.getByText(/hello/)).toBeInTheDocument();

    // Emote source resolves + maps are bumped and the reload event fires —
    // the banner must re-parse and now show the emote image.
    act(() => {
      setEmotes7tv({ Cool: "https://cdn.7tv.app/emote/cool/1x.webp" });
      bumpEmoteMapVersion();
      notifyEmotesReloaded();
    });

    const img = document.querySelector(
      ".pinned-banner-message img[data-emote-source='7TV']",
    );
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe(
      "https://cdn.7tv.app/emote/cool/1x.webp",
    );
  });

  it("escapes arbitrary HTML in the message payload (no XSS)", () => {
    const hostile = {
      ...baseHighlight,
      message: "<script>alert(1)</script>safe",
    };
    render(<PinnedChatBanner highlight={hostile} onDismiss={vi.fn()} />);

    const messageEl = document.querySelector(".pinned-banner-message");
    // The sanitiser must yield NO real <script> element, and the innerHTML
    // must keep the angle-brackets in escaped form (&lt;script&gt;) rather
    // than re-emit them as a live tag. textContent reflects decoded visible
    // text, so we intentionally do NOT match against it here.
    expect(messageEl?.querySelector("script")).toBeNull();
    expect(messageEl?.innerHTML).not.toMatch(/<script/);
    expect(messageEl?.innerHTML).not.toMatch(/<img/i);
    expect(messageEl?.innerHTML).toMatch(/safe/);
  });
});
