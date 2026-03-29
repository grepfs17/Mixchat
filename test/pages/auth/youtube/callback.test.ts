import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock the youtube lib before importing the handler
vi.mock("../../../../src/lib/youtube", () => {
  return {
    getYoutubeAccessToken: vi.fn().mockResolvedValue({
      access_token: "access123",
      refresh_token: "refresh123",
      expires_in: 3600,
      token_type: "Bearer",
    }),
    getYoutubeUser: vi.fn().mockResolvedValue({
      userId: "user123",
      displayName: "Test User",
      profileImageUrl: "http://example.com/img.png",
    }),
  };
});

describe("YouTube callback route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets cookies and returns session HTML", async () => {
    const { GET } = await import("../../../../src/pages/auth/youtube/callback");

    const cookies = { set: vi.fn() } as any;
    const url = new URL("http://localhost/?code=abc123&state=test_state");

    const res: Response = await GET({ url, cookies } as any);

    expect(res).toBeDefined();
    expect((res as any).status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/html");

    const body = await res.text();
    expect(body).toContain("mixchat_sessions");
    expect(body).toContain("user123");
    expect(body).toContain("access123");

    expect(cookies.set).toHaveBeenCalled();
    expect(cookies.set).toHaveBeenCalledWith(
      "youtube_token",
      "access123",
      expect.any(Object),
    );

    expect(cookies.set).toHaveBeenCalledWith(
      "youtube_refresh_token",
      "refresh123",
      expect.any(Object),
    );
  });
});
