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
});

// keep vi import live for global mocks
void vi;
