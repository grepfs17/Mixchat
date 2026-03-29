import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getYoutubeUser } from "../../src/lib/youtube";

describe("getYoutubeUser", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns mapped user on success", async () => {
    const mockResponse = {
      items: [
        {
          id: "chan1",
          snippet: {
            title: "Channel Title",
            thumbnails: { default: { url: "http://example.com/avatar.png" } },
          },
        },
      ],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      }),
    );

    const result = await getYoutubeUser("token-abc");

    expect(result).toEqual({
      userId: "chan1",
      displayName: "Channel Title",
      profileImageUrl: "http://example.com/avatar.png",
    });
  });

  it("throws when response not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        statusText: "Unauthorized",
      }),
    );

    await expect(getYoutubeUser("bad-token")).rejects.toThrow(
      "Failed to get YouTube user: Unauthorized",
    );
  });

  it("throws when no items returned", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [] }),
      }),
    );

    await expect(getYoutubeUser("token-xyz")).rejects.toThrow(
      "No YouTube channel found",
    );
  });
});
