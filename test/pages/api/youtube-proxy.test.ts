import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the youtube lib before importing the handler so GET will receive the
// mocked Innertube instance.
vi.mock("../../../src/lib/youtube", () => {
  return {
    getInnertube: vi.fn().mockResolvedValue({
      getChannel: vi.fn().mockRejectedValue(new Error('Request to https://www.youtube.com/... failed with status code 403')),
    }),
  };
});

describe("YouTube proxy - Data API fallback", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.YT_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.YT_API_KEY;
  });

  it("falls back to Data API when getChannel fails and YT_API_KEY is set", async () => {
    process.env.YT_API_KEY = "TESTKEY";

    // Stub global fetch to return mocked Data API responses.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: any) => {
        const url = String(input);
        if (url.includes("youtube/v3/search?part=snippet&q=")) {
          return {
            ok: true,
            // Use a valid-looking channel ID matching /^UC[\w-]{22}$/ so the
            // fallback will query the live search endpoint.
            json: async () => ({ items: [{ id: { channelId: "UCAAAAAAAAAAAAAAAAAAAAAA" } }] }),
          } as any;
        }
        if (url.includes("eventType=live")) {
          return {
            ok: true,
            json: async () => ({ items: [{ id: { videoId: "LIVEVID123" } }] }),
          } as any;
        }
        return { ok: false, status: 404, text: async () => "not found" } as any;
      }),
    );

    const { GET } = await import("../../../src/pages/api/youtube-proxy");

    const url = new URL("http://localhost/?action=getLiveVideo&channelUrl=@testhandle");
    const cookies = { get: () => undefined } as any;

    const res: Response = await GET({ url, cookies, clientAddress: "127.0.0.1" } as any);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.videoId).toBe("LIVEVID123");
    expect(data.channelId).toBe("UCAAAAAAAAAAAAAAAAAAAAAA");
  });
});
