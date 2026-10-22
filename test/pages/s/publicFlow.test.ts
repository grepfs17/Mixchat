import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "os";
import path from "path";
import { randomBytes } from "crypto";
import { promises as fs } from "fs";
import { createSession } from "../../../src/server/songQueueStore";
import {
  getPublicSongQueue,
} from "../../../src/lib/songQueue/api";

let baseDir: string;

vi.mock("../../../src/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(() => true),
}));

vi.mock("../../../src/lib/songQueue/oembed", () => ({
  fetchVideoMeta: vi.fn().mockResolvedValue({
    videoId: "dQw4w9WgXcQ",
    title: "Never Gonna Give You Up",
    channelTitle: "Rick Astley",
    thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  }),
}));

vi.mock("../../../src/server/songQueueConfig", () => ({
  getSongQueueStoreOptions: () => ({ baseDir }),
}));

beforeEach(async () => {
  baseDir = path.join(
    tmpdir(),
    `mixchat-songqueue-public-${randomBytes(6).toString("hex")}`,
  );
  // global fetch is available in node 20+ but the api helpers use the
  // global. We mock it here for isolation from the network.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      // Map our public endpoint to the local store. The id is the last
      // segment of /api/song-queue/<id>/public.
      const m = url.match(/\/api\/song-queue\/([^/]+)\/public/);
      const sessionId = m?.[1] || "";
      const opts = { baseDir };
      const { readPublic, getSession } = await import(
        "../../../src/server/songQueueStore"
      );
      const view = await readPublic(opts, sessionId);
      if (view) {
        return new Response(JSON.stringify(view), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      const session = await getSession(opts, sessionId);
      if (!session) {
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (session.ended) {
        return new Response(JSON.stringify({ error: "Session ended" }), {
          status: 410,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Not public" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});

afterEach(async () => {
  vi.unstubAllGlobals();
  try {
    await fs.rm(baseDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe("public page data flow (via /api/song-queue/:id/public)", () => {
  it("returns the public view for a public, open session", async () => {
    const created = await createSession({ baseDir }, { title: "My Mix", isPublic: true });
    const view = await getPublicSongQueue(created.sessionId);
    expect(view.title).toBe("My Mix");
    expect(view.ended).toBe(false);
    expect(view.items).toEqual([]);
    expect(typeof view.version).toBe("number");
  });

  it("returns a 410 after the session is closed (and the page reloads)", async () => {
    const created = await createSession({ baseDir }, { isPublic: true });
    // We can't call closeSongQueue from the api helper because it hits
    // the API endpoint, not the store. We call the store directly to
    // simulate the streamer closing the queue.
    const { mutateSession } = await import("../../../src/server/songQueueStore");
    await mutateSession({ baseDir }, created.sessionId, created.ownerToken, (s) => ({
      session: { ...s, ended: true, isPublic: false },
      result: undefined,
    }));

    await expect(getPublicSongQueue(created.sessionId)).rejects.toMatchObject({
      status: 410,
    });
  });
});
