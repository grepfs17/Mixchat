import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "os";
import path from "path";
import { randomBytes } from "crypto";
import { promises as fs } from "fs";

let baseDir: string;

vi.mock("../../../src/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(() => true),
}));

vi.mock("../../../src/server/songQueueConfig", () => ({
  getSongQueueStoreOptions: () => ({ baseDir }),
}));

const { authorizeChannel } = vi.hoisted(() => ({
  authorizeChannel: vi.fn(async (): Promise<string> => "ok"),
}));
vi.mock("../../../src/server/wheelAuth", () => ({
  authorizeChannel,
}));

vi.mock("../../../src/lib/songQueue/oembed", async () => {
  const actual =
    await vi.importActual<typeof import("../../../src/lib/songQueue/oembed")>(
      "../../../src/lib/songQueue/oembed",
    );
  return {
    ...actual,
    fetchVideoMeta: vi.fn(async (videoId: string) => ({
      videoId,
      title: "Song",
      channelTitle: "Artist",
      thumbnail: "https://example.com/t.jpg",
      durationSec: 60,
    })),
  };
});

import { POST as createSession } from "../../../src/pages/api/song-queue/index";
import { POST as appendItem } from "../../../src/pages/api/song-queue/[sessionId]/items";
import {
  GET as getSessionRoute,
  POST as closeRoute,
} from "../../../src/pages/api/song-queue/[sessionId]";
import { POST as playRoute } from "../../../src/pages/api/song-queue/[sessionId]/play";
import { POST as announceRoute } from "../../../src/pages/api/song-queue/[sessionId]/announce";

function ctx(
  request: Request,
  cookies: Record<string, string> = {},
  params: Record<string, string> = {},
): any {
  return {
    request,
    params,
    cookies: {
      get: (name: string) =>
        cookies[name] !== undefined ? { value: cookies[name] } : undefined,
    },
  };
}

function jsonReq(url: string, body: unknown, method = "POST"): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function createOpenQueue(): Promise<{
  sessionId: string;
  ownerToken: string;
}> {
  const res = await createSession(
    ctx(
      jsonReq("http://localhost/api/song-queue", {
        title: "Q",
        channelName: "alice",
        channelPlatform: "twitch",
      }),
    ),
  );
  expect(res.status).toBe(201);
  return (await res.json()) as { sessionId: string; ownerToken: string };
}

beforeEach(async () => {
  authorizeChannel.mockClear();
  authorizeChannel.mockResolvedValue("ok");
  baseDir = path.join(tmpdir(), `song-queue-mod-${randomBytes(6).toString("hex")}`);
});

afterEach(async () => {
  await fs.rm(baseDir, { recursive: true, force: true });
});

describe("song queue channel-trust access (streamer / Twitch moderator)", () => {
  it("rejects channel-bound creation when the channel claim is not verified", async () => {
    authorizeChannel.mockResolvedValue("forbidden");
    const res = await createSession(
      ctx(
        jsonReq("http://localhost/api/song-queue", {
          title: "Poisoned",
          channelName: "alice",
          channelPlatform: "twitch",
        }),
        { twitch_token: "not-alice" },
      ),
    );
    expect(res.status).toBe(403);
  });

  it("lets a channel-authorized caller read the queue without the owner token", async () => {
    const { sessionId } = await createOpenQueue();

    const res = await getSessionRoute(
      ctx(
        new Request(`http://localhost/api/song-queue/${sessionId}`),
        { twitch_token: "mod-token" },
        { sessionId },
      ),
    );
    expect(res.status).toBe(200);
    expect(authorizeChannel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ channelPlatform: "twitch" }),
      { allowModerators: true },
    );
  });

  it("returns 403 when the channel authorization fails", async () => {
    const { sessionId } = await createOpenQueue();
    authorizeChannel.mockResolvedValue("forbidden");

    const res = await getSessionRoute(
      ctx(
        new Request(`http://localhost/api/song-queue/${sessionId}`),
        { twitch_token: "nope" },
        { sessionId },
      ),
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when no provider credentials are present", async () => {
    const { sessionId } = await createOpenQueue();
    authorizeChannel.mockClear();
    authorizeChannel.mockResolvedValue("forbidden");

    const res = await getSessionRoute(
      ctx(
        new Request(`http://localhost/api/song-queue/${sessionId}`),
        {},
        { sessionId },
      ),
    );
    expect(res.status).toBe(401);
    expect(authorizeChannel).not.toHaveBeenCalled();
  });

  it("lets a channel-authorized caller append and play items", async () => {
    const { sessionId } = await createOpenQueue();

    const append = await appendItem(
      ctx(
        jsonReq(`http://localhost/api/song-queue/${sessionId}/items`, {
          videoId: "abc123",
          submitter: {
            userId: "u1",
            author: "Viewer",
            platform: "twitch",
          },
        }),
        { twitch_token: "mod-token" },
        { sessionId },
      ),
    );
    expect(append.status).toBe(201);

    const play = await playRoute(
      ctx(
        jsonReq(`http://localhost/api/song-queue/${sessionId}/play`, {
          currentIndex: 0,
        }),
        { twitch_token: "mod-token" },
        { sessionId },
      ),
    );
    expect(play.status).toBe(200);
    expect((await play.json()).currentIndex).toBe(0);
  });

  it("lets only one client claim the current announcement", async () => {
    const { sessionId } = await createOpenQueue();
    await appendItem(
      ctx(
        jsonReq(`http://localhost/api/song-queue/${sessionId}/items`, {
          videoId: "abc123",
          submitter: {
            userId: "u1",
            author: "Viewer",
            platform: "twitch",
          },
        }),
        { twitch_token: "mod-token" },
        { sessionId },
      ),
    );

    const claim = () =>
      announceRoute(
        ctx(
          new Request(
            `http://localhost/api/song-queue/${sessionId}/announce`,
            { method: "POST" },
          ),
          { twitch_token: "mod-token" },
          { sessionId },
        ),
      );

    const first = await claim();
    expect(first.status).toBe(200);
    expect((await first.json()).item.videoId).toBe("abc123");

    const second = await claim();
    expect(second.status).toBe(200);
    expect((await second.json()).item).toBeNull();
  });

  it("lets a channel-authorized caller close the queue", async () => {
    const { sessionId } = await createOpenQueue();

    const close = await closeRoute(
      ctx(
        new Request(`http://localhost/api/song-queue/${sessionId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-HTTP-Method-Override": "DELETE",
          },
          body: "{}",
        }),
        { twitch_token: "mod-token" },
        { sessionId },
      ),
    );
    expect(close.status).toBe(200);
    expect((await close.json()).ok).toBe(true);
  });

  it("still accepts the owner token", async () => {
    const { sessionId, ownerToken } = await createOpenQueue();
    authorizeChannel.mockClear();

    const res = await getSessionRoute(
      ctx(
        new Request(`http://localhost/api/song-queue/${sessionId}`, {
          headers: { Authorization: `Bearer ${ownerToken}` },
        }),
        {},
        { sessionId },
      ),
    );
    expect(res.status).toBe(200);
    expect(authorizeChannel).not.toHaveBeenCalled();
  });
});
