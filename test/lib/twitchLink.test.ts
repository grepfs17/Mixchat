import { describe, it, expect } from "vitest";
import {
  parseTwitchUrl,
  isTwitchUrl,
  splitByTwitchLinks,
  rebaseEmotesForSegment,
  TWITCH_URL_REGEX,
} from "../../src/lib/twitchLink";

describe("parseTwitchUrl", () => {
  describe("channel URLs", () => {
    it("parses https://www.twitch.tv/<channel>", () => {
      const result = parseTwitchUrl("https://www.twitch.tv/lunateac");
      expect(result).toEqual({
        kind: "channel",
        channel: "lunateac",
        url: "https://www.twitch.tv/lunateac",
        href: "https://www.twitch.tv/lunateac",
      });
    });

    it("parses a bare twitch.tv/<channel> URL", () => {
      const result = parseTwitchUrl("twitch.tv/lunateac");
      expect(result?.kind).toBe("channel");
      expect(result?.channel).toBe("lunateac");
    });

    it("parses m.twitch.tv/<channel>", () => {
      const result = parseTwitchUrl("https://m.twitch.tv/lunateac");
      expect(result?.kind).toBe("channel");
      expect(result?.channel).toBe("lunateac");
    });

    it("rejects reserved paths", () => {
      expect(parseTwitchUrl("https://twitch.tv/settings")).toBeNull();
      expect(parseTwitchUrl("https://twitch.tv/directory")).toBeNull();
      expect(parseTwitchUrl("https://twitch.tv/p")).toBeNull();
      expect(parseTwitchUrl("https://twitch.tv/downloads")).toBeNull();
    });

    it("rejects invalid channel names", () => {
      // channels with hyphens are valid in modern Twitch, but a dots or
      // single-character-only paths must still parse cleanly:
      const valid = parseTwitchUrl("https://twitch.tv/lunateac__");
      expect(valid?.kind).toBe("channel");
      expect(valid?.channel).toBe("lunateac__");
    });

    it("trims trailing punctuation", () => {
      const result = parseTwitchUrl("https://www.twitch.tv/lunateac!");
      expect(result?.kind).toBe("channel");
      expect(result?.channel).toBe("lunateac");
      expect(result?.url).toBe("https://www.twitch.tv/lunateac!");
      expect(result?.href).toBe("https://www.twitch.tv/lunateac");
    });
  });

  describe("VOD URLs", () => {
    it("parses twitch.tv/videos/<id>", () => {
      const result = parseTwitchUrl("https://www.twitch.tv/videos/1234567890");
      expect(result).toEqual({
        kind: "video",
        videoId: "1234567890",
        url: "https://www.twitch.tv/videos/1234567890",
        href: "https://www.twitch.tv/videos/1234567890",
      });
    });

    it("rejects non-numeric VOD IDs", () => {
      expect(parseTwitchUrl("https://twitch.tv/videos/abc")).toBeNull();
    });
  });

  describe("clip URLs", () => {
    it("parses twitch.tv/<channel>/clip/<slug>", () => {
      const result = parseTwitchUrl(
        "https://www.twitch.tv/lunateac/clip/GracefulExuberantTriangleRlyTho-ILzchJs4ziz0eeqE",
      );
      expect(result?.kind).toBe("clip");
      expect(result?.channel).toBe("lunateac");
      expect(result?.clipSlug).toBe(
        "GracefulExuberantTriangleRlyTho-ILzchJs4ziz0eeqE",
      );
    });

    it("parses clips.twitch.tv/<slug>", () => {
      const result = parseTwitchUrl("https://clips.twitch.tv/SlugOnlyABC123");
      expect(result?.kind).toBe("clip");
      expect(result?.channel).toBeUndefined();
      expect(result?.clipSlug).toBe("SlugOnlyABC123");
      expect(result?.href).toBe("https://clips.twitch.tv/SlugOnlyABC123");
    });
  });

  describe("non-Twitch / malformed URLs", () => {
    it("returns null for non-Twitch hosts", () => {
      expect(parseTwitchUrl("https://youtube.com/watch?v=abc")).toBeNull();
      expect(parseTwitchUrl("https://example.com")).toBeNull();
    });

    it("returns null for empty input", () => {
      expect(parseTwitchUrl("")).toBeNull();
      expect(parseTwitchUrl("https://twitch.tv/")).toBeNull();
    });

    it("returns null for invalid URLs", () => {
      // No host
      expect(parseTwitchUrl("not a url")).toBeNull();
    });
  });
});

describe("isTwitchUrl", () => {
  it("returns true for valid twitch URLs", () => {
    expect(isTwitchUrl("https://www.twitch.tv/lunateac")).toBe(true);
    expect(isTwitchUrl("https://twitch.tv/lunateac/clip/foo-bar")).toBe(true);
  });

  it("returns false for non-Twitch URLs", () => {
    expect(isTwitchUrl("https://youtube.com/watch?v=abc")).toBe(false);
    expect(isTwitchUrl("https://twitch.tv/settings")).toBe(false);
  });
});

describe("TWITCH_URL_REGEX", () => {
  it("is case-insensitive", () => {
    // /g-enabled regexes have stateful .test(). Use .match() with a fresh
    // regex compiled from the source.
    const re = new RegExp(TWITCH_URL_REGEX.source, TWITCH_URL_REGEX.flags);
    expect("HTTPS://WWW.TWITCH.TV/lunateac".match(re)).not.toBeNull();
    const re2 = new RegExp(TWITCH_URL_REGEX.source, TWITCH_URL_REGEX.flags);
    expect("twitch.tv/lunateac lala".match(re2)?.[0]).toBe("twitch.tv/lunateac");
  });

  it("does not match other hosts", () => {
    const re = new RegExp(TWITCH_URL_REGEX.source, TWITCH_URL_REGEX.flags);
    expect("https://youtube.com/foo".match(re)).toBeNull();
  });
});

describe("splitByTwitchLinks", () => {
  it("returns a single text segment when no URLs are present", () => {
    const input = "Just a normal chat message Kappa";
    const result = splitByTwitchLinks(input);
    expect(result).toEqual([
      {
        type: "text",
        text: input,
        start: 0,
        end: input.length,
      },
    ]);
  });

  it("splits on a single channel URL", () => {
    const result = splitByTwitchLinks(
      "Check out https://www.twitch.tv/lunateac for streams",
    );
    expect(result).toHaveLength(3);
    const first = result[0];
    const link = result[1];
    const third = result[2];
    expect(first.type).toBe("text");
    if (first.type === "text") expect(first.text).toBe("Check out ");
    expect(link.type).toBe("twitch-link");
    if (link.type === "twitch-link") {
      expect(link.parts.kind).toBe("channel");
      expect(link.parts.channel).toBe("lunateac");
    }
    expect(third.type).toBe("text");
    if (third.type === "text") expect(third.text).toBe(" for streams");
  });

  it("splits on a single clip URL with absolute positions", () => {
    const input =
      "Mind the gap https://www.twitch.tv/lunateac/clip/GracefulExuberantTriangleRlyTho-ILzchJs4ziz0eeqE";
    const result = splitByTwitchLinks(input);
    expect(result).toHaveLength(2);
    const head = result[0];
    const link = result[1];
    expect(head.type).toBe("text");
    if (head.type === "text") {
      expect(head.start).toBe(0);
      expect(head.end).toBe("Mind the gap ".length);
      expect(head.text).toBe("Mind the gap ");
    }
    expect(link.type).toBe("twitch-link");
    if (link.type === "twitch-link") {
      expect(link.parts.kind).toBe("clip");
      expect(link.parts.channel).toBe("lunateac");
      expect(link.start).toBe("Mind the gap ".length);
      expect(link.end).toBe(input.length);
    }
  });

  it("splits on multiple URLs in one message", () => {
    const result = splitByTwitchLinks(
      "Visit twitch.tv/alice or twitch.tv/bob today",
    );
    expect(result.filter((s) => s.type === "twitch-link")).toHaveLength(2);
    expect(result.filter((s) => s.type === "text")).toHaveLength(3);
  });

  it("does not split on unmatched reserved paths", () => {
    const input = "I just go to twitch.tv/settings every day";
    const result = splitByTwitchLinks(input);
    expect(result.filter((s) => s.type === "twitch-link")).toHaveLength(0);
    expect(result).toHaveLength(1);
    const first = result[0];
    expect(first.type).toBe("text");
    if (first.type === "text") expect(first.text).toBe(input);
  });

  it("preserves non-Twitch URLs in the text segments", () => {
    const result = splitByTwitchLinks(
      "Read https://example.com and watch twitch.tv/lunateac",
    );
    expect(result.filter((s) => s.type === "twitch-link")).toHaveLength(1);
    const first = result[0];
    expect(first.type).toBe("text");
    if (first.type === "text") {
      expect(first.text).toContain("https://example.com");
    }
  });

  it("handles empty input gracefully", () => {
    expect(splitByTwitchLinks("")).toHaveLength(1);
    const first = splitByTwitchLinks("")[0];
    expect(first.type).toBe("text");
    if (first.type === "text") expect(first.text).toBe("");
  });
});

describe("rebaseEmotesForSegment", () => {
  it("keeps emotes fully within [segStart, segEnd) and shifts positions", () => {
    // emote at original positions 4-9 (e.g. "Kappa" relative to seg 0)
    const emotes = { kappa: ["4-9"] };
    const out = rebaseEmotesForSegment(emotes, 4, 20);
    expect(out).toEqual({ kappa: ["0-5"] });
  });

  it("drops emotes that start before the segment but end inside it", () => {
    // emote straddles segStart boundary
    const emotes = { kappa: ["2-9"] };
    const out = rebaseEmotesForSegment(emotes, 5, 20);
    expect(out).toBeUndefined();
  });

  it("drops emotes that start in the segment but run past segEnd", () => {
    // emote straddles segEnd boundary
    const emotes = { kappa: ["5-15"] };
    const out = rebaseEmotesForSegment(emotes, 5, 10);
    expect(out).toBeUndefined();
  });

  it("keeps emotes that exactly end at segEnd-1", () => {
    // positions are inclusive, segment ends just past the last char
    const emotes = { kappa: ["5-9"] };
    const out = rebaseEmotesForSegment(emotes, 5, 10);
    expect(out).toEqual({ kappa: ["0-4"] });
  });

  it("returns undefined when the input is undefined or no emotes remain", () => {
    expect(rebaseEmotesForSegment(undefined, 0, 10)).toBeUndefined();
    expect(rebaseEmotesForSegment({}, 0, 10)).toBeUndefined();
  });

  it("handles multiple positions for the same emote", () => {
    const emotes = { kappa: ["2-6", "10-14"] };
    const out = rebaseEmotesForSegment(emotes, 0, 20);
    expect(out).toEqual({ kappa: ["2-6", "10-14"] });
  });
});
