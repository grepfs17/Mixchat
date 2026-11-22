import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../../src/pages/api/twitch-vod-info";

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

describe("GET /api/twitch-vod-info", () => {
  it("returns the VOD title and category changes", async () => {
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const payload = body.query
        ? {
            data: {
              video: {
                id: "123",
                title: "A VOD title",
                game: {
                  id: "509658",
                  name: "Just Chatting",
                  displayName: "Just Chatting",
                },
              },
            },
          }
        : {
            data: {
              video: {
                id: "123",
                moments: {
                  edges: [
                    {
                      node: {
                        type: "GAME_CHANGE",
                        positionMilliseconds: 0,
                        details: {
                          game: {
                            id: "509658",
                            displayName: "Just Chatting",
                          },
                        },
                      },
                    },
                    {
                      node: {
                        type: "GAME_CHANGE",
                        positionMilliseconds: 90000,
                        details: {
                          game: {
                            id: "32982",
                            displayName: "Grand Theft Auto V",
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          };
      return Promise.resolve(
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET(
      context("http://localhost/api/twitch-vod-info?video_id=123"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: "123",
      title: "A VOD title",
      gameId: "509658",
      gameName: "Just Chatting",
      gameChanges: [
        { offsetSeconds: 0, gameId: "509658", gameName: "Just Chatting" },
        {
          offsetSeconds: 90,
          gameId: "32982",
          gameName: "Grand Theft Auto V",
        },
      ],
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://gql.twitch.tv/gql");
    const body = JSON.parse(String(init.body));
    expect(body.variables).toEqual({ id: "123" });
    expect(body.query).toContain("MixchatVodInfo");
  });

  it("returns 404 when Twitch has no video", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { video: null } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const res = await GET(
      context("http://localhost/api/twitch-vod-info?video_id=456"),
    );
    expect(res.status).toBe(404);
  });

  it("rejects an invalid video id without calling Twitch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET(
      context("http://localhost/api/twitch-vod-info?video_id=not-a-vod"),
    );

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
