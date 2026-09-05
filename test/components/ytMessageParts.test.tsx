import { act, render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import YTMessageParts, {
  type YTMessagePart,
} from "../../src/components/YTMessageParts";
import {
  setEmotes7tv,
  setEmotesBttv,
  setEmotesFfz,
  setEmoteAuthors,
  bumpEmoteMapVersion,
  notifyEmotesReloaded,
} from "../../src/lib/emotes";

describe("YTMessageParts third-party emote rendering", () => {
  beforeEach(() => {
    localStorage.clear();
    setEmotes7tv({});
    setEmotesBttv({});
    setEmotesFfz({});
    setEmoteAuthors({});
    bumpEmoteMapVersion();
    notifyEmotesReloaded();
  });

  afterEach(() => {
    setEmotes7tv({});
    setEmotesBttv({});
    setEmotesFfz({});
    setEmoteAuthors({});
    bumpEmoteMapVersion();
    notifyEmotesReloaded();
  });

  it("renders 7TV emotes from text parts when renderThirdPartyEmotes is true", () => {
    setEmotes7tv({ Clap: "https://cdn.7tv.app/emote/clap/1x.webp" });
    bumpEmoteMapVersion();
    notifyEmotesReloaded();

    const { container } = render(
      <YTMessageParts
        parts={[{ type: "text", text: "Wow Clap" }]}
        variant="unified"
        renderThirdPartyEmotes={true}
      />,
    );

    const imgs = container.querySelectorAll("img.chat-emote");
    expect(imgs.length).toBe(1);
    expect(imgs[0].getAttribute("data-emote-name")).toBe("Clap");
    expect(imgs[0].getAttribute("data-emote-source")).toBe("7TV");
  });

  it("renders plain text when renderThirdPartyEmotes is false", () => {
    setEmotes7tv({ Clap: "https://cdn.7tv.app/emote/clap/1x.webp" });
    bumpEmoteMapVersion();
    notifyEmotesReloaded();

    const { container } = render(
      <YTMessageParts
        parts={[{ type: "text", text: "Wow Clap" }]}
        variant="unified"
        renderThirdPartyEmotes={false}
      />,
    );

    expect(container.querySelectorAll("img.chat-emote").length).toBe(0);
    expect(container.textContent).toBe("Wow Clap");
  });

  it("renders BTTV emotes", () => {
    setEmotesBttv({ Feels: "https://cdn.bttv.gg/emote/feels/1x.webp" });
    bumpEmoteMapVersion();
    notifyEmotesReloaded();

    const { container } = render(
      <YTMessageParts
        parts={[{ type: "text", text: "hello Feels man" }]}
        variant="unified"
        renderThirdPartyEmotes={true}
      />,
    );

    const imgs = container.querySelectorAll("img.chat-emote");
    expect(imgs.length).toBe(1);
    expect(imgs[0].getAttribute("data-emote-source")).toBe("BTTV");
  });

  it("renders FFZ emotes", () => {
    setEmotesFfz({ Hype: "https://cdn.ffz.io/emote/hype/1.webp" });
    bumpEmoteMapVersion();
    notifyEmotesReloaded();

    const { container } = render(
      <YTMessageParts
        parts={[{ type: "text", text: "Hype train" }]}
        variant="unified"
        renderThirdPartyEmotes={true}
      />,
    );

    const imgs = container.querySelectorAll("img.chat-emote");
    expect(imgs.length).toBe(1);
    expect(imgs[0].getAttribute("data-emote-source")).toBe("FFZ");
  });

  it("re-renders to pick up new emotes when the map is updated after mount", () => {
    const parts: YTMessagePart[] = [{ type: "text", text: "Hello Late" }];
    const { container, rerender } = render(
      <YTMessageParts
        parts={parts}
        variant="unified"
        renderThirdPartyEmotes={true}
      />,
    );
    expect(container.querySelectorAll("img.chat-emote").length).toBe(0);

    act(() => {
      setEmotes7tv({ Late: "https://cdn.7tv.app/emote/late/1x.webp" });
      bumpEmoteMapVersion();
      notifyEmotesReloaded();
    });

    rerender(
      <YTMessageParts
        parts={parts}
        variant="unified"
        renderThirdPartyEmotes={true}
      />,
    );
    const imgs = container.querySelectorAll("img.chat-emote");
    expect(imgs.length).toBe(1);
    expect(imgs[0].getAttribute("data-emote-name")).toBe("Late");
  });

  it("handles a typical YT message format with text + emoji parts", () => {
    setEmotes7tv({ Clap: "https://cdn.7tv.app/emote/clap/1x.webp" });
    bumpEmoteMapVersion();
    notifyEmotesReloaded();

    const { container } = render(
      <YTMessageParts
        parts={[
          { type: "text", text: "Wow Clap from " },
          {
            type: "emoji",
            url: "https://yt.emoji/custom.webp",
            alt: ":smile:",
            emojiText: ":smile:",
            isCustomEmoji: true,
          },
          { type: "text", text: " fan" },
        ]}
        variant="unified"
        renderThirdPartyEmotes={true}
      />,
    );

    const imgs = container.querySelectorAll("img.chat-emote");
    // Should have: 7TV Clap (third-party) + YouTube custom :smile: emoji
    expect(imgs.length).toBe(2);
    const sources = Array.from(imgs).map((i) =>
      i.getAttribute("data-emote-source"),
    );
    expect(sources).toContain("7TV");
    expect(sources).toContain("YouTube");
  });

  it("renders nothing extra when emote maps are empty (no false positives)", () => {
    const { container } = render(
      <YTMessageParts
        parts={[{ type: "text", text: "Clap" }]}
        variant="unified"
        renderThirdPartyEmotes={true}
      />,
    );
    expect(container.querySelectorAll("img.chat-emote").length).toBe(0);
    expect(container.textContent).toBe("Clap");
  });
});

describe("YTMessageParts Twemoji rendering (Unicode emojis)", () => {
  it("converts flag emojis in text parts to Twemoji <img> tags", () => {
    const { container } = render(
      <YTMessageParts
        parts={[{ type: "text", text: "Josh🇨🇦🇨🇦" }]}
        variant="standalone"
      />,
    );
    const emojiImgs = container.querySelectorAll('img.emoji');
    expect(emojiImgs.length).toBe(2);
    expect(emojiImgs[0].getAttribute("src")).toContain("1f1e8-1f1e6.svg");
  });

  it("converts common emojis (😀) to Twemoji <img> tags", () => {
    const { container } = render(
      <YTMessageParts
        parts={[{ type: "text", text: "Hello 😀 World" }]}
        variant="standalone"
      />,
    );
    const emojiImgs = container.querySelectorAll('img.emoji');
    expect(emojiImgs.length).toBe(1);
    expect(emojiImgs[0].getAttribute("src")).toContain("1f600.svg");
    expect(container.textContent).toContain("Hello");
    expect(container.textContent).toContain("World");
  });

  it("does not affect YouTube custom emoji <img> elements", () => {
    const { container } = render(
      <YTMessageParts
        parts={[
          { type: "text", text: "Hello " },
          {
            type: "emoji",
            url: "https://yt.emoji/custom.webp",
            alt: ":smile:",
            emojiText: ":smile:",
            isCustomEmoji: true,
          },
          { type: "text", text: " 😀" },
        ]}
        variant="standalone"
      />,
    );
    // YouTube custom emoji should remain unchanged
    const ytEmoji = container.querySelector('.yt-emoji');
    expect(ytEmoji).toBeTruthy();
    expect(ytEmoji!.getAttribute("src")).toBe("https://yt.emoji/custom.webp");
    // The Unicode emoji should be converted
    const twemojiImgs = container.querySelectorAll('img.emoji');
    expect(twemojiImgs.length).toBe(1);
  });

  it("applies Twemoji in unified variant too", () => {
    const { container } = render(
      <YTMessageParts
        parts={[{ type: "text", text: "Go 🇨🇦!" }]}
        variant="unified"
      />,
    );
    const emojiImgs = container.querySelectorAll('img.emoji');
    expect(emojiImgs.length).toBe(1);
    expect(emojiImgs[0].getAttribute("src")).toContain("1f1e8-1f1e6.svg");
  });

  it("leaves plain text parts without emojis untouched", () => {
    const { container } = render(
      <YTMessageParts
        parts={[{ type: "text", text: "Hello World" }]}
        variant="standalone"
      />,
    );
    expect(container.querySelectorAll('img.emoji').length).toBe(0);
    expect(container.textContent).toBe("Hello World");
  });

  it("safely re-renders when an emoji text part changes (regression: NotFoundError insertBefore)", () => {
    const { container, rerender } = render(
      <YTMessageParts
        parts={[{ type: "text", text: "Hi 😀" }]}
        variant="standalone"
      />,
    );
    expect(container.querySelectorAll("img.emoji").length).toBe(1);

    // Old code converted emoji by mutating the mounted DOM in a layout
    // effect (twemoji.parse on a React-rendered node). Re-rendering that
    // node afterwards made ReactDOM throw NotFoundError on insertBefore.
    // Re-renders must never touch React-owned DOM outside of React.
    expect(() =>
      rerender(
        <YTMessageParts
          parts={[{ type: "text", text: "Bye 😀 👍" }]}
          variant="standalone"
        />,
      ),
    ).not.toThrow();

    const emojiImgs = container.querySelectorAll("img.emoji");
    expect(emojiImgs.length).toBe(2);
    expect(emojiImgs[0].getAttribute("src")).toContain("1f600.svg");
    expect(container.textContent).toContain("Bye");
  });

  it("replaces stale Twemoji output when emoji content is removed on re-render", () => {
    const { container, rerender } = render(
      <YTMessageParts
        parts={[{ type: "text", text: "Go 😀 go" }]}
        variant="standalone"
      />,
    );
    expect(container.querySelectorAll("img.emoji").length).toBe(1);

    rerender(
      <YTMessageParts
        parts={[{ type: "text", text: "plain now" }]}
        variant="standalone"
      />,
    );
    expect(container.querySelectorAll("img.emoji").length).toBe(0);
    expect(container.textContent).toBe("plain now");
  });
});

describe("YTMessageParts URL linkification", () => {
  it("renders http URLs in text parts as clickable links", () => {
    const { container } = render(
      <YTMessageParts
        parts={[{ type: "text", text: "check https://example.com now" }]}
        variant="standalone"
      />,
    );
    const links = container.querySelectorAll("a.yt-message-link");
    expect(links.length).toBe(1);
    expect(links[0].getAttribute("href")).toBe("https://example.com");
    expect(links[0].getAttribute("target")).toBe("_blank");
    expect(links[0].getAttribute("rel")).toContain("noopener");
    // Surrounding text (including whitespace) is preserved
    expect(container.textContent).toBe("check https://example.com now");
  });

  it("linkifies in the unified variant too", () => {
    const { container } = render(
      <YTMessageParts
        parts={[{ type: "text", text: "go https://example.com" }]}
        variant="unified"
      />,
    );
    const link = container.querySelector("a.yt-message-link");
    expect(link?.getAttribute("href")).toBe("https://example.com");
    expect(container.textContent).toBe("go https://example.com");
  });

  it("normalizes www. URLs to https://", () => {
    const { container } = render(
      <YTMessageParts parts={[{ type: "text", text: "www.example.com" }]} />,
    );
    const link = container.querySelector("a.yt-message-link");
    expect(link?.getAttribute("href")).toBe("https://www.example.com");
  });

  it("preserves non-URL text verbatim", () => {
    const { container } = render(
      <YTMessageParts
        parts={[{ type: "text", text: "just words no links" }]}
        variant="standalone"
      />,
    );
    expect(container.querySelectorAll("a.yt-message-link").length).toBe(0);
    expect(container.textContent).toBe("just words no links");
  });

  it("links URLs in text tokens when third-party emotes are enabled", () => {
    const { container } = render(
      <YTMessageParts
        parts={[{ type: "text", text: "go https://example.com Clap" }]}
        variant="unified"
        renderThirdPartyEmotes={true}
      />,
    );
    const link = container.querySelector("a.yt-message-link");
    expect(link?.getAttribute("href")).toBe("https://example.com");
  });

  it("does not linkify URLs embedded mid-word", () => {
    const { container } = render(
      <YTMessageParts
        parts={[{ type: "text", text: "prehttps://example.com" }]}
        variant="standalone"
      />,
    );
    expect(container.querySelectorAll("a.yt-message-link").length).toBe(0);
    expect(container.textContent).toBe("prehttps://example.com");
  });
});

// keep vi import live for global mocks
void vi;
