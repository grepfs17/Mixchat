import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../../src/pages/api/twitch-vod-chat";

function context(url: string): Parameters<typeof GET>[0] {
  return {
    url: new URL(url),
    request: new Request(url, {
      headers: { "x-forwarded-for": "127.0.0.1" },
    }),
  } as Parameters<typeof GET>[0];
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("GET /api/twitch-vod-chat", () => {
  it("normalizes Twitch comments and requests the given offset", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            video: {
              comments: {
                edges: [
                  {
                    cursor: "cursor-1",
                    node: {
                      id: "comment-1",
                      commenter: {
                        id: "user-1",
                        login: "someuser",
                        displayName: "SomeUser",
                      },
                      contentOffsetSeconds: 12,
                      createdAt: "2026-01-01T00:00:00Z",
                      message: {
                        fragments: [
                          { text: "hello ", emote: null },
                          {
                            text: "Kappa",
                            emote: { emoteID: "25", from: 6 },
                          },
                        ],
                        userBadges: [
                          { setID: "subscriber", version: "12" },
                        ],
                        userColor: "#FF0000",
                      },
                    },
                  },
                ],
                pageInfo: { hasNextPage: false },
              },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET(context("http://localhost/api/twitch-vod-chat?video_id=123&offset=10"));
    expect(res.status).toBe(200);

    const payload = await res.json();
    expect(payload.comments).toHaveLength(1);
    expect(payload.comments[0]).toMatchObject({
      id: "comment-1",
      offsetSeconds: 12,
      author: "SomeUser",
      authorLogin: "someuser",
      color: "#FF0000",
      fragments: [
        { text: "hello ", emote: null },
        { text: "Kappa", emote: { id: "25", from: 6 } },
      ],
      badges: [{ name: "subscriber", version: "12" }],
    });
    expect(payload.cursor).toBe("cursor-1");
    expect(payload.hasNextPage).toBe(false);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://gql.twitch.tv/gql");
    expect(init.headers["Client-ID"]).toBe("kd1unb4b3q4t58fwlpcbzcbnm76a8fp");
    const body = JSON.parse(init.body);
    expect(body.variables).toEqual({
      videoID: "123",
      contentOffsetSeconds: 10,
    });
  });

  it("uses the cursor for pagination instead of an offset", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            video: {
              comments: { edges: [], pageInfo: { hasNextPage: false } },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await GET(
      context(
        "http://localhost/api/twitch-vod-chat?video_id=123&cursor=abc&offset=10",
      ),
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.variables).toEqual({ videoID: "123", cursor: "abc" });
  });

  it("rejects an invalid video id without calling Twitch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET(
      context("http://localhost/api/twitch-vod-chat?video_id=not-a-vod"),
    );

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
