import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("astro", () => ({
  APIRoute: {} as any,
}));

vi.mock("../../../src/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(() => true),
}));

const mockedFetch = vi.fn();

beforeEach(() => {
  vi.stubEnv("PUBLIC_TWITCH_CLIENT_ID", "client-id");
  vi.stubGlobal("fetch", mockedFetch);
  mockedFetch.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

import { GET } from "../../../src/pages/api/twitch-videos";

function makeRequest(
  login: string | null,
  cookies: Record<string, string> = {},
  after: string | null = null,
) {
  const params = new URLSearchParams();
  if (login !== null) params.set("login", login);
  if (after) params.set("after", after);
  const qs = params.size > 0 ? `?${params}` : "";
  return {
    url: new URL(`http://localhost/api/twitch-videos${qs}`),
    request: {
      headers: {
        get: (name: string) =>
          name === "x-forwarded-for" ? "127.0.0.1" : null,
      },
    },
    cookies: {
      get: (name: string) => {
        const value = cookies[name];
        return value ? { value } : undefined;
      },
    },
  } as any;
}

describe("GET /api/twitch-videos", () => {
  it("requires a valid login parameter", async () => {
    const missing = await GET(makeRequest(null, { twitch_token: "tok" }));
    expect(missing.status).toBe(400);

    const invalid = await GET(makeRequest("bad login!", { twitch_token: "tok" }));
    expect(invalid.status).toBe(400);
  });

  it("requires the Twitch auth cookie", async () => {
    const res = await GET(makeRequest("somechannel"));
    expect(res.status).toBe(401);
  });

  it("resolves the channel id then returns its latest archive VODs", async () => {
    const login = "vodchannel_aaaa";
    mockedFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: "42", login }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "v999",
              title: "A great stream",
              thumbnail_url:
                "https://static-cdn.jtvnw.net/cf_vods/{width}x{height}.jpg",
              url: "https://www.twitch.tv/videos/v999",
              duration: "2h3m4s",
              view_count: 12345,
              created_at: "2026-11-01T12:00:00Z",
              type: "archive",
            },
          ],
          pagination: { cursor: "next-cursor" },
        }),
      });

    const res = await GET(makeRequest(login, { twitch_token: "tok" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.videos).toHaveLength(1);
    expect(body.videos[0]).toMatchObject({
      id: "v999",
      title: "A great stream",
      thumbnailUrl:
        "https://static-cdn.jtvnw.net/cf_vods/320x180.jpg",
      duration: "2h3m4s",
      viewCount: 12345,
      type: "archive",
    });
    expect(body.cursor).toBe("next-cursor");

    expect(String(mockedFetch.mock.calls[0][0])).toContain(
      "/helix/users?login=vodchannel_aaaa",
    );
    expect(String(mockedFetch.mock.calls[1][0])).toContain(
      "/helix/videos?user_id=42&first=100&type=archive&sort=time",
    );
  });

  it("forwards the pagination cursor and returns the next one", async () => {
    const login = "pagedchannel_d";
    mockedFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: "77", login }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "v2",
              title: "Page two",
              thumbnail_url:
                "https://static-cdn.jtvnw.net/cf_vods/{width}x{height}.jpg",
              url: "https://www.twitch.tv/videos/v2",
              duration: "45m",
              view_count: 7,
              created_at: "2026-10-01T12:00:00Z",
              type: "archive",
            },
          ],
          pagination: { cursor: "next-page" },
        }),
      });

    const res = await GET(
      makeRequest(login, { twitch_token: "tok" }, "prev-cursor"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.cursor).toBe("next-page");
    expect(String(mockedFetch.mock.calls[1][0])).toContain(
      "after=prev-cursor",
    );
  });

  it("returns an empty list when the channel cannot be resolved", async () => {
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    const res = await GET(
      makeRequest("unknownchannel_b", { twitch_token: "tok" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ videos: [], cursor: null });
  });

  it("maps an upstream auth failure to 401", async () => {
    mockedFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "",
    });

    const res = await GET(
      makeRequest("expiredchannel_c", { twitch_token: "tok" }),
    );
    expect(res.status).toBe(401);
  });
});
