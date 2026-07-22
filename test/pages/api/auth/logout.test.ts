import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../src/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(() => true),
}));

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function runRoute(
    request: Request,
  ): Promise<Response> {
    const { POST } = await import("../../../../src/pages/api/auth/logout");
    const cookies = {
      delete: vi.fn(),
    } as any;
    return POST({ request, cookies } as any);
  }

  it("clears cookies for the requested platforms", async () => {
    const res = await runRoute(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platforms: ["youtube", "drive"] }),
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.cleared).toEqual([
      "youtube_token",
      "youtube_refresh_token",
      "drive_token",
      "drive_refresh_token",
    ]);
  });

  it("clears every platform when body is empty or missing", async () => {
    const res = await runRoute(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.cleared).toEqual([
      "youtube_token",
      "youtube_refresh_token",
      "drive_token",
      "drive_refresh_token",
      "twitch_token",
      "twitch_refresh_token",
    ]);
  });

  it("rejects unknown platforms with 400 and names the offender", async () => {
    const res = await runRoute(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platforms: ["spotify"] }),
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("spotify");
  });

  it("deletes each cookie with the original path of /", async () => {
    const cookies = {
      delete: vi.fn(),
    } as any;
    const { POST } = await import("../../../../src/pages/api/auth/logout");
    await POST({
      request: new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platforms: ["twitch"] }),
      }),
      cookies,
    } as any);

    expect(cookies.delete).toHaveBeenCalledWith("twitch_token", { path: "/" });
    expect(cookies.delete).toHaveBeenCalledWith("twitch_refresh_token", {
      path: "/",
    });
    // Must not delete cookies for unrelated platforms.
    expect(cookies.delete).not.toHaveBeenCalledWith(
      "youtube_token",
      expect.anything(),
    );
    expect(cookies.delete).not.toHaveBeenCalledWith(
      "drive_token",
      expect.anything(),
    );
  });

  it("treats an empty platforms array as a caller bug (400)", async () => {
    const res = await runRoute(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platforms: [] }),
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/at least one/i);
  });

  it("falls back to clear-all when body is not JSON", async () => {
    const res = await runRoute(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cleared).toContain("youtube_token");
    expect(body.cleared).toContain("drive_token");
    expect(body.cleared).toContain("twitch_token");
  });

  it("returns 429 + Retry-After when rate limit is exceeded", async () => {
    const { checkRateLimit } = await import("../../../../src/lib/rateLimit");
    vi.mocked(checkRateLimit).mockReturnValueOnce(false);

    const res = await runRoute(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platforms: ["twitch"] }),
      }),
    );

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
  });
});
