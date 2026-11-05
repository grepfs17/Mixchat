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
