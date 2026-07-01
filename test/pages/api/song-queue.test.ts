import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "os";
import path from "path";
import { randomBytes } from "crypto";
import { promises as fs } from "fs";

let baseDir: string;

vi.mock("../../../src/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(() => true),
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

vi.mock("../../../src/server/songQueueConfig", () => ({
  getSongQueueStoreOptions: () => ({ baseDir }),
}));

import { fetchVideoMeta, VideoValidationError } from "../../../src/lib/songQueue/oembed";
import { POST as createSession } from "../../../src/pages/api/song-queue/index";
import { GET as ownerGet, DELETE as closeSession } from "../../../src/pages/api/song-queue/[sessionId]";
import { POST as appendItem } from "../../../src/pages/api/song-queue/[sessionId]/items";
import { PATCH as updateItem, DELETE as deleteItem } from "../../../src/pages/api/song-queue/[sessionId]/items/[itemId]";
import { POST as playItem } from "../../../src/pages/api/song-queue/[sessionId]/play";
import { GET as publicGet } from "../../../src/pages/api/song-queue/[sessionId]/public";

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

function ownerGetRequest(url: string, ownerToken: string): Request {
  return new Request(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
}

function authedDelete(url: string, ownerToken: string): Request {
  return new Request(url, {
    method: "DELETE",
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

interface Bootstrap {
  sessionId: string;
  ownerToken: string;
}

async function createTestSession(isPublic = false): Promise<Bootstrap> {
  const res = await createSession(
    makeContext(
      makeRequest("http://localhost/api/song-queue", {
        title: "Test",
        isPublic,
      }),
    ),
  );
  expect(res.status).toBe(201);
  return (await res.json()) as Bootstrap;
}

beforeEach(async () => {
  baseDir = path.join(
    tmpdir(),
    `mixchat-songqueue-api-${randomBytes(6).toString("hex")}`,
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

describe("POST /api/song-queue", () => {
  it("creates a session and returns the owner token once", async () => {
    const res = await createSession(
      makeContext(
        makeRequest("http://localhost/api/song-queue", { title: "  hello  " }),
      ),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.sessionId).toHaveLength(24);
    expect(body.ownerToken).toHaveLength(64);
    expect(body.title).toBe("hello");
    expect(body.isPublic).toBe(false);
    expect(body.publicUrl).toBe(`/s/${body.sessionId}`);
  });

  it("rejects an invalid body", async () => {
    const res = await createSession(
      makeContext(makeRequest("http://localhost/api/song-queue", { title: 123 })),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/song-queue/:sessionId (owner)", () => {
  it("returns the session for the right token", async () => {
    const { sessionId, ownerToken } = await createTestSession();
    const res = await ownerGet(makeContext(ownerGetRequest(`http://localhost/api/song-queue/${sessionId}`, ownerToken), { sessionId }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessionId).toBe(sessionId);
  });

  it("returns 401 when the token is missing", async () => {
    const { sessionId } = await createTestSession();
    const res = await ownerGet(
      makeContext(
        new Request(`http://localhost/api/song-queue/${sessionId}`),
        { sessionId },
      ),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when the session does not exist", async () => {
    const res = await ownerGet(
      makeContext(
        ownerGetRequest("http://localhost/api/song-queue/missing", "any-token"),
        { sessionId: "missing" },
      ),
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/song-queue/:sessionId/items", () => {
  it("appends an item after validating via oembed", async () => {
    const { sessionId, ownerToken } = await createTestSession();
    const res = await appendItem(
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
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.videoId).toBe("dQw4w9WgXcQ");
    expect(body.title).toBe("Never Gonna Give You Up");
    expect(body.status).toBe("pending");
    expect(mockedFetchVideoMeta).toHaveBeenCalledWith("dQw4w9WgXcQ");
  });

  it("rejects an invalid video (oembed 401)", async () => {
    const { sessionId, ownerToken } = await createTestSession();
    mockedFetchVideoMeta.mockRejectedValueOnce(
      new VideoValidationError("unembeddable", "nope"),
    );
    const res = await appendItem(
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
    expect(res.status).toBe(400);
  });

  it("refuses when the queue is full", async () => {
    const { sessionId, ownerToken } = await createTestSession();
    // First item succeeds
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
    mockedFetchVideoMeta.mockResolvedValueOnce({
      videoId: "AAAAAAAAAAA",
      title: "x",
      channelTitle: "x",
      thumbnail: "https://i.ytimg.com/vi/AAAAAAAAAAA/hqdefault.jpg",
    });
    const res = await appendItem(
      makeContext(
        authedRequest(
          `http://localhost/api/song-queue/${sessionId}/items`,
          {
            videoId: "AAAAAAAAAAA",
            submitter: { userId: "u1", author: "Alice", platform: "twitch" },
            maxQueueLength: 1,
          },
          ownerToken,
        ),
        { sessionId },
      ),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/queue is full/i);
  });

  it("refuses duplicate (submitter, videoId) entries", async () => {
    const { sessionId, ownerToken } = await createTestSession();
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
    const res = await appendItem(
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
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already in queue/i);
  });
});

describe("PATCH /api/song-queue/:sessionId/items/:itemId", () => {
  async function withItem() {
    const boot = await createTestSession();
    const appended = await appendItem(
      makeContext(
        authedRequest(
          `http://localhost/api/song-queue/${boot.sessionId}/items`,
          {
            videoId: "dQw4w9WgXcQ",
            submitter: { userId: "u1", author: "Alice", platform: "twitch" },
          },
          boot.ownerToken,
        ),
        { sessionId: boot.sessionId },
      ),
    );
    return { ...boot, item: (await appended.json()) as { id: string } };
  }

  it("updates the status", async () => {
    const { sessionId, ownerToken, item } = await withItem();
    const res = await updateItem(
      makeContext(
        authedRequest(
          `http://localhost/api/song-queue/${sessionId}/items/${item.id}`,
          { status: "skipped" },
          ownerToken,
        ),
        { sessionId, itemId: item.id },
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.item.status).toBe("skipped");
  });

  it("returns 404 for an unknown item", async () => {
    const { sessionId, ownerToken } = await withItem();
    const res = await updateItem(
      makeContext(
        authedRequest(
          `http://localhost/api/song-queue/${sessionId}/items/does-not-exist`,
          { status: "skipped" },
          ownerToken,
        ),
        { sessionId, itemId: "does-not-exist" },
      ),
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/song-queue/:sessionId/items/:itemId", () => {
  it("removes the item", async () => {
    const { sessionId, ownerToken } = await createTestSession();
    const appended = await appendItem(
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
    const item = (await appended.json()) as { id: string };
    const res = await deleteItem(
      makeContext(
        authedDelete(
          `http://localhost/api/song-queue/${sessionId}/items/${item.id}`,
          ownerToken,
        ),
        { sessionId, itemId: item.id },
      ),
    );
    expect(res.status).toBe(200);
  });
});

describe("POST /api/song-queue/:sessionId/play", () => {
  it("updates the currentIndex and bumps version", async () => {
    const { sessionId, ownerToken } = await createTestSession();
    const res = await playItem(
      makeContext(
        authedRequest(
          `http://localhost/api/song-queue/${sessionId}/play`,
          { currentIndex: 0 },
          ownerToken,
        ),
        { sessionId },
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.currentIndex).toBe(0);
  });
});

describe("DELETE /api/song-queue/:sessionId (close)", () => {
  it("marks the session ended and refuses further mutations", async () => {
    const { sessionId, ownerToken } = await createTestSession();
    const res = await closeSession(
      makeContext(
        authedDelete(`http://localhost/api/song-queue/${sessionId}`, ownerToken),
        { sessionId },
      ),
    );
    expect(res.status).toBe(200);

    const appendRes = await appendItem(
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
    expect(appendRes.status).toBe(410);
  });
});

describe("GET /api/song-queue/:sessionId/public", () => {
  it("returns the public view for a public session", async () => {
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
    const res = await publicGet(
      makeContext(
        new Request(`http://localhost/api/song-queue/${sessionId}/public`),
        { sessionId },
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Test");
    expect(body.items).toHaveLength(1);
    expect(body.items[0].submitter).toEqual({ author: "Alice", platform: "twitch" });
    expect(body.version).toBeGreaterThan(0);
  });

  it("returns 403 for a private session", async () => {
    const { sessionId } = await createTestSession(false);
    const res = await publicGet(
      makeContext(
        new Request(`http://localhost/api/song-queue/${sessionId}/public`),
        { sessionId },
      ),
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown session", async () => {
    const res = await publicGet(
      makeContext(
        new Request("http://localhost/api/song-queue/missing/public"),
        { sessionId: "missing" },
      ),
    );
    expect(res.status).toBe(404);
  });

  it("returns 410 after the session is closed", async () => {
    const { sessionId, ownerToken } = await createTestSession(true);
    await closeSession(
      makeContext(
        authedDelete(`http://localhost/api/song-queue/${sessionId}`, ownerToken),
        { sessionId },
      ),
    );
    const res = await publicGet(
      makeContext(
        new Request(`http://localhost/api/song-queue/${sessionId}/public`),
        { sessionId },
      ),
    );
    expect(res.status).toBe(410);
  });
});
