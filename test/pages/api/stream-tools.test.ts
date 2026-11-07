import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "os";
import path from "path";
import { randomBytes } from "crypto";
import { promises as fs } from "fs";

let baseDir: string;

vi.mock("../../../src/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(() => true),
}));

const { access } = vi.hoisted(() => ({
  access: { result: "ok" as string },
}));

vi.mock("../../../src/server/wheelAuth", () => ({
  authorizeChannel: vi.fn(async () => access.result),
}));

import {
  GET as settingsGet,
  PUT as settingsPut,
} from "../../../src/pages/api/stream-tools/settings";
import {
  GET as giveawayGet,
  POST as giveawayPost,
} from "../../../src/pages/api/stream-tools/giveaway";
import {
  GET as musicGet,
  PUT as musicPut,
} from "../../../src/pages/api/stream-tools/music";

function makeContext(request: Request): any {
  return {
    request,
    params: {},
    cookies: {
      get: () => ({ value: "cookie" }),
    },
  };
}

function jsonResponse(url: string, body?: unknown, method = "GET"): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(async () => {
  access.result = "ok";
  baseDir = path.join(tmpdir(), `stream-tools-api-${randomBytes(6).toString("hex")}`);
  vi.stubEnv("MIXCHAT_STREAM_TOOLS_DIR", baseDir);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(baseDir, { recursive: true, force: true });
});

describe("GET/PUT /api/stream-tools/settings", () => {
  it("returns defaults before any write", async () => {
    const res = await settingsGet(
      makeContext(
        jsonResponse(
          "http://localhost/api/stream-tools/settings?channelKey=twitch:alice",
        ),
      ),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: true, allowMods: false });
  });

  it("stores and returns updates", async () => {
    const put = await settingsPut(
      makeContext(
        jsonResponse(
          "http://localhost/api/stream-tools/settings",
          { channelKey: "twitch:alice", allowMods: true },
          "PUT",
        ),
      ),
    );
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ enabled: true, allowMods: true });

    const get = await settingsGet(
      makeContext(
        jsonResponse(
          "http://localhost/api/stream-tools/settings?channelKey=twitch:alice",
        ),
      ),
    );
    expect(await get.json()).toEqual({ enabled: true, allowMods: true });
  });

  it("rejects writes from non-owners", async () => {
    access.result = "forbidden";
    const put = await settingsPut(
      makeContext(
        jsonResponse(
          "http://localhost/api/stream-tools/settings",
          { channelKey: "twitch:alice", allowMods: true },
          "PUT",
        ),
      ),
    );
    expect(put.status).toBe(403);
  });

  it("requires a channel", async () => {
    const put = await settingsPut(
      makeContext(jsonResponse("http://localhost/api/stream-tools/settings", {}, "PUT")),
    );
    expect(put.status).toBe(400);
  });
});

describe("/api/stream-tools/music", () => {
  const channel = "twitch:alice";

  function musicState(overrides: Record<string, unknown> = {}) {
    return {
      playlists: [
        {
          id: "p1",
          name: "P",
          items: [
            {
              id: "t1",
              videoId: "v1",
              title: "title",
              channelTitle: "channel",
              thumbnail: "thumb",
              durationSec: 60,
            },
          ],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          categoryId: null,
          categoryName: "",
        },
      ],
      settings: {
        activePlaylistId: "p1",
        currentIndex: 0,
        volume: 100,
        loop: true,
        miniBarHidden: false,
      },
      isPlaying: false,
      ...overrides,
    };
  }

  it("truncates oversized track fields and drops unknown properties", async () => {
    const put = await musicPut(
      makeContext(
        jsonResponse(
          "http://localhost/api/stream-tools/music",
          {
            channelKey: channel,
            version: 0,
            music: musicState({
              playlists: [
                {
                  id: "p".repeat(200),
                  name: "P",
                  items: [
                    {
                      id: "t1",
                      videoId: "v1",
                      title: "x".repeat(300),
                      channelTitle: "y".repeat(300),
                      thumbnail: "z".repeat(600),
                      durationSec: 1e9,
                      evil: "extra",
                    },
                  ],
                  createdAt: "2026-01-01T00:00:00.000Z",
                  updatedAt: "2026-01-01T00:00:00.000Z",
                  categoryId: null,
                  categoryName: "",
                },
              ],
            }),
          },
          "PUT",
        ),
      ),
    );
    expect(put.status).toBe(200);

    const get = await musicGet(
      makeContext(
        jsonResponse(
          `http://localhost/api/stream-tools/music?channelKey=${channel}`,
        ),
      ),
    );
    const body = await get.json();
    const playlist = body.music.playlists[0];
    const item = playlist.items[0];
    expect(playlist.id).toHaveLength(64);
    expect(item.title).toHaveLength(200);
    expect(item.channelTitle).toHaveLength(200);
    expect(item.thumbnail).toHaveLength(500);
    expect(item.durationSec).toBe(24 * 60 * 60);
    expect(item.evil).toBeUndefined();
  });

  it("accepts only one of two concurrent writes with the same version", async () => {
    const body = {
      channelKey: channel,
      version: 0,
      music: musicState(),
    };
    const [first, second] = await Promise.all([
      musicPut(
        makeContext(
          jsonResponse("http://localhost/api/stream-tools/music", body, "PUT"),
        ),
      ),
      musicPut(
        makeContext(
          jsonResponse("http://localhost/api/stream-tools/music", body, "PUT"),
        ),
      ),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
  });
});

describe("/api/stream-tools/giveaway", () => {
  const channel = "twitch:alice";

  it("starts a giveaway and returns it", async () => {
    const res = await giveawayPost(
      makeContext(
        jsonResponse(
          "http://localhost/api/stream-tools/giveaway",
          {
            channelKey: channel,
            action: "start",
            keyword: "join",
            duration: 0,
            scope: "both",
            eligibility: "everyone",
          },
          "POST",
        ),
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.giveaway.phase).toBe("running");
    expect(body.giveaway.keyword).toBe("join");
    expect(body.version).toBeGreaterThan(0);
  });

  it("rejects an invalid keyword", async () => {
    const res = await giveawayPost(
      makeContext(
        jsonResponse(
          "http://localhost/api/stream-tools/giveaway",
          {
            channelKey: channel,
            action: "start",
            keyword: "",
            duration: 0,
            scope: "both",
            eligibility: "everyone",
          },
          "POST",
        ),
      ),
    );
    expect(res.status).toBe(400);
  });

  it("dedupes ingested entries by user", async () => {
    await giveawayPost(
      makeContext(
        jsonResponse(
          "http://localhost/api/stream-tools/giveaway",
          {
            channelKey: channel,
            action: "start",
            keyword: "join",
            duration: 0,
            scope: "both",
            eligibility: "everyone",
          },
          "POST",
        ),
      ),
    );
    const entry = { platform: "twitch", userId: "u1", author: "Alice" };
    await giveawayPost(
      makeContext(
        jsonResponse(
          "http://localhost/api/stream-tools/giveaway",
          { channelKey: channel, action: "ingest", entry },
          "POST",
        ),
      ),
    );
    await giveawayPost(
      makeContext(
        jsonResponse(
          "http://localhost/api/stream-tools/giveaway",
          { channelKey: channel, action: "ingest", entry },
          "POST",
        ),
      ),
    );
    const res = await giveawayGet(
      makeContext(
        jsonResponse(
          `http://localhost/api/stream-tools/giveaway?channelKey=${channel}`,
        ),
      ),
    );
    const body = await res.json();
    expect(body.giveaway.entries).toHaveLength(1);
  });

  it("rejects oversized entry fields", async () => {
    await giveawayPost(
      makeContext(
        jsonResponse(
          "http://localhost/api/stream-tools/giveaway",
          {
            channelKey: channel,
            action: "start",
            keyword: "join",
            duration: 0,
            scope: "both",
            eligibility: "everyone",
          },
          "POST",
        ),
      ),
    );
    const res = await giveawayPost(
      makeContext(
        jsonResponse(
          "http://localhost/api/stream-tools/giveaway",
          {
            channelKey: channel,
            action: "ingest",
            entry: {
              platform: "twitch",
              userId: "u1",
              author: "A".repeat(200),
            },
          },
          "POST",
        ),
      ),
    );
    expect(res.status).toBe(400);
  });

  it("reconstructs entries without unknown properties", async () => {
    await giveawayPost(
      makeContext(
        jsonResponse(
          "http://localhost/api/stream-tools/giveaway",
          {
            channelKey: channel,
            action: "start",
            keyword: "join",
            duration: 0,
            scope: "both",
            eligibility: "everyone",
          },
          "POST",
        ),
      ),
    );
    await giveawayPost(
      makeContext(
        jsonResponse(
          "http://localhost/api/stream-tools/giveaway",
          {
            channelKey: channel,
            action: "ingest",
            entry: {
              platform: "twitch",
              userId: "  u1  ",
              author: "  Alice  ",
              evil: "extra",
            },
          },
          "POST",
        ),
      ),
    );
    const get = await giveawayGet(
      makeContext(
        jsonResponse(
          `http://localhost/api/stream-tools/giveaway?channelKey=${channel}`,
        ),
      ),
    );
    const body = await get.json();
    expect(body.giveaway.entries).toEqual([
      { platform: "twitch", userId: "u1", author: "Alice" },
    ]);
  });

  it("reveals a winner and refuses a second announcement claim", async () => {
    await giveawayPost(
      makeContext(
        jsonResponse(
          "http://localhost/api/stream-tools/giveaway",
          {
            channelKey: channel,
            action: "start",
            keyword: "join",
            duration: 0,
            scope: "both",
            eligibility: "everyone",
          },
          "POST",
        ),
      ),
    );
    await giveawayPost(
      makeContext(
        jsonResponse(
          "http://localhost/api/stream-tools/giveaway",
          {
            channelKey: channel,
            action: "ingest",
            entry: { platform: "twitch", userId: "u1", author: "Alice" },
          },
          "POST",
        ),
      ),
    );
    const reveal = await giveawayPost(
      makeContext(
        jsonResponse(
          "http://localhost/api/stream-tools/giveaway",
          { channelKey: channel, action: "reveal" },
          "POST",
        ),
      ),
    );
    const revealBody = await reveal.json();
    expect(revealBody.giveaway.phase).toBe("revealed");
    expect(revealBody.giveaway.winner.userId).toBe("u1");

    const claim1 = await giveawayPost(
      makeContext(
        jsonResponse(
          "http://localhost/api/stream-tools/giveaway",
          { channelKey: channel, action: "claimAnnounce" },
          "POST",
        ),
      ),
    );
    const claim1Body = await claim1.json();
    expect(claim1Body.claimedWinner.userId).toBe("u1");

    const claim2 = await giveawayPost(
      makeContext(
        jsonResponse(
          "http://localhost/api/stream-tools/giveaway",
          { channelKey: channel, action: "claimAnnounce" },
          "POST",
        ),
      ),
    );
    const claim2Body = await claim2.json();
    expect(claim2Body.claimedWinner).toBeNull();
  });

  it("shares revealed winners through history and clears them for everyone", async () => {
    await giveawayPost(
      makeContext(
        jsonResponse(
          "http://localhost/api/stream-tools/giveaway",
          {
            channelKey: channel,
            action: "start",
            keyword: "join",
            duration: 0,
            scope: "both",
            eligibility: "everyone",
          },
          "POST",
        ),
      ),
    );
    await giveawayPost(
      makeContext(
        jsonResponse(
          "http://localhost/api/stream-tools/giveaway",
          {
            channelKey: channel,
            action: "ingest",
            entry: { platform: "twitch", userId: "u1", author: "Alice" },
          },
          "POST",
        ),
      ),
    );
    const reveal = await giveawayPost(
      makeContext(
        jsonResponse(
          "http://localhost/api/stream-tools/giveaway",
          { channelKey: channel, action: "reveal" },
          "POST",
        ),
      ),
    );
    const revealBody = await reveal.json();
    expect(revealBody.history).toHaveLength(1);
    expect(revealBody.history[0].winner.userId).toBe("u1");
    expect(revealBody.history[0].keyword).toBe("join");
    expect(revealBody.history[0].entryCount).toBe(1);

    // Revealing again must not append a duplicate entry.
    const repeat = await giveawayPost(
      makeContext(
        jsonResponse(
          "http://localhost/api/stream-tools/giveaway",
          { channelKey: channel, action: "reveal" },
          "POST",
        ),
      ),
    );
    expect((await repeat.json()).history).toHaveLength(1);

    // Any authorized client reads the same history through GET.
    const beforeClear = await giveawayGet(
      makeContext(
        jsonResponse(
          `http://localhost/api/stream-tools/giveaway?channelKey=${channel}`,
        ),
      ),
    );
    expect((await beforeClear.json()).history).toHaveLength(1);

    const clear = await giveawayPost(
      makeContext(
        jsonResponse(
          "http://localhost/api/stream-tools/giveaway",
          { channelKey: channel, action: "clearHistory" },
          "POST",
        ),
      ),
    );
    expect((await clear.json()).history).toEqual([]);

    const afterClear = await giveawayGet(
      makeContext(
        jsonResponse(
          `http://localhost/api/stream-tools/giveaway?channelKey=${channel}`,
        ),
      ),
    );
    expect((await afterClear.json()).history).toEqual([]);
  });

  it("refuses writes when authorization fails", async () => {
    access.result = "forbidden";
    const res = await giveawayPost(
      makeContext(
        jsonResponse(
          "http://localhost/api/stream-tools/giveaway",
          {
            channelKey: channel,
            action: "reveal",
          },
          "POST",
        ),
      ),
    );
    expect(res.status).toBe(403);
  });
});
