import { vi, describe, it, expect, beforeEach } from "vitest";

const mockGetYoutubeAccessToken = vi.fn();
const mockGetYoutubeUser = vi.fn();

vi.mock("../../../../src/lib/youtube", () => ({
  getYoutubeAccessToken: mockGetYoutubeAccessToken,
  getYoutubeUser: mockGetYoutubeUser,
}));

describe("YouTube callback route", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    mockGetYoutubeAccessToken.mockResolvedValue({
      access_token: "access123",
      refresh_token: "refresh123",
      expires_in: 3600,
      token_type: "Bearer",
    });
    mockGetYoutubeUser.mockResolvedValue({
      userId: "user123",
      displayName: "Test User",
      profileImageUrl: "http://example.com/img.png",
    });
  });

  it("sets cookies and returns session HTML", async () => {
    const { GET } = await import("../../../../src/pages/auth/youtube/callback");

    const cookies = {
      set: vi.fn(),
      get: vi.fn().mockReturnValue({ value: "test_state" }),
      delete: vi.fn(),
    } as any;
    const url = new URL("http://localhost/?code=abc123&state=test_state");
    const locals = { nonce: "test_nonce" };

    const res: Response = await GET({ url, cookies, locals } as any);

    expect(res).toBeDefined();
    expect((res as any).status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/html");

    const body = await res.text();
    expect(body).toContain("mixchat_sessions:v1");
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

  it("returns 400 with friendly message when user has no YouTube channel", async () => {
    const noChannelError = new Error("No YouTube channel found for this user");
    noChannelError.name = "NoChannelError";
    mockGetYoutubeUser.mockRejectedValueOnce(noChannelError);

    const { GET } = await import("../../../../src/pages/auth/youtube/callback");

    const cookies = {
      set: vi.fn(),
      get: vi.fn().mockReturnValue({ value: "test_state" }),
      delete: vi.fn(),
    } as any;
    const url = new URL("http://localhost/?code=abc123&state=test_state");
    const locals = { nonce: "test_nonce" };

    const res: Response = await GET({ url, cookies, locals } as any);

    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain("No YouTube Channel Found");
  });

  it("drive flow: detects ':drive' state suffix, sets drive cookies, skips getYoutubeUser", async () => {
    const { GET } = await import("../../../../src/pages/auth/youtube/callback");

    sessionStorage.setItem("youtube_oauth_state", "abc-123:drive");
    const cookies = {
      set: vi.fn(),
      get: vi.fn().mockReturnValue({ value: "abc-123:drive" }),
      delete: vi.fn(),
    } as any;
    const url = new URL(
      "http://localhost/?code=authcode_drive&state=abc-123:drive",
    );
    const locals = { nonce: "nonce_test" };

    const res = await GET({ url, cookies, locals } as any);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/html");

    const body = await res.text();
    expect(body).toContain("Drive Access Granted");
    expect(body).toContain("mixchat_drive_granted");

    // Drive cookies are written with httpOnly.
    expect(cookies.set).toHaveBeenCalledWith(
      "drive_token",
      "access123",
      expect.objectContaining({ httpOnly: true }),
    );
    expect(cookies.set).toHaveBeenCalledWith(
      "drive_refresh_token",
      "refresh123",
      expect.objectContaining({ httpOnly: true }),
    );

    // YouTube-flavor cookies must NOT be touched in the drive flow.
    expect(cookies.set).not.toHaveBeenCalledWith(
      "youtube_token",
      expect.anything(),
      expect.anything(),
    );
    expect(cookies.set).not.toHaveBeenCalledWith(
      "youtube_refresh_token",
      expect.anything(),
      expect.anything(),
    );

    // getYoutubeUser is YouTube-flow only, the drive branch short-circuits
    // before any userinfo call.
    expect(mockGetYoutubeUser).not.toHaveBeenCalled();
  });

  it("drive flow: rendered HTML shows 403 on CSRF state mismatch (server-side check)", async () => {
    const { GET } = await import("../../../../src/pages/auth/youtube/callback");

    // Cookie holds the original state, URL has a different (attacker) state.
    // Server-side CSRF validation rejects before any auth cookies are set.
    sessionStorage.setItem("youtube_oauth_state", "expected-uuid:drive");
    const cookies = {
      set: vi.fn(),
      get: vi.fn().mockReturnValue({ value: "expected-uuid:drive" }),
      delete: vi.fn(),
    } as any;
    const url = new URL(
      "http://localhost/?code=x&state=attacker-uuid:drive",
    );
    const locals = { nonce: "nonce_test" };

    const res = await GET({ url, cookies, locals } as any);

    // Server-side CSRF check rejects mismatched state before any cookies.
    expect(res.status).toBe(403);
    const body = await res.text();
    expect(body).toContain("Invalid state");

    // No auth cookies should be set on a CSRF failure.
    expect(cookies.set).not.toHaveBeenCalledWith(
      "drive_token",
      expect.anything(),
      expect.anything(),
    );
  });

  it("falls through to YouTube flow when state has no ':drive' suffix", async () => {
    const { GET } = await import("../../../../src/pages/auth/youtube/callback");

    // Bare-UUID state (no `:drive` suffix) routes to the established YouTube flow.
    sessionStorage.setItem("youtube_oauth_state", "test_state_youtube");
    const cookies = {
      set: vi.fn(),
      get: vi.fn().mockReturnValue({ value: "test_state_youtube" }),
      delete: vi.fn(),
    } as any;
    const url = new URL(
      "http://localhost/?code=abc123&state=test_state_youtube",
    );
    const locals = { nonce: "nonce_test" };

    const res = await GET({ url, cookies, locals } as any);

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("mixchat_sessions:v1");
    expect(body).toContain("user123");

    // YouTube cookies are written by the YouTube branch.
    expect(cookies.set).toHaveBeenCalledWith(
      "youtube_token",
      "access123",
      expect.objectContaining({ httpOnly: true }),
    );

    // Drive cookies must NOT be written in the non-drive flow.
    expect(cookies.set).not.toHaveBeenCalledWith(
      "drive_token",
      expect.anything(),
      expect.anything(),
    );
    expect(cookies.set).not.toHaveBeenCalledWith(
      "drive_refresh_token",
      expect.anything(),
      expect.anything(),
    );

    // getYoutubeUser IS called in the YouTube branch (drive flow skipped it).
    expect(mockGetYoutubeUser).toHaveBeenCalledWith("access123");
  });
});
