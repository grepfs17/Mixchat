import { describe, it, expect } from "vitest";
import {
  isPlayabilityError,
  PLAYABILITY_ERROR_PATTERNS,
} from "../../../src/pages/api/youtube-stream-chat.playability";

describe("isPlayabilityError", () => {
  it("matches the exact error returned by youtubei.js for unavailable videos", () => {
    expect(isPlayabilityError("This video is unavailable")).toBe(true);
  });

  it("matches the original 'not available' wording for backward compatibility", () => {
    expect(isPlayabilityError("Live chat is not available for this stream")).toBe(
      true,
    );
  });

  it("matches common YouTube playability messages", () => {
    const cases = [
      "This video is private",
      "This video has been removed by the uploader",
      "This video is unavailable. Watch on YouTube.",
      "Sign in to confirm your age",
      "This live stream recording is not available",
    ];
    for (const c of cases) {
      expect(isPlayabilityError(c)).toBe(true);
    }
  });

  it("does not match transient/network errors", () => {
    const cases = [
      "status code 403",
      "Connection lost",
      "Failed to connect to YouTube chat",
      "BLOCKED",
      "fetch failed",
      "ECONNRESET",
      "",
    ];
    for (const c of cases) {
      expect(isPlayabilityError(c)).toBe(false);
    }
  });

  it("pattern list is non-empty and every entry is a real substring of at least one YouTube error", () => {
    expect(PLAYABILITY_ERROR_PATTERNS.length).toBeGreaterThan(0);
    for (const p of PLAYABILITY_ERROR_PATTERNS) {
      expect(typeof p).toBe("string");
      expect(p.length).toBeGreaterThan(0);
      // Every pattern should match the example that names it.
      expect(isPlayabilityError(`error: ${p} happened`)).toBe(true);
    }
  });
});
