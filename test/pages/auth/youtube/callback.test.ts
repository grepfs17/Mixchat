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

    const cookies = { set: vi.fn() } as any;
    const url = new URL("http://localhost/?code=abc123&state=test_state");
    const locals = { nonce: "test_nonce" };

    const res: Response = await GET({ url, cookies, locals } as any);

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

  it("returns 400 with friendly message when user has no YouTube channel", async () => {
    const noChannelError = new Error("No YouTube channel found for this user");
    noChannelError.name = "NoChannelError";
    mockGetYoutubeUser.mockRejectedValueOnce(noChannelError);

    const { GET } = await import("../../../../src/pages/auth/youtube/callback");

    const cookies = { set: vi.fn() } as any;
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
    const cookies = { set: vi.fn(), delete: vi.fn() } as any;
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

    // getYoutubeUser is YouTube-flow only — the drive branch short-circuits
    // before any userinfo call.
    expect(mockGetYoutubeUser).not.toHaveBeenCalled();
  });

  it("drive flow: rendered HTML aborts on CSRF state mismatch", async () => {
    const { GET } = await import("../../../../src/pages/auth/youtube/callback");

    // Persisted expected state ends with ":drive" so the server routes to
    // the drive branch — but the URL state is a different UUID.
    sessionStorage.setItem("youtube_oauth_state", "expected-uuid:drive");
    const cookies = { set: vi.fn(), delete: vi.fn() } as any;
    const url = new URL(
      "http://localhost/?code=x&state=attacker-uuid:drive",
    );
    const locals = { nonce: "nonce_test" };

    const res = await GET({ url, cookies, locals } as any);

    expect(res.status).toBe(200);
    const body = await res.text();
    // The popup's runtime CSRF check sets this message via document.body.
    expect(body).toContain("invalid state");

    // Server-side cookies are still set BEFORE the popup's CSRF check runs
    // (the popup is the only thing that displays the CSRF error). Confirm
    // drive_token was written so the wiring before the response is covered.
    expect(cookies.set).toHaveBeenCalledWith(
      "drive_token",
      "access123",
      expect.any(Object),
    );
  });

  it("falls through to YouTube flow when state has no ':drive' suffix", async () => {
    const { GET } = await import("../../../../src/pages/auth/youtube/callback");

    // Bare-UUID state (no `:drive` suffix) routes to the established YouTube flow.
    sessionStorage.setItem("youtube_oauth_state", "test_state_youtube");
    const cookies = { set: vi.fn(), delete: vi.fn() } as any;
    const url = new URL(
      "http://localhost/?code=abc123&state=test_state_youtube",
    );
    const locals = { nonce: "nonce_test" };

    const res = await GET({ url, cookies, locals } as any);

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("mixchat_sessions");
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
