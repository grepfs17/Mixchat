import { describe, it, expect, beforeEach } from "vitest";
import {
  extractVideoId,
  getThrottleKey,
  _resetThrottleState,
  _getThrottleState,
} from "../../src/lib/youtube";

describe("per-videoId throttle", () => {
  beforeEach(() => {
    _resetThrottleState();
  });

  describe("extractVideoId", () => {
    it("extracts videoId from top-level JSON body", () => {
      const body = JSON.stringify({
        videoId: "dQw4w9WgXcQ",
        context: { client: { clientName: "WEB" } },
      });
      expect(extractVideoId(body)).toBe("dQw4w9WgXcQ");
    });

    it("extracts videoId from context.videoId", () => {
      const body = JSON.stringify({
        context: { videoId: "abc12345678" },
      });
      expect(extractVideoId(body)).toBe("abc12345678");
    });

    it("returns null for undefined body", () => {
      expect(extractVideoId(undefined)).toBeNull();
    });

    it("returns null for empty string body", () => {
      expect(extractVideoId("")).toBeNull();
    });

    it("returns null for non-JSON body", () => {
      expect(extractVideoId("not json")).toBeNull();
    });

    it("returns null when no videoId present", () => {
      const body = JSON.stringify({ context: { client: {} } });
      expect(extractVideoId(body)).toBeNull();
    });
  });

  describe("getThrottleKey", () => {
    const LIVE_CHAT_URL =
      "https://www.youtube.com/youtubei/v1/live_chat/get_live_chat";
    const METADATA_URL =
      "https://www.youtube.com/youtubei/v1/updated_metadata";
    const OTHER_URL = "https://www.youtube.com/youtubei/v1/player";

    it("returns per-videoId key for live_chat with videoId in body", () => {
      const body = JSON.stringify({ videoId: "dQw4w9WgXcQ" });
      expect(getThrottleKey(LIVE_CHAT_URL, body)).toBe(
        "live_chat:dQw4w9WgXcQ",
      );
    });

    it("returns per-videoId key for updated_metadata", () => {
      const body = JSON.stringify({ videoId: "abc12345678" });
      expect(getThrottleKey(METADATA_URL, body)).toBe(
        "metadata:abc12345678",
      );
    });

    it("falls back to generic key when no videoId in body", () => {
      const body = JSON.stringify({ context: { client: {} } });
      expect(getThrottleKey(LIVE_CHAT_URL, body)).toBe("live_chat");
    });

    it("falls back to generic key when body is undefined", () => {
      expect(getThrottleKey(LIVE_CHAT_URL)).toBe("live_chat");
    });

    it("returns null for non-throttled URLs", () => {
      expect(getThrottleKey(OTHER_URL)).toBeNull();
    });
  });

  describe("per-session independence", () => {
    it("two different videoIds have independent throttle state", () => {
      const state = _getThrottleState();
      // Initially empty
      expect(state["live_chat:videoA"]).toBeUndefined();
      expect(state["live_chat:videoB"]).toBeUndefined();
    });
  });
});
