import { describe, it, expect, vi, afterEach } from "vitest";
import { getModeratedChannels } from "../../src/lib/twitch";

describe("getModeratedChannels pagination + enrichment", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("paginates and returns online and offline moderated channels", async () => {
    const fetchMock: any = vi.fn().mockImplementation(async (input: any) => {
      const url =
        typeof input === "string" ? input : input.url?.toString() || "";

      if (url.includes("/moderation/channels")) {
        if (!fetchMock.page1Served) {
          fetchMock.page1Served = true;
          return {
            ok: true,
            json: async () => ({
              data: [
                {
                  broadcaster_id: "10",
                  broadcaster_login: "offlinechan",
                  broadcaster_name: "OfflineChan",
                },
              ],
              pagination: { cursor: "CURSOR1" },
            }),
          };
        }

        return {
          ok: true,
          json: async () => ({
            data: [
              {
                broadcaster_id: "20",
                broadcaster_login: "livechan",
                broadcaster_name: "LiveChan",
              },
            ],
            pagination: {},
          }),
        };
      }

      if (url.includes("/users?")) {
        return {
          ok: true,
          json: async () => ({
            data: [
              { id: "10", profile_image_url: "p10" },
              { id: "20", profile_image_url: "p20" },
            ],
          }),
        };
      }

      if (url.includes("/streams?")) {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                user_id: "20",
                viewer_count: 75,
                game_name: "Game",
                thumbnail_url: "thumb20",
              },
            ],
          }),
        };
      }

      return { ok: false, status: 404 };
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await getModeratedChannels("token", "client", "me");

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("20");
    expect(result[0].isLive).toBe(true);
    expect(result[0].viewerCount).toBe(75);
    expect(result[0].profileImageUrl).toBe("p20");

    expect(result[1].id).toBe("10");
    expect(result[1].isLive).toBe(false);
    expect(result[1].viewerCount).toBe(0);
    expect(result[1].profileImageUrl).toBe("p10");

    const requestedUrls = fetchMock.mock.calls.map(([input]: [any]) =>
      typeof input === "string" ? input : input.url?.toString() || "",
    );
    expect(
      requestedUrls.filter((url: string) =>
        url.includes("/moderation/channels"),
      ),
    ).toHaveLength(2);
    expect(
      requestedUrls.some((url: string) => url.includes("after=CURSOR1")),
    ).toBe(true);
  });

  it("returns an empty list when the scope is missing (403)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403 }),
    );

    await expect(
      getModeratedChannels("token", "client", "me"),
    ).resolves.toEqual([]);
  });

  it("throws when the endpoint returns 401 Unauthorized", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );

    await expect(
      getModeratedChannels("token", "client", "me"),
    ).rejects.toThrow(
      "Twitch API error: 401 - Unauthorized. Token may be expired or invalid.",
    );
  });
});
