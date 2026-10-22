import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("astro", () => ({
  APIRoute: {} as any,
}));

vi.mock("../../../src/lib/google", () => ({
  googleFetch: vi.fn(),
}));

vi.mock("../../../src/lib/youtubeLiveChat", () => ({
  resolveActiveLiveChatId: vi.fn(),
  invalidateLiveChatId: vi.fn(),
}));

vi.mock("../../../src/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(() => true),
}));

const { mockedAutomodTarget } = vi.hoisted(() => ({
  mockedAutomodTarget: vi.fn(),
}));

vi.mock("../../../src/pages/api/youtube-stream-chat", () => ({
  getAutomodTarget: mockedAutomodTarget,
}));

import { googleFetch } from "../../../src/lib/google";
import {
  resolveActiveLiveChatId,
  invalidateLiveChatId,
} from "../../../src/lib/youtubeLiveChat";
import { POST } from "../../../src/pages/api/youtube-moderation";

const mockedFetch = googleFetch as unknown as ReturnType<typeof vi.fn>;
const mockedResolve = resolveActiveLiveChatId as unknown as ReturnType<
  typeof vi.fn
>;
const mockedInvalidate = invalidateLiveChatId as unknown as ReturnType<
  typeof vi.fn
>;

function makeRequest(
  body: unknown,
  cookies: Record<string, string> = { youtube_token: "tok" },
) {
  return {
    request: new Request("http://localhost/api/youtube-moderation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    cookies: {
      get: (name: string) => {
        const v = cookies[name];
        return v ? { value: v } : undefined;
      },
    },
  } as any;
}

describe("POST /api/youtube-moderation", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedResolve.mockReset();
    mockedInvalidate.mockReset();
    mockedAutomodTarget.mockReset();
    (process.env as any).NODE_ENV = "test";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no auth cookie is present", async () => {
    const res = await POST(
      makeRequest({ action: "delete", videoId: "v1", messageId: "m1" }, {}),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for unknown action", async () => {
    const res = await POST(
      makeRequest({ action: "nope", videoId: "v1" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when delete is missing messageId", async () => {
    const res = await POST(
      makeRequest({ action: "delete", videoId: "v1" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when ban is missing channelId", async () => {
    const res = await POST(
      makeRequest({ action: "ban", videoId: "v1" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when timeout duration is out of range", async () => {
    const res = await POST(
      makeRequest({
        action: "timeout",
        videoId: "v1",
        channelId: "UC1",
        durationSeconds: 0,
      }),
    );
    expect(res.status).toBe(400);

    const res2 = await POST(
      makeRequest({
        action: "timeout",
        videoId: "v1",
        channelId: "UC1",
        durationSeconds: 999999,
      }),
    );
    expect(res2.status).toBe(400);
  });

  it("calls DELETE on the messages endpoint for delete action", async () => {
    mockedFetch.mockResolvedValueOnce({});
    const res = await POST(
      makeRequest({
        action: "delete",
        videoId: "v1",
        messageId: "m1",
      }),
    );
    expect(res.status).toBe(200);
    expect(mockedFetch).toHaveBeenCalledWith(
      expect.stringContaining(
        "liveChat/messages?id=m1",
      ),
      expect.objectContaining({ method: "DELETE" }),
      expect.anything(),
    );
  });

  it("calls POST on bans endpoint with permanent type for ban", async () => {
    mockedResolve.mockResolvedValueOnce("lc-1");
    mockedFetch.mockResolvedValueOnce({});
    const res = await POST(
      makeRequest({
        action: "ban",
        videoId: "v1",
        channelId: "UC1",
      }),
    );
    expect(res.status).toBe(200);
    const [, init] = mockedFetch.mock.calls[0];
    const body = JSON.parse((init as any).body);
    expect(body.snippet.type).toBe("permanent");
    expect(body.snippet.liveChatId).toBe("lc-1");
    expect(body.snippet.bannedUserDetails.channelId).toBe("UC1");
  });

  it("calls POST on bans endpoint with temporary type for timeout", async () => {
    mockedResolve.mockResolvedValueOnce("lc-1");
    mockedFetch.mockResolvedValueOnce({});
    const res = await POST(
      makeRequest({
        action: "timeout",
        videoId: "v1",
        channelId: "UC1",
        durationSeconds: 600,
      }),
    );
    expect(res.status).toBe(200);
    const [, init] = mockedFetch.mock.calls[0];
    const body = JSON.parse((init as any).body);
    expect(body.snippet.type).toBe("temporary");
    expect(body.snippet.banDurationSeconds).toBe(600);
  });

  it("returns 400 with friendly message when no liveChatId is resolved", async () => {
    mockedResolve.mockResolvedValueOnce(null);
    const res = await POST(
      makeRequest({
        action: "ban",
        videoId: "v1",
        channelId: "UC1",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("invalidates the liveChatId cache on 400/404 ban failure", async () => {
    mockedResolve.mockResolvedValueOnce("lc-1");
    mockedFetch.mockRejectedValueOnce(
      Object.assign(new Error("Google API error: invalidLiveChatId"), {
        status: 400,
        body: { error: { message: "invalidLiveChatId" } },
      }),
    );
    const res = await POST(
      makeRequest({
        action: "ban",
        videoId: "v1",
        channelId: "UC1",
      }),
    );
    expect(res.status).toBe(400);
    expect(mockedInvalidate).toHaveBeenCalledWith("v1");
  });

  it("maps 403 to a friendly permission error", async () => {
    mockedFetch.mockRejectedValueOnce(
      Object.assign(new Error("forbidden"), {
        status: 403,
        body: { error: { message: "forbidden" } },
      }),
    );
    const res = await POST(
      makeRequest({
        action: "delete",
        videoId: "v1",
        messageId: "m1",
      }),
    );
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toMatch(/no permission/i);
  });

  it("maps modificationNotAllowed to a friendly message", async () => {
    mockedFetch.mockRejectedValueOnce(
      Object.assign(new Error("forbidden"), {
        status: 403,
        body: { error: { message: "modificationNotAllowed" } },
      }),
    );
    const res = await POST(
      makeRequest({
        action: "delete",
        videoId: "v1",
        messageId: "m1",
      }),
    );
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toMatch(/can't remove a moderator or the owner/i);
  });

  it("returns 404 when the AutoMod hold is not in the viewer session", async () => {
    mockedAutomodTarget.mockReturnValueOnce(undefined);
    const res = await POST(
      makeRequest({
        action: "automod",
        videoId: "v1",
        messageId: "held-1",
        decision: "approve",
      }),
    );
    expect(res.status).toBe(404);
  });

  it("executes the AutoMod button on the viewer's session", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    mockedAutomodTarget.mockReturnValueOnce({
      item: {
        moderation_buttons: [
          { text: "Approve", endpoint: { command: "approve" } },
          { text: "Deny", endpoint: { command: "deny" } },
        ],
      },
      yt: { actions: { execute } },
    });

    const res = await POST(
      makeRequest({
        action: "automod",
        videoId: "v1",
        messageId: "held-1",
        decision: "deny",
      }),
    );

    expect(res.status).toBe(200);
    expect(execute).toHaveBeenCalledWith({ command: "deny" });
  });
});
