import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../../src/pages/api/twitch-vod-chat-download";

function context(url: string): Parameters<typeof GET>[0] {
  return {
    url: new URL(url),
    request: new Request(url, {
      headers: { "x-forwarded-for": "127.0.0.1" },
    }),
  } as Parameters<typeof GET>[0];
}

function commentResponse() {
  return {
    data: {
      video: {
        comments: {
          edges: [
            {
              cursor: "cursor-1",
              node: {
                id: "message-1",
                commenter: {
                  id: "user-1",
                  login: "someuser",
                  displayName: "SomeUser",
                },
                contentOffsetSeconds: 75,
                createdAt: "2026-01-01T00:01:15Z",
                message: {
                  fragments: [
                    { text: "<b>hi</b> ", emote: null },
                    {
                      text: "Kappa",
                      emote: { emoteID: "25", from: 9 },
                    },
                  ],
                  userBadges: [],
                  userColor: "#FF0000",
                },
              },
            },
          ],
          pageInfo: { hasNextPage: false },
        },
      },
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("GET /api/twitch-vod-chat-download", () => {
  it("streams the full chat as JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(commentResponse()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const res = await GET(
      context(
        "http://localhost/api/twitch-vod-chat-download?video_id=123&format=json&title=My%20VOD&channel=somechannel",
      ),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.headers.get("Content-Disposition")).toContain(
      "vod-123-chat.json",
    );

    const payload = JSON.parse(await res.text());
    expect(payload.video).toMatchObject({
      id: "123",
      title: "My VOD",
      channel: "somechannel",
    });
    expect(payload.comments).toHaveLength(1);
    expect(payload.comments[0]).toMatchObject({
      id: "message-1",
      offsetSeconds: 75,
      author: "SomeUser",
      content: "<b>hi</b> Kappa",
    });
  });

  it("streams escaped HTML with emote images", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(commentResponse()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const res = await GET(
      context(
        "http://localhost/api/twitch-vod-chat-download?video_id=124&format=html&title=%3Cscript%3Ex%3C%2Fscript%3E",
      ),
    );

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;b&gt;hi&lt;/b&gt;");
    expect(html).toContain(
      "https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0",
    );
    expect(html).toContain(
      'href="https://www.twitch.tv/videos/124?t=1m15s"',
    );
  });

  it("rejects an invalid video id without calling Twitch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET(
      context(
        "http://localhost/api/twitch-vod-chat-download?video_id=nope&format=json",
      ),
    );

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
