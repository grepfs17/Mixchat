import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("astro", () => ({
  APIRoute: {} as any,
}));

vi.mock("../../../src/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(() => true),
}));

const mockedFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockedFetch);
  mockedFetch.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

import { GET } from "../../../src/pages/api/twitch-link-preview";

function makeRequest(urlParam: string | null, cookies: Record<string, string> = {}) {
  const qs = urlParam ? `?url=${encodeURIComponent(urlParam)}` : "";
  return {
    url: new URL(`http://localhost/api/twitch-link-preview${qs}`),
    request: {
      headers: {
        get: (name: string) => (name === "x-forwarded-for" ? "127.0.0.1" : null),
      },
    },
    cookies: {
      get: (name: string) => {
        const v = cookies[name];
        return v ? { value: v } : undefined;
      },
    },
  } as any;
}

describe("GET /api/twitch-link-preview", () => {
  it("returns 401 when the twitch_token cookie is missing", async () => {
    const res = await GET(makeRequest("https://www.twitch.tv/lunateac"));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toMatch(/auth/i);
  });

  it("returns 400 when the url query parameter is missing", async () => {
    const res = await GET(makeRequest(null, { twitch_token: "tok" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when the url is not a Twitch URL", async () => {
    const res = await GET(
      makeRequest("https://example.com/foo", { twitch_token: "tok" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on reserved Twitch paths", async () => {
    const res = await GET(
      makeRequest("https://www.twitch.tv/settings", { twitch_token: "tok" }),
    );
    expect(res.status).toBe(400);
  });

  it("fetches channel + streams data for a live channel URL and returns aggregated preview", async () => {
    const login = "live_channel_name_aaaa";
    mockedFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "1",
              login,
              display_name: "LiveChannelA",
              profile_image_url: "https://example.com/avatar.png",
              offline_image_url: "https://example.com/offline.png",
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              user_id: "1",
              title: "Live stream right now",
              game_name: "Chilling",
              viewer_count: 42,
              thumbnail_url:
                "https://example.com/thumb-{width}x{height}.jpg",
            },
          ],
        }),
      });
    const res = await GET(
      makeRequest(`https://www.twitch.tv/${login}`, {
        twitch_token: "tok",
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.kind).toBe("channel");
    expect(data.title).toBe("Live stream right now");
    expect(data.author.login).toBe(login);
    expect(data.author.displayName).toBe("LiveChannelA");
    expect(data.live).toBe(true);
    expect(data.viewers).toBe(42);
    expect(data.thumbnailUrl).toBe("https://example.com/thumb-320x180.jpg");
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(mockedFetch.mock.calls[0][0]).toContain(
      `/helix/users?login=${login}`,
    );
    expect(mockedFetch.mock.calls[1][0]).toContain(
      `/helix/streams?user_login=${login}`,
    );
  });

  it("returns offline channel preview when no streams data is returned", async () => {
    const login = "offline_channel_name_bbbb";
    mockedFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "1",
              login,
              display_name: "OfflineChannelB",
              profile_image_url: "https://example.com/avatar.png",
              offline_image_url: "",
            },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) });
    const res = await GET(
      makeRequest(`https://twitch.tv/${login}`, { twitch_token: "tok" }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.live).toBe(false);
    expect(data.title).toBeDefined();
  });

  it("returns a 404 when the channel does not exist", async () => {
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });
    const res = await GET(
      makeRequest(
        "https://twitch.tv/thischanneldoesnotexist1234567890xxx",
        { twitch_token: "tok" },
      ),
    );
    expect(res.status).toBe(404);
  });

  it("fetches VOD metadata for /videos/<id> URLs", async () => {
    const videoId = "9876543210";
    mockedFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: videoId,
              user_id: "42",
              title: "A VOD broadcast highlight",
              thumbnail_url:
                "https://example.com/vod-{width}x{height}.jpg",
              duration: "1h23m",
              view_count: 999,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "42",
              login: "vod_author_unique",
              display_name: "VodAuthor",
              profile_image_url: "https://example.com/avatar.png",
            },
          ],
        }),
      });
    const res = await GET(
      makeRequest(`https://twitch.tv/videos/${videoId}`, {
        twitch_token: "tok",
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.kind).toBe("video");
    expect(data.title).toBe("A VOD broadcast highlight");
    expect(data.duration).toBe("1h23m");
    expect(data.author.login).toBe("vod_author_unique");
  });

  it("fetches clip metadata for /<ch>/clip/<slug> URLs and exposes creator info", async () => {
    const slug = "UniqueClipSlug_xxyy";
    mockedFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "clipid",
              title: "An exciting clip moment",
              thumbnail_url: "https://example.com/clip.jpg",
              creator_id: "100",
              broadcaster_id: "1",
              view_count: 7,
              duration: 30,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "100",
              login: "creator_login",
              display_name: "ClipCreator",
              profile_image_url: "https://example.com/c.png",
            },
            {
              id: "1",
              login: "broadcaster_login",
              display_name: "BroadcasterX",
              profile_image_url: "https://example.com/a.png",
            },
          ],
        }),
      });
    const res = await GET(
      makeRequest(`https://www.twitch.tv/broadcaster_login/clip/${slug}`, {
        twitch_token: "tok",
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.kind).toBe("clip");
    expect(data.title).toBe("An exciting clip moment");
    expect(data.author.login).toBe("broadcaster_login");
    expect(data.creator.login).toBe("creator_login");
  });

  it("short clips videos URLs (clips.twitch.tv/<slug>) are forwarded to Helix /clips", async () => {
    const slug = "ShortSlug_zzzzz";
    mockedFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "shortclipid",
              title: "Short clip",
              thumbnail_url: "https://example.com/short.jpg",
              creator_id: "100",
              broadcaster_id: "1",
              view_count: 3,
              duration: 6,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "100",
              login: "c2unique",
              display_name: "Creator2",
              profile_image_url: "",
            },
            {
              id: "1",
              login: "b2unique",
              display_name: "Broadcaster2",
              profile_image_url: "",
            },
          ],
        }),
      });
    const res = await GET(
      makeRequest(`https://clips.twitch.tv/${slug}`, {
        twitch_token: "tok",
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.kind).toBe("clip");
    expect(data.title).toBe("Short clip");
  });
});
