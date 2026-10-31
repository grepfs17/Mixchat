import { describe, it, expect } from "vitest";
import {
  chatLostMessage,
  errorBodySnippet,
  extractHttpStatus,
  shouldDegradeToAnonymous,
} from "../../../src/pages/api/youtube-stream-chat";

const GET_LIVE_CHAT_400 =
  "Request to https://mixchat-yt-proxy.example/api/youtube/youtubei/v1/live_chat/get_live_chat?prettyPrint=false&alt=json failed with status code 400";

describe("extractHttpStatus", () => {
  it("reads the status from a youtubei.js request failure", () => {
    expect(extractHttpStatus(GET_LIVE_CHAT_400)).toBe(400);
  });

  it("returns undefined when no status is present", () => {
    expect(extractHttpStatus("Reached retry limit")).toBeUndefined();
  });
});

describe("chatLostMessage", () => {
  it("includes the HTTP status but never the proxy URL", () => {
    const text = chatLostMessage(GET_LIVE_CHAT_400);
    expect(text).toBe("Chat connection lost (YouTube HTTP 400)");
    expect(text).not.toContain("http");
    expect(text).not.toContain("proxy");
  });

  it("falls back to the generic text without a status", () => {
    expect(chatLostMessage("Reached retry limit")).toBe("Chat connection lost");
  });
});

describe("shouldDegradeToAnonymous", () => {
  it("degrades an authenticated chat on a non-transient error", () => {
    expect(shouldDegradeToAnonymous(true, GET_LIVE_CHAT_400)).toBe(true);
  });

  it("leaves guest sessions alone", () => {
    expect(shouldDegradeToAnonymous(false, GET_LIVE_CHAT_400)).toBe(false);
  });

  it("does not degrade on transient blocks (those reconnect in place)", () => {
    expect(
      shouldDegradeToAnonymous(
        true,
        "Reached retry limit for incremental continuation requests",
      ),
    ).toBe(false);
    expect(shouldDegradeToAnonymous(true, "status code 503")).toBe(false);
  });

  it("does not degrade on playability errors (the stream is over)", () => {
    expect(
      shouldDegradeToAnonymous(true, "This video is unavailable"),
    ).toBe(false);
  });
});

describe("errorBodySnippet", () => {
  it("returns the youtubei.js response body, collapsed and truncated", () => {
    const err = Object.assign(new Error("failed"), {
      info: `{\n  "error": "bad"\n}${"x".repeat(400)}`,
    });
    const snippet = errorBodySnippet(err);
    expect(snippet?.startsWith('{ "error": "bad" }')).toBe(true);
    expect(snippet!.length).toBeLessThanOrEqual(300);
  });

  it("returns undefined when there is no body", () => {
    expect(errorBodySnippet(new Error("failed"))).toBeUndefined();
    expect(errorBodySnippet("plain string")).toBeUndefined();
  });
});
