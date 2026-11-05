import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "os";
import path from "path";
import { randomBytes } from "crypto";
import { promises as fs } from "fs";

let baseDir: string;

vi.mock("../../../src/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(() => true),
}));

vi.mock("../../../src/server/wheelConfig", () => ({
  getWheelStoreOptions: () => ({ baseDir }),
}));

vi.mock("../../../src/server/wheelAuth", () => ({
  authorizeChannel: vi.fn(
    async (
      cookies: { get: (n: string) => { value: string } | undefined },
      channel: { channelName: string; channelPlatform: string },
    ) => {
      const cookieName =
        channel.channelPlatform === "twitch" ? "twitch_token" : "youtube_token";
      if (!cookies.get(cookieName)?.value) return "unauthenticated";
      return channel.channelName === "alice" &&
        channel.channelPlatform === "twitch"
        ? "ok"
        : "forbidden";
    },
  ),
}));

import {
  GET as listWheels,
  POST as createWheel,
} from "../../../src/pages/api/wheel/index";
import {
  DELETE as deleteWheelRoute,
  GET as getWheelRoute,
  PATCH as patchWheelRoute,
  POST as postWheelRoute,
} from "../../../src/pages/api/wheel/[wheelId]";

function makeContext(
  request: Request,
  params: Record<string, string> = {},
  cookieValues: Record<string, string> = { twitch_token: "test" },
): any {
  return {
    request,
    params,
    cookies: {
      get: (name: string) =>
        cookieValues[name] !== undefined
          ? { value: cookieValues[name] }
          : undefined,
    },
  };
}

function jsonRequest(
  method: string,
  url: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(async () => {
  baseDir = path.join(
    tmpdir(),
    `mixchat-wheel-api-${randomBytes(6).toString("hex")}`,
  );
});

afterEach(async () => {
  try {
    await fs.rm(baseDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe("wheel API", () => {
  it("creates, lists, reads, updates, shares and deletes a wheel", async () => {
    const createRes = await createWheel(
      makeContext(
        jsonRequest("POST", "http://localhost/api/wheel", {
          channelKey: "twitch:alice",
          name: "Stream Picks",
          options: ["One", "Two"],
        }),
      ),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      id: string;
      ownerToken: string;
      wheel: { name: string; options: string[]; isPublic: boolean };
    };
    expect(created.wheel.options).toEqual(["One", "Two"]);
    expect(created.wheel.isPublic).toBe(false);

    const listRes = await listWheels(
      makeContext(
        new Request("http://localhost/api/wheel?channelKey=twitch:alice"),
      ),
    );
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as { wheels: Array<{ id: string }> };
    expect(list.wheels.map((w) => w.id)).toContain(created.id);

    // Private wheels are hidden from anonymous readers.
    const anonGet = await getWheelRoute(
      makeContext(
        new Request(`http://localhost/api/wheel/${created.id}`),
        { wheelId: created.id },
      ),
    );
    expect(anonGet.status).toBe(404);

    // ...but readable via channel trust (the manager flow).
    const channelGet = await getWheelRoute(
      makeContext(
        new Request(
          `http://localhost/api/wheel/${created.id}?channelKey=twitch:alice`,
        ),
        { wheelId: created.id },
      ),
    );
    expect(channelGet.status).toBe(200);

    const wrongChannelGet = await getWheelRoute(
      makeContext(
        new Request(
          `http://localhost/api/wheel/${created.id}?channelKey=twitch:bob`,
        ),
        { wheelId: created.id },
      ),
    );
    expect(wrongChannelGet.status).toBe(404);

    // Owner read works with the bearer token.
    const ownerGet = await getWheelRoute(
      makeContext(
        new Request(`http://localhost/api/wheel/${created.id}`, {
          headers: { Authorization: `Bearer ${created.ownerToken}` },
        }),
        { wheelId: created.id },
      ),
    );
    expect(ownerGet.status).toBe(200);

    // Update + publish via channel trust.
    const patchRes = await patchWheelRoute(
      makeContext(
        jsonRequest(
          "PATCH",
          `http://localhost/api/wheel/${created.id}?channelKey=twitch:alice`,
          { isPublic: true, name: "Renamed", options: ["A", "B", "C"] },
        ),
        { wheelId: created.id },
      ),
    );
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()) as {
      wheel: { name: string; options: string[]; isPublic: boolean; version: number };
    };
    expect(patched.wheel.name).toBe("Renamed");
    expect(patched.wheel.options).toEqual(["A", "B", "C"]);
    expect(patched.wheel.isPublic).toBe(true);
    expect(patched.wheel.version).toBe(1);

    // Public read now succeeds for anyone.
    const publicGet = await getWheelRoute(
      makeContext(
        new Request(`http://localhost/api/wheel/${created.id}`),
        { wheelId: created.id },
      ),
    );
    expect(publicGet.status).toBe(200);

    // Delete via POST method-override (Astro blocks the DELETE verb).
    const deleteRes = await postWheelRoute(
      makeContext(
        new Request(
          `http://localhost/api/wheel/${created.id}?channelKey=twitch:alice`,
          {
            method: "POST",
            headers: { "X-HTTP-Method-Override": "DELETE" },
          },
        ),
        { wheelId: created.id },
      ),
    );
    expect(deleteRes.status).toBe(200);

    const afterDelete = await getWheelRoute(
      makeContext(
        new Request(`http://localhost/api/wheel/${created.id}`),
        { wheelId: created.id },
      ),
    );
    expect(afterDelete.status).toBe(404);
  });

  it("rejects PATCH/DELETE without credentials or matching channel", async () => {
    const createRes = await createWheel(
      makeContext(
        jsonRequest("POST", "http://localhost/api/wheel", {
          channelKey: "twitch:alice",
          name: "W",
        }),
      ),
    );
    const created = (await createRes.json()) as { id: string };

    const noCreds = await patchWheelRoute(
      makeContext(
        jsonRequest("PATCH", `http://localhost/api/wheel/${created.id}`, {
          name: "x",
        }),
        { wheelId: created.id },
      ),
    );
    expect(noCreds.status).toBe(401);

    const wrongChannel = await patchWheelRoute(
      makeContext(
        jsonRequest(
          "PATCH",
          `http://localhost/api/wheel/${created.id}?channelKey=twitch:bob`,
          { name: "x" },
        ),
        { wheelId: created.id },
      ),
    );
    expect(wrongChannel.status).toBe(403);

    const deleteNoOverride = await postWheelRoute(
      makeContext(
        jsonRequest(
          "POST",
          `http://localhost/api/wheel/${created.id}?channelKey=twitch:alice`,
          {},
        ),
        { wheelId: created.id },
      ),
    );
    expect(deleteNoOverride.status).toBe(400);
  });

  it("rejects an invalid create body", async () => {
    const res = await createWheel(
      makeContext(jsonRequest("POST", "http://localhost/api/wheel", {})),
    );
    expect(res.status).toBe(400);
  });

  it("requires a verified identity for channel-trusted access", async () => {
    const listRes = await listWheels(
      makeContext(
        new Request("http://localhost/api/wheel?channelKey=twitch:alice"),
        {},
        {}, // no auth cookies
      ),
    );
    expect(listRes.status).toBe(401);

    const createRes = await createWheel(
      makeContext(
        jsonRequest("POST", "http://localhost/api/wheel", {
          channelKey: "twitch:alice",
          name: "Nope",
        }),
        {},
        {},
      ),
    );
    expect(createRes.status).toBe(401);
  });

  it("exposes DELETE for direct callers", async () => {
    const createRes = await createWheel(
      makeContext(
        jsonRequest("POST", "http://localhost/api/wheel", {
          channelKey: "twitch:alice",
          name: "W",
        }),
      ),
    );
    const created = (await createRes.json()) as {
      id: string;
      ownerToken: string;
    };
    const res = await deleteWheelRoute(
      makeContext(
        new Request(`http://localhost/api/wheel/${created.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${created.ownerToken}` },
        }),
        { wheelId: created.id },
      ),
    );
    expect(res.status).toBe(200);
  });
  describe("winner history", () => {
    async function createHistoryWheel(): Promise<string> {
      const res = await createWheel(
        makeContext(
          jsonRequest("POST", "http://localhost/api/wheel", {
            channelKey: "twitch:alice",
            name: "History wheel",
            options: ["A", "B"],
          }),
        ),
      );
      expect(res.status).toBe(201);
      return ((await res.json()) as { id: string }).id;
    }

    async function patch(id: string, body: unknown): Promise<Response> {
      return await patchWheelRoute(
        makeContext(
          jsonRequest(
            "PATCH",
            `http://localhost/api/wheel/${id}?channelKey=twitch:alice`,
            body,
          ),
          { wheelId: id },
        ),
      );
    }

    async function readHistory(id: string): Promise<unknown> {
      const res = await getWheelRoute(
        makeContext(
          new Request(
            `http://localhost/api/wheel/${id}?channelKey=twitch:alice`,
          ),
          { wheelId: id },
        ),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        wheel: { history?: unknown };
      };
      return body.wheel.history;
    }

    it("keeps winners newest-first and clears them", async () => {
      const id = await createHistoryWheel();

      const first = await patch(id, {
        addHistory: { name: "Red", time: "10:00:00 01/01" },
      });
      expect(first.status).toBe(200);
      await patch(id, { addHistory: { name: "Blue", time: "10:01:00 01/01" } });

      expect(await readHistory(id)).toEqual([
        { name: "Blue", time: "10:01:00 01/01" },
        { name: "Red", time: "10:00:00 01/01" },
      ]);

      const cleared = await patch(id, { clearHistory: true });
      expect(cleared.status).toBe(200);
      expect(await readHistory(id)).toEqual([]);
    });

    it("rejects a malformed winner entry", async () => {
      const id = await createHistoryWheel();
      const res = await patch(id, { addHistory: { name: "   " } });
      expect(res.status).toBe(400);
      expect(await readHistory(id)).toEqual([]);
    });
  });
});
