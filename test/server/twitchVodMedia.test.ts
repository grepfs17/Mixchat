import { afterEach, describe, expect, it, vi } from "vitest";
import { getVodMedia, VodMediaError } from "../../src/server/twitchVodMedia";

const MASTER_HEADER = `#EXTM3U
#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="chunked",NAME="1080p60"
`;

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(body: string, status = 200) {
  return new Response(body, { status });
}

function tokenResponse() {
  return jsonResponse({
    data: {
      videoPlaybackAccessToken: {
        value: JSON.stringify({ authorization: { forbidden: false } }),
        signature: "sig",
      },
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("getVodMedia", () => {
  it("resolves the highest-bandwidth variant and its fMP4 segments", async () => {
    const master = `${MASTER_HEADER}#EXT-X-STREAM-INF:BANDWIDTH=1000,VIDEO="chunked"
https://d1example.cloudfront.net/low.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=8000000,VIDEO="chunked"
https://d2example.cloudfront.net/high.m3u8
`;
    const playlist = `#EXTM3U
#EXT-X-MAP:URI="init.mp4"
#EXTINF:10.0,
0.m4s
#EXTINF:10.0,
1.m4s
`;

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://gql.twitch.tv/gql") {
        return Promise.resolve(tokenResponse());
      }
      if (url.startsWith("https://usher.ttvnw.net/vod/123.m3u8")) {
        return Promise.resolve(textResponse(master));
      }
      if (url === "https://d2example.cloudfront.net/high.m3u8") {
        return Promise.resolve(textResponse(playlist));
      }
      return Promise.resolve(textResponse("not found", 404));
    });
    vi.stubGlobal("fetch", fetchMock);

    const media = await getVodMedia("123", "token");

    expect(media).toEqual({
      quality: "1080p60",
      isFmp4: true,
      segmentUrls: [
        "https://d2example.cloudfront.net/init.mp4",
        "https://d2example.cloudfront.net/0.m4s",
        "https://d2example.cloudfront.net/1.m4s",
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://d2example.cloudfront.net/high.m3u8",
      expect.anything(),
    );
  });

  it("rejects a variant playlist on a non-Twitch host", async () => {
    const master = `${MASTER_HEADER}#EXT-X-STREAM-INF:BANDWIDTH=8000000,VIDEO="chunked"
https://cloudfront.net.evil.example/high.m3u8
`;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://gql.twitch.tv/gql") {
        return Promise.resolve(tokenResponse());
      }
      if (url.startsWith("https://usher.ttvnw.net/vod/123.m3u8")) {
        return Promise.resolve(textResponse(master));
      }
      return Promise.resolve(textResponse("not found", 404));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getVodMedia("123")).rejects.toMatchObject({
      name: "VodMediaError",
      message: "Unsupported VOD media host",
    });
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("evil.example"),
      ),
    ).toBe(false);
  });

  it("rejects a segment on a non-Twitch host", async () => {
    const master = `${MASTER_HEADER}#EXT-X-STREAM-INF:BANDWIDTH=8000000,VIDEO="chunked"
https://d2example.cloudfront.net/high.m3u8
`;
    const playlist = `#EXTM3U
#EXTINF:10.0,
https://evil.example/0.ts
`;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://gql.twitch.tv/gql") {
        return Promise.resolve(tokenResponse());
      }
      if (url.startsWith("https://usher.ttvnw.net/vod/123.m3u8")) {
        return Promise.resolve(textResponse(master));
      }
      if (url === "https://d2example.cloudfront.net/high.m3u8") {
        return Promise.resolve(textResponse(playlist));
      }
      return Promise.resolve(textResponse("not found", 404));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getVodMedia("123")).rejects.toBeInstanceOf(VodMediaError);
  });

  it("rejects an insecure segment URL", async () => {
    const master = `${MASTER_HEADER}#EXT-X-STREAM-INF:BANDWIDTH=8000000,VIDEO="chunked"
https://d2example.cloudfront.net/high.m3u8
`;
    const playlist = `#EXTM3U
#EXTINF:10.0,
http://d2example.cloudfront.net/0.ts
`;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://gql.twitch.tv/gql") {
        return Promise.resolve(tokenResponse());
      }
      if (url.startsWith("https://usher.ttvnw.net/vod/123.m3u8")) {
        return Promise.resolve(textResponse(master));
      }
      if (url === "https://d2example.cloudfront.net/high.m3u8") {
        return Promise.resolve(textResponse(playlist));
      }
      return Promise.resolve(textResponse("not found", 404));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getVodMedia("123")).rejects.toMatchObject({
      message: "Unsupported VOD media host",
    });
  });

  it("retries the playback token anonymously when Twitch rejects it", async () => {
    const master = `${MASTER_HEADER}#EXT-X-STREAM-INF:BANDWIDTH=8000000,VIDEO="chunked"
https://d2example.cloudfront.net/high.m3u8
`;
    const playlist = `#EXTM3U
#EXTINF:10.0,
0.ts
`;
    let gqlCalls = 0;
    const fetchMock = vi.fn(
      (input: RequestInfo | URL, _init?: RequestInit) => {
        const url = String(input);
        if (url === "https://gql.twitch.tv/gql") {
          gqlCalls += 1;
          return Promise.resolve(
            gqlCalls === 1
              ? textResponse("rejected", 401)
              : tokenResponse(),
          );
        }
        if (url.startsWith("https://usher.ttvnw.net/vod/123.m3u8")) {
          return Promise.resolve(textResponse(master));
        }
        if (url === "https://d2example.cloudfront.net/high.m3u8") {
          return Promise.resolve(textResponse(playlist));
        }
        return Promise.resolve(textResponse("not found", 404));
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const media = await getVodMedia("123", "valid-token");

    expect(media.segmentUrls).toEqual([
      "https://d2example.cloudfront.net/0.ts",
    ]);
    expect(gqlCalls).toBe(2);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: "OAuth valid-token" }),
    });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      headers: expect.not.objectContaining({ Authorization: expect.anything() }),
    });
  });
});
