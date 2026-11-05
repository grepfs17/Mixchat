import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

const PROXY_A = "https://proxy-a.example";
const PROXY_B = "https://proxy-b.example";
const ACTION_URL =
  "https://www.youtube.com/youtubei/v1/live_chat/automod_action";
const BODY = JSON.stringify({ videoId: "abc123" });

async function loadYoutubeModule() {
  vi.resetModules();
  vi.stubEnv("YT_PROXY", `${PROXY_A},${PROXY_B}`);
  return await import("../../src/lib/youtube");
}

function forbiddenFetch() {
  const fetchMock = vi
    .fn()
    .mockImplementation(async () => new Response("{}", { status: 403 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubEnv("YT_PROXY_TOKEN", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("proxy 403 handling for moderation actions", () => {
  it("returns a moderation 403 without failing over or penalizing the proxy", async () => {
    const mod = await loadYoutubeModule();
    const fetchMock = forbiddenFetch();
    const wrapped = mod.createInnertubeFetch({
      allowGlobalInvalidation: false,
    });

    const res = await mod.runAsModerationAction(() =>
      wrapped(ACTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: BODY,
      }),
    );

    expect(res.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mod._getProxyState().failCounts).toEqual({});
    expect(mod._getProxyState().cooldownUntil).toEqual({});
  });

  it("still fails over and counts a 403 for non-moderation requests", async () => {
    const mod = await loadYoutubeModule();
    const fetchMock = forbiddenFetch();
    const wrapped = mod.createInnertubeFetch({
      allowGlobalInvalidation: false,
    });

    const res = await wrapped(ACTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: BODY,
    });

    expect(res.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const proxyCalls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(proxyCalls.some((u) => u.startsWith(PROXY_A))).toBe(true);
    expect(proxyCalls.some((u) => u.startsWith(PROXY_B))).toBe(true);
    expect(Object.values(mod._getProxyState().failCounts)).toContain(1);
  });
});
