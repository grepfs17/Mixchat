import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("astro", () => ({
  APIRoute: {} as any,
}));

vi.mock("../../../src/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(() => true),
}));

const mockedFetch = vi.fn();

const MASTER_PLAYLIST = `#EXTM3U
#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="chunked",NAME="1440p60 (source)",AUTOSELECT=YES,DEFAULT=YES
#EXT-X-STREAM-INF:BANDWIDTH=8512000,RESOLUTION=2560x1440,CODECS="hvc1.1.6.L153.B0,mp4a.40.2",VIDEO="chunked",FRAME-RATE=60.000
https://video-weaver.example.ttvnw.net/v1/playlist/1440p.m3u8
#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="1080p60",NAME="1080p60",AUTOSELECT=YES,DEFAULT=YES
#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,CODECS="avc1.64002A,mp4a.40.2",VIDEO="1080p60",FRAME-RATE=60.000
https://video-weaver.example.ttvnw.net/v1/playlist/1080p.m3u8
#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="audio_only",NAME="audio_only",AUTOSELECT=NO,DEFAULT=NO
#EXT-X-STREAM-INF:BANDWIDTH=160000,CODECS="mp4a.40.2",VIDEO="audio_only"
https://video-weaver.example.ttvnw.net/v1/playlist/audio.m3u8
`;

const TOKEN_RESPONSE = {
  data: {
    streamPlaybackAccessToken: {
      value: '{"maximum_resolution":"QUAD_HD","user_id":"42"}',
      signature: "sig",
    },
  },
};

const ANONYMOUS_TOKEN_RESPONSE = {
  data: {
    streamPlaybackAccessToken: {
      value: '{"maximum_resolution":"FULL_HD","user_id":null}',
      signature: "sig",
    },
  },
};

function gqlRequest(init: RequestInit | undefined) {
  return JSON.parse(String(init?.body ?? "{}"));
}

beforeEach(() => {
  vi.stubEnv("PUBLIC_TWITCH_CLIENT_ID", "desktop-client-id");
  vi.stubGlobal("fetch", mockedFetch);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mockedFetch.mockReset();
  mockedFetch.mockImplementation(
    async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://gql.twitch.tv/integrity") {
        return { ok: true, json: async () => ({ token: "integrity" }) };
      }
      if (url === "https://gql.twitch.tv/gql") {
        return { ok: true, json: async () => TOKEN_RESPONSE };
      }
      if (url.includes("api.twitch.tv/helix/users")) {
        return { ok: true, json: async () => ({ data: [{ id: "42" }] }) };
      }
      if (url.includes("api.twitch.tv/helix/subscriptions")) {
        return { ok: true, json: async () => ({ data: [] }) };
      }
      if (url.startsWith("https://usher.ttvnw.net/")) {
        return { ok: true, text: async () => MASTER_PLAYLIST };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    },
  );
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

import { GET } from "../../../src/pages/api/stream-playlist";

function makeRequest(query: Record<string, string>, tokens: Record<string, string>) {
  const params = new URLSearchParams(query);
  const url = new URL(`http://localhost/api/stream-playlist?${params}`);
  return {
    url,
    request: {
      headers: {
        get: () => null,
      },
    },
    cookies: {
      get: (name: string) => {
        const value = tokens[name];
        return value ? { value } : undefined;
      },
    },
  } as any;
}

function gqlCalls() {
  return mockedFetch.mock.calls.filter(
    ([input]) => String(input) === "https://gql.twitch.tv/gql",
  );
}

describe("GET /api/stream-playlist", () => {
  it("requests the signed-in web player token and returns HEVC 1440p", async () => {
    const res = await GET(
      makeRequest(
        { channel: "somechannel", codecs: "av1,h265,h264" },
        { twitch_token: "oauth-token" },
      ),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.qualities[0]).toMatchObject({
      label: "1440p60 (source)",
      codecs: "hvc1.1.6.L153.B0,mp4a.40.2",
    });
    expect(body.qualities[0].url).toContain("/api/hls-proxy?url=");

    const [gqlCall] = gqlCalls();
    const headers = gqlCall[1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("OAuth oauth-token");
    expect(headers["Client-ID"]).toBe("desktop-client-id");

    const bodyQuery = gqlRequest(gqlCall[1]).query as string;
    expect(bodyQuery).toContain('playerType:"site"');
    expect(bodyQuery).toContain('platform:"web"');

    const usherCall = mockedFetch.mock.calls.find(([input]) =>
      String(input).startsWith("https://usher.ttvnw.net/"),
    );
    const usherUrl = new URL(String(usherCall![0]));
    expect(usherUrl.searchParams.get("supported_codecs")).toBe("av1,h265,h264");
    expect(usherUrl.searchParams.get("client_id")).toBe("desktop-client-id");
    expect(usherUrl.searchParams.get("platform")).toBe("web");
    expect(usherUrl.searchParams.get("player")).toBe("twitchweb");
    expect(usherUrl.searchParams.get("oauth_token")).toBe("oauth-token");
  });

  it("only forwards allowlisted codecs", async () => {
    const res = await GET(
      makeRequest(
        { channel: "somechannel", codecs: "h265,evil,h264" },
        { twitch_token: "oauth-token" },
      ),
    );
    expect(res.status).toBe(200);

    const usherCall = mockedFetch.mock.calls.find(([input]) =>
      String(input).startsWith("https://usher.ttvnw.net/"),
    );
    const usherUrl = new URL(String(usherCall![0]));
    expect(usherUrl.searchParams.get("supported_codecs")).toBe("h265,h264");
  });

  it("falls back to the anonymous embed token when the OAuth token is rejected", async () => {
    mockedFetch.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "https://gql.twitch.tv/integrity") {
          return { ok: true, json: async () => ({ token: "integrity" }) };
        }
        if (url === "https://gql.twitch.tv/gql") {
          const headers = (init?.headers ?? {}) as Record<string, string>;
          if (headers.Authorization) {
            return { ok: false, status: 401, json: async () => ({}) };
          }
          return { ok: true, json: async () => ANONYMOUS_TOKEN_RESPONSE };
        }
        if (url.includes("api.twitch.tv/helix/users")) {
          return { ok: true, json: async () => ({ data: [{ id: "42" }] }) };
        }
        if (url.includes("api.twitch.tv/helix/subscriptions")) {
          return { ok: true, json: async () => ({ data: [] }) };
        }
        if (url.startsWith("https://usher.ttvnw.net/")) {
          return { ok: true, text: async () => MASTER_PLAYLIST };
        }
        throw new Error(`Unexpected fetch: ${url}`);
      },
    );

    const res = await GET(
      makeRequest(
        { channel: "somechannel", codecs: "h265,h264" },
        { twitch_token: "expired-token" },
      ),
    );
    expect(res.status).toBe(200);

    const calls = gqlCalls();
    expect(calls).toHaveLength(2);

    const usherCall = mockedFetch.mock.calls.find(([input]) =>
      String(input).startsWith("https://usher.ttvnw.net/"),
    );
    expect(new URL(String(usherCall![0])).searchParams.get("oauth_token")).toBeNull();
  });
});
