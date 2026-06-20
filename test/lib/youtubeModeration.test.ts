import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  deleteYouTubeMessage,
  banYouTubeUser,
  timeoutYouTubeUser,
} from "../../src/lib/youtubeModeration";

describe("youtubeModeration client helpers", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  describe("deleteYouTubeMessage", () => {
    it("POSTs to /api/youtube-moderation with delete action", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });

      await deleteYouTubeMessage("vid-1", "msg-1");

      expect(global.fetch).toHaveBeenCalledWith(
        "/api/youtube-moderation",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "delete",
            videoId: "vid-1",
            messageId: "msg-1",
          }),
        }),
      );
    });

    it("throws a YouTubeModError with the server's message on failure", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: "No permission" }),
      });

      await expect(deleteYouTubeMessage("vid-1", "msg-1")).rejects.toMatchObject(
        { message: "No permission", status: 403 },
      );
    });

    it("falls back to generic message when error body is unparseable", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("bad json");
        },
        text: async () => "internal",
      });

      await expect(deleteYouTubeMessage("vid-1", "msg-1")).rejects.toMatchObject(
        { message: "internal", status: 500 },
      );
    });
  });

  describe("banYouTubeUser", () => {
    it("POSTs a permanent ban request", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });

      await banYouTubeUser("vid-1", "UC-xyz", "Spammer");

      expect(global.fetch).toHaveBeenCalledWith(
        "/api/youtube-moderation",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            action: "ban",
            videoId: "vid-1",
            channelId: "UC-xyz",
          }),
        }),
      );
    });
  });

  describe("timeoutYouTubeUser", () => {
    it("POSTs a temporary ban request with the duration", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });

      await timeoutYouTubeUser("vid-1", "UC-xyz", 600, "Troll");

      expect(global.fetch).toHaveBeenCalledWith(
        "/api/youtube-moderation",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            action: "timeout",
            videoId: "vid-1",
            channelId: "UC-xyz",
            durationSeconds: 600,
          }),
        }),
      );
    });
  });
});
