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

vi.mock("../../../src/lib/songQueue/oembed", async () => {
  const actual =
    await vi.importActual<typeof import("../../../src/lib/songQueue/oembed")>(
      "../../../src/lib/songQueue/oembed",
    );
  return {
    ...actual,
    fetchVideoMeta: vi.fn(),
  };
});

import { fetchVideoMeta } from "../../../src/lib/songQueue/oembed";
import { POST as createSession } from "../../../src/pages/api/song-queue/index";
import { POST as appendItem } from "../../../src/pages/api/song-queue/[sessionId]/items";
import { DELETE as closeSession } from "../../../src/pages/api/song-queue/[sessionId]";
import {
  GET as pastGet,
  POST as pastDelete,
  PATCH as pastPatch,
} from "../../../src/pages/api/song-queue/past/[sessionId]";
import { POST as bulkDelete } from "../../../src/pages/api/song-queue/past/delete";

const mockedFetchVideoMeta = fetchVideoMeta as unknown as ReturnType<typeof vi.fn>;

function makeRequest(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function authedRequest(
  url: string,
  body: unknown,
  ownerToken: string,
): Request {
  return makeRequest(url, body, { Authorization: `Bearer ${ownerToken}` });
}

function authedGetRequest(url: string, ownerToken: string): Request {
  return new Request(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
}

function makeContext(
  request: Request,
  params: Record<string, string> = {},
): any {
  return {
    request,
    params,
    cookies: {
      get: () => undefined,
    },
  };
}

async function createTestSession(isPublic = false): Promise<{
  sessionId: string;
  ownerToken: string;
}> {
  const res = await createSession(
    makeContext(
      makeRequest("http://localhost/api/song-queue", {
        title: "Test",
        isPublic,
        channelName: "streamer",
        channelPlatform: "twitch",
      }),
    ),
  );
  expect(res.status).toBe(201);
  return (await res.json()) as { sessionId: string; ownerToken: string };
}

async function closeAndEnd(
  sessionId: string,
  ownerToken: string,
): Promise<void> {
  const res = await closeSession(
    makeContext(
      authedRequest(
        `http://localhost/api/song-queue/${sessionId}`,
        {},
        ownerToken,
      ),
      { sessionId },
    ),
  );
  expect(res.status).toBe(200);
}

beforeEach(async () => {
  baseDir = path.join(
    tmpdir(),
    `mixchat-songqueue-past-${randomBytes(6).toString("hex")}`,
  );
  mockedFetchVideoMeta.mockReset();
  mockedFetchVideoMeta.mockResolvedValue({
    videoId: "dQw4w9WgXcQ",
    title: "Never Gonna Give You Up",
    channelTitle: "Rick Astley",
    thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  });
});

afterEach(async () => {
  try {
    await fs.rm(baseDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
  vi.clearAllMocks();
});

describe("GET /api/song-queue/past/:sessionId", () => {
  it("returns the public view for a matching ended session (using ownerToken)", async () => {
    const { sessionId, ownerToken } = await createTestSession(true);
    await appendItem(
      makeContext(
        authedRequest(
          `http://localhost/api/song-queue/${sessionId}/items`,
          {
            videoId: "dQw4w9WgXcQ",
            submitter: { userId: "u1", author: "Alice", platform: "twitch" },
          },
          ownerToken,
        ),
        { sessionId },
      ),
    );
    await closeAndEnd(sessionId, ownerToken);

    const res = await pastGet(
      makeContext(
        authedGetRequest(
          `http://localhost/api/song-queue/past/${sessionId}`,
          ownerToken,
        ),
        { sessionId },
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Test");
    expect(body.items).toHaveLength(1);
  });

  it("returns 401 when owner token is missing", async () => {
    const { sessionId, ownerToken } = await createTestSession(true);
    await closeAndEnd(sessionId, ownerToken);

    const res = await pastGet(
      makeContext(
        new Request(
          `http://localhost/api/song-queue/past/${sessionId}`,
        ),
        { sessionId },
      ),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when owner token does not match", async () => {
    const { sessionId, ownerToken } = await createTestSession(true);
    await closeAndEnd(sessionId, ownerToken);

    const res = await pastGet(
      makeContext(
        authedGetRequest(
          `http://localhost/api/song-queue/past/${sessionId}`,
          "wrong-token",
        ),
        { sessionId },
      ),
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/song-queue/past/:sessionId", () => {
  it("deletes the matching ended session using owner token", async () => {
    const { sessionId, ownerToken } = await createTestSession(true);
    await closeAndEnd(sessionId, ownerToken);

    const res = await pastDelete(
      makeContext(
        authedRequest(
          `http://localhost/api/song-queue/past/${sessionId}`,
          {},
          ownerToken,
        ),
        { sessionId },
      ),
    );
    expect(res.status).toBe(200);

    const getRes = await pastGet(
      makeContext(
        authedGetRequest(
          `http://localhost/api/song-queue/past/${sessionId}`,
          ownerToken,
        ),
        { sessionId },
      ),
    );
    expect(getRes.status).toBe(404);
  });

  it("returns 403 when owner token is wrong", async () => {
    const { sessionId, ownerToken } = await createTestSession(true);
    await closeAndEnd(sessionId, ownerToken);

    const res = await pastDelete(
      makeContext(
        authedRequest(
          `http://localhost/api/song-queue/past/${sessionId}`,
          {},
          "wrong-token",
        ),
        { sessionId },
      ),
    );
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/song-queue/past/:sessionId", () => {
  it("flips isPublic on the ended session using owner token", async () => {
    const { sessionId, ownerToken } = await createTestSession(true);
    await closeAndEnd(sessionId, ownerToken);

    const res = await pastPatch(
      makeContext(
        new Request(
          `http://localhost/api/song-queue/past/${sessionId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${ownerToken}`,
            },
            body: JSON.stringify({ isPublic: false }),
          },
        ),
        { sessionId },
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.session.ended).toBe(true);
  });

  it("returns 403 when owner token is wrong", async () => {
    const { sessionId, ownerToken } = await createTestSession(true);
    await closeAndEnd(sessionId, ownerToken);

    const res = await pastPatch(
      makeContext(
        new Request(
          `http://localhost/api/song-queue/past/${sessionId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer wrong-token",
            },
            body: JSON.stringify({ isPublic: false }),
          },
        ),
        { sessionId },
      ),
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/song-queue/past/delete", () => {
  it("deletes multiple matching ended sessions using per-session ownerTokens", async () => {
    const sessions: Array<{ sessionId: string; ownerToken: string }> = [];
    for (let i = 0; i < 3; i += 1) {
      const { sessionId, ownerToken } = await createTestSession(true);
      await closeAndEnd(sessionId, ownerToken);
      sessions.push({ sessionId, ownerToken });
    }

    const res = await bulkDelete(
      makeContext(
        new Request("http://localhost/api/song-queue/past/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessions }),
        }),
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.deleted).toBe(3);
    expect(body.missing).toBe(0);

    for (const { sessionId, ownerToken } of sessions) {
      const getRes = await pastGet(
        makeContext(
          authedGetRequest(
            `http://localhost/api/song-queue/past/${sessionId}`,
            ownerToken,
          ),
          { sessionId },
        ),
      );
      expect(getRes.status).toBe(404);
    }
  });

  it("returns 400 when sessions is empty", async () => {
    const res = await bulkDelete(
      makeContext(
        new Request("http://localhost/api/song-queue/past/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessions: [] }),
        }),
      ),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when sessions array is missing", async () => {
    const res = await bulkDelete(
      makeContext(
        new Request("http://localhost/api/song-queue/past/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
      ),
    );
    expect(res.status).toBe(400);
  });
});
