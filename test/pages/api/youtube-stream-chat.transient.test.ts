import { describe, it, expect } from "vitest";
import { isTransientChatBlock } from "../../../src/pages/api/youtube-stream-chat";

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