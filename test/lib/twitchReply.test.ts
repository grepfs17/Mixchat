import { describe, it, expect } from "vitest";
import {
  stripReplyMention,
  stripReplyMentionFromContent,
} from "../../src/lib/twitchReply";

describe("stripReplyMention", () => {
  it("strips a leading mention that matches the reply author", () => {
    expect(stripReplyMention("@friend hello there", "friend")).toBe(
      "hello there",
    );
  });

  it("matches case-insensitively", () => {
    expect(stripReplyMention("@Friend hello", "friend")).toBe("hello");
  });

  it("matches across login/display-name separators", () => {
    expect(stripReplyMention("@cool_user hi", "CoolUser")).toBe("hi");
    expect(stripReplyMention("@CoolUser hi", "cool_user")).toBe("hi");
  });

  it("strips a mention with trailing punctuation", () => {
    expect(stripReplyMention("@friend, hello", "friend")).toBe("hello");
  });

  it("strips a mention that is the whole content", () => {
    expect(stripReplyMention("@friend", "friend")).toBe("");
  });

  it("leaves an unrelated mention in place", () => {
    expect(stripReplyMention("@other hello", "friend")).toBe("@other hello");
  });

  it("leaves content without a leading mention unchanged", () => {
    expect(stripReplyMention("hello @friend", "friend")).toBe(
      "hello @friend",
    );
  });

  it("returns the content when author or content is missing", () => {
    expect(stripReplyMention("@friend hello", "")).toBe("@friend hello");
    expect(stripReplyMention("", "friend")).toBe("");
  });
});

describe("stripReplyMentionFromContent", () => {
  it("shifts emote offsets after stripping the prefix", () => {
    const result = stripReplyMentionFromContent("@friend Kappa", "friend", {
      "25": ["8-12"],
    });
    expect(result.content).toBe("Kappa");
    expect(result.emotes).toEqual({ "25": ["0-4"] });
  });

  it("drops emotes that fall inside the stripped prefix", () => {
    const result = stripReplyMentionFromContent("@friend hi", "friend", {
      "1": ["0-6"],
    });
    expect(result.emotes).toEqual({});
  });

  it("shifts GIF ranges after stripping the prefix", () => {
    const result = stripReplyMentionFromContent(
      "@friend [gif]",
      "friend",
      {},
      [{ id: "g", url: "u", start: 8, end: 12 }],
    );
    expect(result.content).toBe("[gif]");
    expect(result.gifs).toEqual([{ id: "g", url: "u", start: 0, end: 4 }]);
  });

  it("returns the original data when there is no reply prefix", () => {
    const emotes = { "25": ["0-4"] };
    const result = stripReplyMentionFromContent("Kappa", "friend", emotes);
    expect(result.content).toBe("Kappa");
    expect(result.emotes).toBe(emotes);
    expect(result.gifs).toBeUndefined();
  });
});
