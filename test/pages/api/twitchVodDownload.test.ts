import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../../src/pages/api/twitch-vod-download";

function context(url: string, ip = "127.0.0.1"): Parameters<typeof GET>[0] {
  return {
    url: new URL(url),
    request: new Request(url, {
      headers: { "x-forwarded-for": ip },
    }),
    cookies: {
      get: (name: string) =>
        name === "twitch_token" ? { value: "token" } : undefined,
    },
  } as unknown as Parameters<typeof GET>[0];
}

const MASTER = `#EXTM3U
#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="chunked",NAME="1080p60"
#EXT-X-STREAM-INF:BANDWIDTH=8000000,VIDEO="chunked"
https://d2example.cloudfront.net/a/chunked/index-dvr.m3u8
`;

const VARIANT = `#EXTM3U
#EXTINF:10.000,
0.ts
#EXTINF:10.000,
1.ts
`;

function stubFetch() {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "https://id.twitch.tv/oauth2/validate") {
      return Promise.resolve(
        new Response(JSON.stringify({ user_id: "1", login: "someuser" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url === "https://gql.twitch.tv/gql") {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              videoPlaybackAccessToken: {
                value: JSON.stringify({
                  authorization: { forbidden: false, reason: "" },
                }),
                signature: "sig",
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    }
    if (url.startsWith("https://usher.ttvnw.net/vod/123.m3u8")) {
      return Promise.resolve(new Response(MASTER, { status: 200 }));
    }
    if (url.endsWith("/chunked/index-dvr.m3u8")) {
      return Promise.resolve(new Response(VARIANT, { status: 200 }));
    }
    if (url.endsWith("/chunked/0.ts")) {
      return Promise.resolve(
        new Response(new Uint8Array([65, 65, 65]), { status: 200 }),
      );
    }
    if (url.endsWith("/chunked/1.ts")) {
      return Promise.resolve(
        new Response(new Uint8Array([66, 66, 66]), { status: 200 }),
      );
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("GET /api/twitch-vod-download", () => {
  it("streams all VOD segments as a video file", async () => {
    stubFetch();

    const res = await GET(
      context("http://localhost/api/twitch-vod-download?video_id=123"),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("video/mp2t");
    expect(res.headers.get("Content-Disposition")).toContain(
      "vod-123-1080p60.ts",
    );

    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes)).toEqual([65, 65, 65, 66, 66, 66]);
  });

  it("requires an authenticated session", async () => {
    const fetchMock = stubFetch();
    const res = await GET({
      url: new URL(
        "http://localhost/api/twitch-vod-download?video_id=123",
      ),
      request: new Request(
        "http://localhost/api/twitch-vod-download?video_id=123",
      ),
      cookies: { get: () => undefined },
    } as unknown as Parameters<typeof GET>[0]);

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an expired Twitch token without downloading", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET(
      context(
        "http://localhost/api/twitch-vod-download?video_id=123",
        "127.0.0.3",
      ),
    );

    expect(res.status).toBe(401);
    expect((await res.json()).error).toContain("expired");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://id.twitch.tv/oauth2/validate",
      expect.anything(),
    );
  });

  it("rejects an invalid video id without calling Twitch", async () => {
    const fetchMock = stubFetch();
    const res = await GET(
      context(
        "http://localhost/api/twitch-vod-download?video_id=nope",
        "127.0.0.2",
      ),
    );

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
