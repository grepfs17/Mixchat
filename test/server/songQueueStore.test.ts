import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import {
  createSession,
  gcSessions,
  getSession,
  makeItem,
  mutateSession,
  newItemId,
  publicView,
  readPublic,
  readSessionWithToken,
} from "../../src/server/songQueueStore";
import type { SongQueueSubmitter } from "../../src/lib/songQueue/types";

let baseDir: string;

beforeEach(async () => {
  baseDir = path.join(
    tmpdir(),
    `mixchat-songqueue-test-${randomBytes(6).toString("hex")}`,
  );
});

function makeSubmitter(overrides: Partial<SongQueueSubmitter> = {}): SongQueueSubmitter {
  return {
    userId: "u1",
    author: "Alice",
    authorAvatar: "https://example.com/a.png",
    platform: "twitch",
    ...overrides,
  };
}

describe("createSession", () => {
  it("creates a session file and returns a 24-char sessionId and an owner token", async () => {
    const { sessionId, ownerToken } = await createSession({ baseDir });
    expect(sessionId).toHaveLength(24);
    expect(ownerToken).toHaveLength(64);
    const filePath = path.join(baseDir, `${sessionId}.json`);
    await expect(fs.access(filePath)).resolves.toBeUndefined();
  });

  it("persists the provided title and isPublic flag", async () => {
    const { sessionId } = await createSession({ baseDir }, {
      title: "Friday Night Mix",
      isPublic: true,
    });
    const session = await getSession({ baseDir }, sessionId);
    expect(session?.title).toBe("Friday Night Mix");
    expect(session?.isPublic).toBe(true);
  });

  it("trims the title and defaults isPublic to false", async () => {
    const { sessionId } = await createSession(
      { baseDir },
      { title: "  hello  " },
    );
    const session = await getSession({ baseDir }, sessionId);
    expect(session?.title).toBe("hello");
    expect(session?.isPublic).toBe(false);
  });
});

describe("mutateSession", () => {
  it("rejects the wrong token", async () => {
    const { sessionId } = await createSession({ baseDir });
    const res = await mutateSession(
      { baseDir },
      sessionId,
      "wrong-token",
      (s) => ({ session: s, result: null }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("auth");
  });

  it("rejects unknown sessionId", async () => {
    const res = await mutateSession(
      { baseDir },
      "nonexistent-session",
      "irrelevant",
      (s) => ({ session: s, result: null }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("missing");
  });

  it("runs the mutator and persists the new session", async () => {
    const { sessionId, ownerToken } = await createSession({ baseDir });
    const item = makeItem({
      id: newItemId(),
      videoId: "dQw4w9WgXcQ",
      title: "Never Gonna Give You Up",
      channelTitle: "Rick Astley",
      thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
      submitter: makeSubmitter(),
      submittedAt: new Date().toISOString(),
    });
    const res = await mutateSession(
      { baseDir },
      sessionId,
      ownerToken,
      (s) => ({ session: { ...s, items: [...s.items, item] }, result: item }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.session.items).toHaveLength(1);
      expect(res.session.version).toBe(1);
    }
    const reread = await getSession({ baseDir }, sessionId);
    expect(reread?.items).toHaveLength(1);
    expect(reread?.version).toBe(1);
  });

  it("rejects mutations on ended sessions", async () => {
    const { sessionId, ownerToken } = await createSession({ baseDir });
    await mutateSession(
      { baseDir },
      sessionId,
      ownerToken,
      (s) => ({ session: { ...s, ended: true }, result: undefined }),
    );
    const res = await mutateSession(
      { baseDir },
      sessionId,
      ownerToken,
      (s) => ({ session: s, result: null }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("ended");
  });

  it("bumps version on every mutation", async () => {
    const { sessionId, ownerToken } = await createSession({ baseDir });
    for (let i = 0; i < 3; i++) {
      await mutateSession(
        { baseDir },
        sessionId,
        ownerToken,
        (s) => ({ session: s, result: null }),
      );
    }
    const session = await getSession({ baseDir }, sessionId);
    expect(session?.version).toBe(3);
  });
});

describe("publicView / readPublic", () => {
  it("omits userId and only returns public-safe fields", async () => {
    const { sessionId, ownerToken } = await createSession(
      { baseDir },
      { title: "My Queue", isPublic: true },
    );
    await mutateSession(
      { baseDir },
      sessionId,
      ownerToken,
      (s) => ({
        session: {
          ...s,
          items: [
            makeItem({
              id: newItemId(),
              videoId: "dQw4w9WgXcQ",
              title: "Never Gonna Give You Up",
              channelTitle: "Rick Astley",
              thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
              submitter: makeSubmitter(),
              submittedAt: new Date().toISOString(),
            }),
          ],
        },
        result: undefined,
      }),
    );
    const view = await readPublic({ baseDir }, sessionId);
    expect(view).not.toBeNull();
    expect(view?.title).toBe("My Queue");
    expect(view?.items).toHaveLength(1);
    expect(view?.items[0].submitter).toEqual({ author: "Alice", platform: "twitch" });
    // The shape of SongQueueSubmitter in the public view excludes userId.
    expect(Object.keys(view!.items[0].submitter).sort()).toEqual(["author", "platform"]);
    expect(view?.version).toBe(1);
  });

  it("returns null for non-public sessions", async () => {
    const { sessionId } = await createSession({ baseDir }, { isPublic: false });
    const view = await readPublic({ baseDir }, sessionId);
    expect(view).toBeNull();
  });

  it("returns null for unknown sessionId", async () => {
    const view = await readPublic({ baseDir }, "missing");
    expect(view).toBeNull();
  });
});

describe("readSessionWithToken", () => {
  it("returns ok for a correct token", async () => {
    const { sessionId, ownerToken } = await createSession({ baseDir });
    const res = await readSessionWithToken({ baseDir }, sessionId, ownerToken);
    expect(res.kind).toBe("ok");
  });

  it("returns missing for the wrong token (so the public cannot probe)", async () => {
    const { sessionId } = await createSession({ baseDir });
    const res = await readSessionWithToken({ baseDir }, sessionId, "wrong");
    expect(res.kind).toBe("missing");
  });

  it("returns ended once the session is closed", async () => {
    const { sessionId, ownerToken } = await createSession({ baseDir });
    await mutateSession(
      { baseDir },
      sessionId,
      ownerToken,
      (s) => ({ session: { ...s, ended: true }, result: undefined }),
    );
    const res = await readSessionWithToken({ baseDir }, sessionId, ownerToken);
    expect(res.kind).toBe("ended");
  });
});

describe("gcSessions", () => {
  it("removes sessions whose lastSeenAt is older than the cutoff", async () => {
    const { sessionId, ownerToken } = await createSession({ baseDir });
    // Force lastSeenAt to be old by mutating after setting createdAt far in the past.
    await mutateSession(
      { baseDir },
      sessionId,
      ownerToken,
      (s) => ({
        session: {
          ...s,
          createdAt: "2020-01-01T00:00:00.000Z",
          lastSeenAt: "2020-01-01T00:00:00.000Z",
        },
        result: undefined,
      }),
    );
    const removed = await gcSessions({ baseDir }, 30, new Date("2026-06-01T00:00:00Z"));
    expect(removed).toBe(1);
    const session = await getSession({ baseDir }, sessionId);
    expect(session).toBeNull();
  });

  it("keeps recently-active sessions", async () => {
    const { sessionId } = await createSession({ baseDir });
    const removed = await gcSessions({ baseDir }, 30, new Date());
    expect(removed).toBe(0);
    const session = await getSession({ baseDir }, sessionId);
    expect(session).not.toBeNull();
  });

  it("returns 0 when the base directory does not exist", async () => {
    const removed = await gcSessions(
      { baseDir: path.join(baseDir, "nope") },
      30,
    );
    expect(removed).toBe(0);
  });
});

describe("publicView (pure projection)", () => {
  it("exposes ended flag, currentIndex, and createdAt", () => {
    const view = publicView({
      sessionId: "s",
      title: "t",
      channelName: "alice",
      channelPlatform: "twitch",
      ownerTokenHash: "h",
      createdAt: "2026-03-12T14:07:00.000Z",
      lastSeenAt: "l",
      isPublic: true,
      currentIndex: 3,
      version: 7,
      ended: true,
      items: [],
    });
    expect(view).toEqual({
      title: "t",
      channelName: "alice",
      channelPlatform: "twitch",
      currentIndex: 3,
      version: 7,
      ended: true,
      createdAt: "2026-03-12T14:07:00.000Z",
      items: [],
    });
  });

  it("forwards per-item submittedAt and durationSec", () => {
    const view = publicView({
      sessionId: "s",
      title: "t",
      channelName: "",
      channelPlatform: "",
      ownerTokenHash: "h",
      createdAt: "2026-03-12T14:07:00.000Z",
      lastSeenAt: "l",
      isPublic: true,
      currentIndex: 0,
      version: 1,
      ended: false,
      items: [
        {
          id: "i1",
          videoId: "dQw4w9WgXcQ",
          title: "Title",
          channelTitle: "Channel",
          thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
          durationSec: 213,
          submitter: {
            userId: "u1",
            author: "Alice",
            platform: "twitch",
          },
          submittedAt: "2026-03-12T14:10:00.000Z",
          status: "pending",
        },
      ],
    });
    expect(view.items[0].submittedAt).toBe("2026-03-12T14:10:00.000Z");
    expect(view.items[0].durationSec).toBe(213);
    expect(view.items[0].submitter).toEqual({ author: "Alice", platform: "twitch" });
    // Sensitive fields must not leak
    expect((view.items[0] as Record<string, unknown>).userId).toBeUndefined();
  });
});
