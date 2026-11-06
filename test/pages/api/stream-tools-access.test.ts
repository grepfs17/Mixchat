import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(() => true),
}));

const { authorizeChannel } = vi.hoisted(() => ({
  authorizeChannel: vi.fn(),
}));

vi.mock("../../../src/server/wheelAuth", () => ({
  authorizeChannel,
}));

import { GET } from "../../../src/pages/api/stream-tools/access";

const CHANNEL_KEY = "twitch:alice";

function ctx(search = `?channelKey=${encodeURIComponent(CHANNEL_KEY)}`): any {
  return {
    request: new Request(`http://localhost/api/stream-tools/access${search}`),
    params: {},
    cookies: { get: () => ({ value: "cookie" }) },
  };
}

function setAuth(results: ("ok" | "forbidden" | "unauthenticated")[]): void {
  authorizeChannel.mockReset();
  authorizeChannel.mockImplementation(async () => results.shift() ?? "forbidden");
}

beforeEach(() => {
  setAuth([]);
});

describe("GET /api/stream-tools/access", () => {
  it("reports the broadcaster as owner", async () => {
    setAuth(["ok"]);
    const res = await GET(ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ role: "owner" });
    // Owner is decided before moderator access is even considered.
    expect(authorizeChannel).toHaveBeenCalledTimes(1);
  });

  it("reports an approved moderator", async () => {
    setAuth(["forbidden", "ok"]);
    const res = await GET(ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ role: "moderator" });
    expect(authorizeChannel).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ channelName: "alice" }),
      { allowModerators: true },
    );
  });

  it("reports a signed-in stranger as none", async () => {
    setAuth(["forbidden", "forbidden"]);
    const res = await GET(ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ role: "none" });
  });

  it("rejects unauthenticated callers", async () => {
    setAuth(["unauthenticated"]);
    const res = await GET(ctx());
    expect(res.status).toBe(401);
  });

  it("requires a channel", async () => {
    const res = await GET(ctx("?channelKey=nope"));
    expect(res.status).toBe(400);
  });
});
