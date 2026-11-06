import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("astro", () => ({
  APIRoute: {} as any,
}));

const MODULE = "../../../src/pages/desktop/twitch-activate";

/**
 * IS_DESKTOP is read from import.meta.env when the module is first evaluated,
 * so reset the registry after stubbing the env.
 */
async function loadRoute() {
  vi.resetModules();
  return (await import(MODULE)).GET;
}

async function runRoute(query: string) {
  vi.stubEnv("PUBLIC_APP_PLATFORM", "desktop");
  const GET = await loadRoute();
  const requestUrl = `http://localhost/desktop/twitch-activate${query}`;
  return GET({
    url: new URL(requestUrl),
    request: new Request(requestUrl),
  } as any);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /desktop/twitch-activate", () => {
  it("redirects to the Twitch activation page", async () => {
    const res = await runRoute(
      `?url=${encodeURIComponent("https://www.twitch.tv/activate")}`,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(
      "https://www.twitch.tv/activate",
    );
  });

  it("400 when the url parameter is missing", async () => {
    const res = await runRoute("");
    expect(res.status).toBe(400);
  });

  it("403 for a non-Twitch host", async () => {
    const res = await runRoute(
      `?url=${encodeURIComponent("https://example.com/phish")}`,
    );
    expect(res.status).toBe(403);
  });

  it("403 for a host that only ends in twitch.tv", async () => {
    const res = await runRoute(
      `?url=${encodeURIComponent("https://twitch.tv.evil.com/activate")}`,
    );
    expect(res.status).toBe(403);
  });

  it("403 for a look-alike host", async () => {
    const res = await runRoute(
      `?url=${encodeURIComponent("https://eviltwitch.tv/activate")}`,
    );
    expect(res.status).toBe(403);
  });

  it("403 for insecure http", async () => {
    const res = await runRoute(
      `?url=${encodeURIComponent("http://www.twitch.tv/activate")}`,
    );
    expect(res.status).toBe(403);
  });

  it("404 outside desktop builds", async () => {
    const GET = await loadRoute();
    const requestUrl =
      "http://localhost/desktop/twitch-activate?url=https%3A%2F%2Fwww.twitch.tv%2Factivate";
    const res = await GET({
      url: new URL(requestUrl),
      request: new Request(requestUrl),
    } as any);
    expect(res.status).toBe(404);
  });
});
