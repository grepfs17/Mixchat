import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AstroCookies } from "astro";

vi.mock("../../src/lib/twitch", () => ({
  getTwitchUser: vi.fn(),
  getTwitchUserByLogin: vi.fn(),
  refreshTwitchAccessToken: vi.fn(),
}));

const { streamSettings } = vi.hoisted(() => ({
  streamSettings: { enabled: true, allowMods: false },
}));

vi.mock("../../src/server/streamToolsSettings", () => ({
  getStreamToolsSettings: vi.fn(async () => ({ ...streamSettings })),
}));
vi.mock("../../src/lib/youtube", () => ({
  getYoutubeUser: vi.fn(),
  refreshYoutubeToken: vi.fn(),
}));

import {
  getTwitchUser,
  getTwitchUserByLogin,
  refreshTwitchAccessToken,
} from "../../src/lib/twitch";
import { getYoutubeUser } from "../../src/lib/youtube";
import { authorizeChannel } from "../../src/server/wheelAuth";

const mockTwitch = getTwitchUser as unknown as ReturnType<typeof vi.fn>;
const mockTwitchByLogin = getTwitchUserByLogin as unknown as ReturnType<
  typeof vi.fn
>;
const mockYoutube = getYoutubeUser as unknown as ReturnType<typeof vi.fn>;
const mockRefreshTwitch = refreshTwitchAccessToken as unknown as ReturnType<
  typeof vi.fn
>;

interface FakeCookies {
  get: (name: string) => { value: string } | undefined;
  set: ReturnType<typeof vi.fn>;
}

function makeCookies(values: Record<string, string>): FakeCookies {
  return {
    get: (name: string) =>
      values[name] !== undefined ? { value: values[name] } : undefined,
    set: vi.fn(),
  };
}

function asCookies(cookies: FakeCookies): AstroCookies {
  return cookies as unknown as AstroCookies;
}

beforeEach(() => {
  streamSettings.enabled = true;
  streamSettings.allowMods = false;
  vi.stubEnv("PUBLIC_TWITCH_CLIENT_ID", "client-id");
  vi.stubEnv("TWITCH_CLIENT_SECRET", "client-secret");
  vi.stubEnv("PUBLIC_YOUTUBE_CLIENT_ID", "yt-client-id");
  vi.stubEnv("YOUTUBE_CLIENT_SECRET", "yt-client-secret");
  mockTwitch.mockReset();
  mockTwitchByLogin.mockReset();
  mockYoutube.mockReset();
  mockRefreshTwitch.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("authorizeChannel", () => {
  it("authorizes a matching Twitch login (case-insensitive)", async () => {
    mockTwitch.mockResolvedValue({ login: "Alice" });
    const res = await authorizeChannel(
      asCookies(makeCookies({ twitch_token: "tok-a" })),
      { channelName: "alice", channelPlatform: "twitch" },
    );
    expect(res).toBe("ok");
  });

  it("rejects a mismatched Twitch login", async () => {
    mockTwitch.mockResolvedValue({ login: "mallory" });
    const res = await authorizeChannel(
      asCookies(makeCookies({ twitch_token: "tok-b" })),
      { channelName: "alice", channelPlatform: "twitch" },
    );
    expect(res).toBe("forbidden");
  });

  it("returns unauthenticated when no credentials are present", async () => {
    const res = await authorizeChannel(asCookies(makeCookies({})), {
      channelName: "alice",
      channelPlatform: "twitch",
    });
    expect(res).toBe("unauthenticated");
    expect(mockTwitch).not.toHaveBeenCalled();
    expect(mockRefreshTwitch).not.toHaveBeenCalled();
  });

  it("authorizes a matching YouTube channel id", async () => {
    mockYoutube.mockResolvedValue({ userId: "UC123abc" });
    const res = await authorizeChannel(
      asCookies(makeCookies({ youtube_token: "yt-a" })),
      { channelName: "UC123abc", channelPlatform: "youtube" },
    );
    expect(res).toBe("ok");
  });

  it("caches verified identities to avoid repeated provider calls", async () => {
    mockTwitch.mockResolvedValue({ login: "alice" });
    const cookies = { twitch_token: "tok-cache" };
    await authorizeChannel(asCookies(makeCookies(cookies)), {
      channelName: "alice",
      channelPlatform: "twitch",
    });
    await authorizeChannel(asCookies(makeCookies(cookies)), {
      channelName: "alice",
      channelPlatform: "twitch",
    });
    expect(mockTwitch).toHaveBeenCalledTimes(1);
  });

  it("refreshes an expired access token and retries", async () => {
    mockTwitch.mockResolvedValue({ login: "alice" });
    mockRefreshTwitch.mockResolvedValue({
      accessToken: "fresh-token",
      refreshToken: "rotated-refresh",
      expiresIn: 3600,
    });
    const cookies = makeCookies({ twitch_refresh_token: "refresh-expired-1" });
    const res = await authorizeChannel(asCookies(cookies), {
      channelName: "alice",
      channelPlatform: "twitch",
    });
    expect(res).toBe("ok");
    expect(mockRefreshTwitch).toHaveBeenCalledTimes(1);
    expect(mockTwitch).toHaveBeenCalledWith("fresh-token", "client-id");
    expect(cookies.set).toHaveBeenCalled();
  });

  it("returns unauthenticated when the refresh fails", async () => {
    mockRefreshTwitch.mockRejectedValue(new Error("bad refresh token"));
    const res = await authorizeChannel(
      asCookies(makeCookies({ twitch_refresh_token: "refresh-dead-1" })),
      { channelName: "alice", channelPlatform: "twitch" },
    );
    expect(res).toBe("unauthenticated");
  });

  it("cools down after a failed refresh", async () => {
    mockRefreshTwitch.mockRejectedValue(new Error("bad refresh token"));
    const values = { twitch_refresh_token: "refresh-dead-2" };
    await authorizeChannel(asCookies(makeCookies(values)), {
      channelName: "alice",
      channelPlatform: "twitch",
    });
    await authorizeChannel(asCookies(makeCookies(values)), {
      channelName: "alice",
      channelPlatform: "twitch",
    });
    expect(mockRefreshTwitch).toHaveBeenCalledTimes(1);
  });

  it("rejects unknown platforms", async () => {
    const res = await authorizeChannel(
      asCookies(makeCookies({ twitch_token: "tok-x" })),
      { channelName: "alice", channelPlatform: "kick" },
    );
    expect(res).toBe("forbidden");
  });

  describe("Twitch moderator access", () => {
    it("rejects a moderator when the streamer has not allowed it", async () => {
      streamSettings.enabled = true;
      streamSettings.allowMods = false;
      mockTwitch.mockResolvedValue({ login: "mallory", userId: "u-mod" });
      mockTwitchByLogin.mockResolvedValue({
        userId: "u-alice",
        login: "alice",
      });
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ broadcaster_id: "u-alice" }] }),
      }) as any;

      const res = await authorizeChannel(
        asCookies(makeCookies({ twitch_token: "tok-mod" })),
        { channelName: "alice", channelPlatform: "twitch" },
        { allowModerators: true },
      );
      expect(res).toBe("forbidden");
      expect(mockTwitchByLogin).not.toHaveBeenCalled();
    });

    it("authorizes a Twitch moderator when allowed", async () => {
      streamSettings.enabled = true;
      streamSettings.allowMods = true;
      mockTwitch.mockResolvedValue({ login: "mallory", userId: "u-mod" });
      mockTwitchByLogin.mockResolvedValue({
        userId: "u-alice",
        login: "alice",
      });
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ broadcaster_id: "u-alice" }] }),
      }) as any;

      const res = await authorizeChannel(
        asCookies(makeCookies({ twitch_token: "tok-mod-2" })),
        { channelName: "alice", channelPlatform: "twitch" },
        { allowModerators: true },
      );
      expect(res).toBe("ok");
      expect(mockTwitchByLogin).toHaveBeenCalledWith(
        "tok-mod-2",
        "client-id",
        "alice",
      );
    });

    it("rejects a Twitch user who is not a moderator of the channel", async () => {
      streamSettings.enabled = true;
      streamSettings.allowMods = true;
      mockTwitch.mockResolvedValue({ login: "mallory", userId: "u-mod" });
      mockTwitchByLogin.mockResolvedValue({
        userId: "u-alice",
        login: "alice",
      });
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      }) as any;

      const res = await authorizeChannel(
        asCookies(makeCookies({ twitch_token: "tok-mod-3" })),
        { channelName: "alice", channelPlatform: "twitch" },
        { allowModerators: true },
      );
      expect(res).toBe("forbidden");
    });

    it("does not use moderator access without allowModerators", async () => {
      streamSettings.enabled = true;
      streamSettings.allowMods = true;
      mockTwitch.mockResolvedValue({ login: "mallory", userId: "u-mod" });
      const res = await authorizeChannel(
        asCookies(makeCookies({ twitch_token: "tok-mod-4" })),
        { channelName: "alice", channelPlatform: "twitch" },
      );
      expect(res).toBe("forbidden");
      expect(mockTwitchByLogin).not.toHaveBeenCalled();
    });

    it("never grants moderator access on YouTube channels", async () => {
      streamSettings.enabled = true;
      streamSettings.allowMods = true;
      mockYoutube.mockResolvedValue({ userId: "UC-mallory" });
      const res = await authorizeChannel(
        asCookies(makeCookies({ youtube_token: "yt-mod" })),
        { channelName: "UC-alice", channelPlatform: "youtube" },
        { allowModerators: true },
      );
      expect(res).toBe("forbidden");
    });
  });
});
