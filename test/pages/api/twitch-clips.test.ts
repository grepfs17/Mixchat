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

import { GET } from "../../../src/pages/api/twitch-clips";

function makeRequest(
  login: string | null,
  cookies: Record<string, string> = {},
  after: string | null = null,
  extra: Record<string, string> = {},
) {
  const params = new URLSearchParams();
  if (login !== null) params.set("login", login);
  if (after) params.set("after", after);
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  const qs = params.size > 0 ? `?${params}` : "";
  return {
    url: new URL(`http://localhost/api/twitch-clips${qs}`),
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

describe("GET /api/twitch-clips", () => {
  it("requires a valid login parameter", async () => {
    const missing = await GET(makeRequest(null, { twitch_token: "tok" }));
    expect(missing.status).toBe(400);

    const invalid = await GET(
      makeRequest("bad login!", { twitch_token: "tok" }),
    );
    expect(invalid.status).toBe(400);
  });

  it("requires the Twitch auth cookie", async () => {
    const res = await GET(makeRequest("somechannel"));
    expect(res.status).toBe(401);
  });

  it("resolves the channel id then returns featured clips", async () => {
    const login = "clipchannel_aaaa";
    mockedFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: "99", login }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "FunnyClip-abc123",
              url: `https://www.twitch.tv/${login}/clip/FunnyClip-abc123`,
              title: "A funny moment",
              thumbnail_url:
                "https://clips-media-assets2.twitch.tv/{width}x{height}.jpg",
              duration: 28,
              view_count: 9001,
              created_at: "2026-11-02T12:00:00Z",
              creator_name: "clipper",
            },
          ],
          pagination: { cursor: "next-clip-cursor" },
        }),
      });

    const res = await GET(makeRequest(login, { twitch_token: "tok" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.clips).toHaveLength(1);
    expect(body.clips[0]).toMatchObject({
      id: "FunnyClip-abc123",
      url: `https://www.twitch.tv/${login}/clip/FunnyClip-abc123`,
      title: "A funny moment",
      thumbnailUrl:
        "https://clips-media-assets2.twitch.tv/320x180.jpg",
      duration: 28,
      viewCount: 9001,
      creatorName: "clipper",
    });
    expect(body.cursor).toBe("next-clip-cursor");

    const videosCall = String(mockedFetch.mock.calls[1][0]);
    expect(videosCall).toContain("/helix/clips?");
    expect(videosCall).toContain("broadcaster_id=99");
    expect(videosCall).toContain("first=50");
    expect(videosCall).toContain("started_at=");
    expect(videosCall).toContain("ended_at=");
  });

  it("forwards the pagination cursor", async () => {
    const login = "clipchannel_paged";
    mockedFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: "77", login }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [], pagination: {} }),
      });

    const res = await GET(
      makeRequest(login, { twitch_token: "tok" }, "prev-clip-cursor"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ clips: [], cursor: null });
    expect(String(mockedFetch.mock.calls[1][0])).toContain(
      "after=prev-clip-cursor",
    );
  });

  it("supports the all-time period and featured-only filter", async () => {
    const login = "clipchannel_filters";
    mockedFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: "55", login }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [], pagination: {} }),
      });

    const res = await GET(
      makeRequest(login, { twitch_token: "tok" }, null, {
        period: "all",
        featured: "true",
      }),
    );
    expect(res.status).toBe(200);

    const clipsCall = String(mockedFetch.mock.calls[1][0]);
    expect(clipsCall).toContain("broadcaster_id=55");
    expect(clipsCall).not.toContain("started_at=");
    expect(clipsCall).not.toContain("ended_at=");
    expect(clipsCall).toContain("is_featured=true");
  });

  it("rejects an invalid period", async () => {
    const res = await GET(
      makeRequest("clipchannel_badperiod", { twitch_token: "tok" }, null, {
        period: "year",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns an empty list when the channel cannot be resolved", async () => {
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    const res = await GET(
      makeRequest("unknownclipchannel", { twitch_token: "tok" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ clips: [], cursor: null });
  });

  it("maps an upstream auth failure to 401", async () => {
    mockedFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "",
    });

    const res = await GET(
      makeRequest("expiredclipchannel", { twitch_token: "tok" }),
    );
    expect(res.status).toBe(401);
  });
});
