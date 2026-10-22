import { describe, it, expect } from "vitest";
import {
  isTransientChatBlock,
  shouldFallbackToAnonymous,
} from "../../../src/pages/api/youtube-stream-chat";

describe("isTransientChatBlock", () => {
  it("classifies the youtubei.js continuation parse failure as transient", () => {
    expect(
      isTransientChatBlock(
        "Unexpected live chat incremental continuation response",
      ),
    ).toBe(true);
  });

  it("classifies proxy 503 block payloads as transient", () => {
    expect(
      isTransientChatBlock(
        '{"error":"YouTube temporarily blocked","retryAfter":30}',
      ),
    ).toBe(true);
  });

  it("classifies Axios-style failed-request messages as transient", () => {
    expect(isTransientChatBlock("Request failed with status code 503")).toBe(
      true,
    );
    expect(isTransientChatBlock("Request failed with status code 429")).toBe(
      true,
    );
  });

  it("classifies rate-limit messages as transient", () => {
    expect(isTransientChatBlock("status code 429")).toBe(true);
    expect(isTransientChatBlock("429 Too Many Requests")).toBe(true);
  });

  it("does not classify hard 403 blocks as transient", () => {
    // 403s are handled by a separate branch that cleans up the session.
    expect(isTransientChatBlock("status code 403")).toBe(false);
    expect(isTransientChatBlock("Request failed with status code 403")).toBe(
      false,
    );
  });

  it("does not classify generic or playability errors as transient", () => {
    expect(isTransientChatBlock("Failed to fetch")).toBe(false);
    expect(isTransientChatBlock("Video unavailable")).toBe(false);
    expect(isTransientChatBlock("chat connection lost")).toBe(false);
    expect(isTransientChatBlock("")).toBe(false);
  });
});

describe("shouldFallbackToAnonymous", () => {
  it("falls back when the viewer's authenticated setup is rejected (401/403)", () => {
    // A rejected token must not take read-only chat down.
    expect(
      shouldFallbackToAnonymous(
        "Request to https://www.youtube.com/youtubei/v1/player failed with status code 403",
      ),
    ).toBe(true);
    expect(shouldFallbackToAnonymous("Forbidden (403)")).toBe(true);
    expect(shouldFallbackToAnonymous("status code 401")).toBe(true);
  });

  it("still falls back on generic auth/setup errors", () => {
    expect(shouldFallbackToAnonymous("Failed to fetch")).toBe(true);
    expect(shouldFallbackToAnonymous("Invalid tokens provided.")).toBe(true);
  });

  it("falls back when the authenticated session is in a 403 cooldown", () => {
    // The guest session has its own key, so it may still be usable.
    expect(shouldFallbackToAnonymous("BLOCKED")).toBe(true);
  });

  it("does not fall back for playability errors", () => {
    expect(shouldFallbackToAnonymous("PLAYABILITY: This video is unavailable")).toBe(
      false,
    );
    expect(shouldFallbackToAnonymous("This video is private")).toBe(false);
  });

  it("does not fall back for transient blocks", () => {
    expect(shouldFallbackToAnonymous("Request failed with status code 503")).toBe(
      false,
    );
    expect(
      shouldFallbackToAnonymous("YouTube temporarily blocked"),
    ).toBe(false);
  });
});
