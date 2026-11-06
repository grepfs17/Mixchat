import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("astro", () => ({
  APIRoute: {} as any,
}));

const POLL_ROUTE =
  "../../../../src/pages/api/auth/google/desktop/poll";
const HANDOFF = "../../../../src/server/googleHandoff";

async function loadPoll() {
  vi.resetModules();
  vi.stubEnv("PUBLIC_APP_PLATFORM", "desktop");
  return (await import(POLL_ROUTE)).POST;
}

async function loadStore() {
  return import(HANDOFF);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/auth/google/desktop/poll", () => {
  it("404 outside desktop builds", async () => {
    vi.unstubAllEnvs();
    vi.resetModules();
    const { POST } = await import(POLL_ROUTE);
    const request = new Request(
      "http://localhost/api/auth/google/desktop/poll",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
    );
    const res = await POST({ request, cookies: { set: vi.fn() } } as any);
    expect(res.status).toBe(404);
  });

  it("400 when handoffId is missing", async () => {
    const POST = await loadPoll();
    const request = new Request(
      "http://localhost/api/auth/google/desktop/poll",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
    );
    const res = await POST({ request, cookies: { set: vi.fn() } } as any);
    expect(res.status).toBe(400);
  });

  it("stays pending while the callback has not completed", async () => {
    const POST = await loadPoll();
    const { createHandoff } = await loadStore();
    const { id } = createHandoff("youtube");
    const request = new Request(
      "http://localhost/api/auth/google/desktop/poll",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handoffId: id }),
      },
    );
    const set = vi.fn();
    const res = await POST({ request, cookies: { set } } as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "pending" });
    expect(set).not.toHaveBeenCalled();
  });

  it("500 without setting auth cookies when the session is missing", async () => {
    const POST = await loadPoll();
    const { createHandoff, completeHandoff } = await loadStore();
    const { id } = createHandoff("youtube");
    completeHandoff(id, {
      flow: "youtube",
      accessToken: "access-token",
      expiresIn: 3600,
    });

    const request = new Request(
      "http://localhost/api/auth/google/desktop/poll",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handoffId: id }),
      },
    );
    const set = vi.fn();
    const res = await POST({ request, cookies: { set } } as any);
    expect(res.status).toBe(500);
    expect(set).not.toHaveBeenCalled();
  });

  it("sets the auth cookies once the callback stored a session", async () => {
    const POST = await loadPoll();
    const { createHandoff, completeHandoff } = await loadStore();
    const { id } = createHandoff("youtube");
    completeHandoff(id, {
      flow: "youtube",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 3600,
      session: {
        platform: "youtube",
        userId: "u1",
        displayName: "Alice",
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresAt: Date.now() + 3_600_000,
        timestamp: Date.now(),
      },
    });

    const request = new Request(
      "http://localhost/api/auth/google/desktop/poll",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handoffId: id }),
      },
    );
    const set = vi.fn();
    const res = await POST({ request, cookies: { set } } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("complete");
    expect(body.session.userId).toBe("u1");

    const cookieNames = set.mock.calls.map((call) => call[0]);
    expect(cookieNames).toEqual([
      "youtube_token",
      "youtube_refresh_token",
    ]);
    expect(set.mock.calls[0][1]).toBe("access-token");
    expect(set.mock.calls[0][2]).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  });

  it("consumes the handoff so a second poll gets expired", async () => {
    const POST = await loadPoll();
    const { createHandoff, completeHandoff } = await loadStore();
    const { id } = createHandoff("youtube");
    completeHandoff(id, {
      flow: "youtube",
      accessToken: "access-token",
      expiresIn: 3600,
      session: {
        platform: "youtube",
        userId: "u1",
        displayName: "Alice",
        accessToken: "access-token",
        expiresAt: Date.now() + 3_600_000,
        timestamp: Date.now(),
      },
    });

    const body = JSON.stringify({ handoffId: id });
    const make = () =>
      new Request("http://localhost/api/auth/google/desktop/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
    const cookies = { set: vi.fn() } as any;

    const first = await POST({ request: make(), cookies });
    expect(first.status).toBe(200);
    const second = await POST({ request: make(), cookies });
    expect(await second.json()).toEqual({ status: "expired" });
  });
});
