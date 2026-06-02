import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the youtube lib so getInnertube returns an Innertube-like client
// whose getChannel rejects (simulating a 403).
vi.mock("../../../src/lib/youtube", () => {
  return {
    getInnertube: vi.fn().mockResolvedValue({
      getChannel: vi
        .fn()
        .mockRejectedValue(
          new Error(
            "Request to https://www.youtube.com/... failed with status code 403",
          ),
        ),
    }),
  };
});

describe("YouTube proxy - getChannel failure", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.YT_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.YT_API_KEY;
  });

  it("returns null videoId when getChannel fails and no redirect is available", async () => {
    // Stub global fetch so the redirect fallback in findLiveForChannel
    // does not find a live video either (returns a generic page).
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        return {
          ok: true,
          url: "https://www.youtube.com/@testhandle/live",
          status: 200,
        } as any;
      }),
    );

    const { GET } = await import("../../../src/pages/api/youtube-proxy");

    const url = new URL(
      "http://localhost/?action=getLiveVideo&channelUrl=@testhandle",
    );
    const cookies = { get: () => undefined } as any;
    const request = {
      headers: new Headers({ "x-forwarded-for": "127.0.0.1" }),
    } as any;

    const res: Response = await GET({ request, url, cookies } as any);

    expect(res.status).toBe(200);
    const data = await res.json();
    // No live video found — channel is offline or getChannel failed
    expect(data.videoId).toBeNull();
  });
});
