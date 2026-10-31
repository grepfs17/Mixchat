import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createInnertubeFetch,
  isAuthenticatedChatRequest,
  type YouTubeAuthTokens,
} from "../../src/lib/youtube";

const auth: YouTubeAuthTokens = {
  accessToken: "viewer-token",
  expiresAt: Date.now() + 3600_000,
};

function captureFetch() {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isAuthenticatedChatRequest", () => {
  it("matches live chat and metadata endpoints", () => {
    expect(
      isAuthenticatedChatRequest(
        "https://www.youtube.com/youtubei/v1/live_chat/get_live_chat",
      ),
    ).toBe(true);
    expect(
      isAuthenticatedChatRequest(
        "https://www.youtube.com/youtubei/v1/updated_metadata",
      ),
    ).toBe(true);
  });

  it("does not match player or next", () => {
    expect(
      isAuthenticatedChatRequest("https://www.youtube.com/youtubei/v1/player"),
    ).toBe(false);
    expect(
      isAuthenticatedChatRequest("https://www.youtube.com/youtubei/v1/next"),
    ).toBe(false);
  });
});

describe("createInnertubeFetch", () => {
  it("attaches the viewer token only to live chat requests", async () => {
    const fetchMock = captureFetch();
    const wrapped = createInnertubeFetch({
      auth,
      allowGlobalInvalidation: false,
      baseUserAgent: "test-agent",
    });

    await wrapped("https://www.youtube.com/youtubei/v1/player", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId: "abc" }),
    });

    await wrapped("https://www.youtube.com/youtubei/v1/live_chat/get_live_chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer stale",
      },
      body: JSON.stringify({}),
    });

    const playerHeaders = fetchMock.mock.calls[0][1].headers as Record<
      string,
      string
    >;
    expect(playerHeaders.authorization).toBeUndefined();

    const chatHeaders = fetchMock.mock.calls[1][1].headers as Record<
      string,
      string
    >;
    expect(chatHeaders.authorization).toBe("Bearer viewer-token");
  });
});
