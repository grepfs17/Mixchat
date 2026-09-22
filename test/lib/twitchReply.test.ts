import { describe, it, expect } from "vitest";
import { stripReplyMention } from "../../src/lib/twitchReply";

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
