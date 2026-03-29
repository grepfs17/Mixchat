import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getFollowedChannels } from "../../src/lib/twitch";

describe("getFollowedChannels pagination + enrichment", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns only online channels with profile images and viewer counts", async () => {
    // We'll simulate multiple fetch responses depending on the URL
    const fetchMock: any = vi.fn().mockImplementation(async (input: any) => {
      const url =
        typeof input === "string" ? input : input.url?.toString() || "";

      if (url.includes("/channels/followed")) {
        // Serve two pages: first with cursor, second without
        if (!fetchMock.page1Served) {
          fetchMock.page1Served = true;
          return {
            ok: true,
            json: async () => ({
              data: [
                {
                  broadcaster_id: "10",
                  broadcaster_login: "ch10",
                  broadcaster_name: "Ch10",
                  game_name: "Game1",
                  thumbnail_url: "thumb1",
                },
                {
                  broadcaster_id: "20",
                  broadcaster_login: "ch20",
                  broadcaster_name: "Ch20",
                  game_name: "Game2",
                  thumbnail_url: "thumb2",
                },
              ],
              pagination: { cursor: "CURSOR1" },
            }),
          };
        }

        // second page
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                broadcaster_id: "30",
                broadcaster_login: "ch30",
                broadcaster_name: "Ch30",
                game_name: "Game3",
                thumbnail_url: "thumb3",
              },
            ],
            pagination: {},
          }),
        };
      }

      if (url.includes("/users?")) {
        // User profile enrichment
        return {
          ok: true,
          json: async () => ({
            data: [
              { id: "10", profile_image_url: "p10" },
              { id: "20", profile_image_url: "p20" },
              { id: "30", profile_image_url: "p30" },
            ],
          }),
        };
      }

      if (url.includes("/streams?")) {
        // Streams: only user 20 is live
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                user_id: "20",
                viewer_count: 50,
                title: "Live Now",
                started_at: "2024-01-01T00:00:00Z",
              },
            ],
          }),
        };
      }

      // default
      return { ok: false, status: 404 };
    });

    vi.stubGlobal("fetch", fetchMock as any);

    const result = await getFollowedChannels("token", "client", "me");

    // Only channel with id '20' should be online
    expect(result).toHaveLength(1);
    const ch = result[0];
    expect(ch.id).toBe("20");
    expect(ch.profileImageUrl).toBe("p20");
    expect(ch.viewerCount).toBe(50);
  });

  it("throws when channels endpoint returns 401 Unauthorized", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );

    await expect(getFollowedChannels("token", "client", "me")).rejects.toThrow(
      "Twitch API error: 401 - Unauthorized. Token may be expired or invalid.",
    );
  });
});
