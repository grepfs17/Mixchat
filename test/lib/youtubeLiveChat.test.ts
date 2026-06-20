import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/lib/google", () => ({
  googleFetch: vi.fn(),
}));

import {
  resolveActiveLiveChatId,
  invalidateLiveChatId,
} from "../../src/lib/youtubeLiveChat";
import { googleFetch } from "../../src/lib/google";

const mockedFetch = googleFetch as unknown as ReturnType<typeof vi.fn>;

describe("youtubeLiveChat.resolveActiveLiveChatId", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("resolves a liveChatId via the Data API and caches it", async () => {
    mockedFetch.mockResolvedValueOnce({
      items: [
        { liveStreamingDetails: { activeLiveChatId: "lc-abc" } },
      ],
    });

    const id1 = await resolveActiveLiveChatId("vid-1", "token");
    expect(id1).toBe("lc-abc");
    expect(mockedFetch).toHaveBeenCalledTimes(1);

    // Second call should hit the cache and not call googleFetch again.
    const id2 = await resolveActiveLiveChatId("vid-1", "token");
    expect(id2).toBe("lc-abc");
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it("returns null and avoids throwing when no liveChatId is present", async () => {
    mockedFetch.mockResolvedValueOnce({ items: [] });

    const id = await resolveActiveLiveChatId("vid-2", "token");
    expect(id).toBeNull();
  });

  it("invalidates the cache so a fresh lookup is performed", async () => {
    mockedFetch.mockResolvedValueOnce({
      items: [{ liveStreamingDetails: { activeLiveChatId: "lc-1" } }],
    });
    expect(await resolveActiveLiveChatId("vid-3", "token")).toBe("lc-1");

    invalidateLiveChatId("vid-3");

    mockedFetch.mockResolvedValueOnce({
      items: [{ liveStreamingDetails: { activeLiveChatId: "lc-2" } }],
    });
    expect(await resolveActiveLiveChatId("vid-3", "token")).toBe("lc-2");
  });
});
