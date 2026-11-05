import { describe, it, expect } from "vitest";
import {
  getYouTubeAuthIdentity,
  getYouTubeSessionKey,
} from "../../src/server/youtubeAuth";

function makeCookies(values: Record<string, string>) {
  return {
    get: (name: string) => {
      const value = values[name];
      return value ? { value } : undefined;
    },
  } as any;
}

describe("getYouTubeAuthIdentity", () => {
  it("returns the shared anonymous key without tokens", () => {
    const auth = getYouTubeAuthIdentity(makeCookies({}));
    expect(auth.authenticated).toBe(false);
    expect(auth.authKey).toBe("anon");
  });

  it("derives a stable hash from the refresh token", () => {
    const cookies = makeCookies({
      youtube_token: "token-a",
      youtube_refresh_token: "refresh-a",
    });

    const first = getYouTubeAuthIdentity(cookies);
    const second = getYouTubeAuthIdentity(cookies);

    expect(first.authenticated).toBe(true);
    expect(first.authKey).toBe(second.authKey);
    expect(first.authKey).toMatch(/^u:[a-f0-9]{32}$/);
    expect(first.authKey).not.toContain("refresh-a");
  });

  it("isolates different viewers", () => {
    const alice = getYouTubeAuthIdentity(
      makeCookies({
        youtube_token: "a",
        youtube_refresh_token: "ra",
      }),
    );
    const bob = getYouTubeAuthIdentity(
      makeCookies({
        youtube_token: "b",
        youtube_refresh_token: "rb",
      }),
    );

    expect(alice.authKey).not.toBe(bob.authKey);
  });

  it("ignores a client-controlled user id cookie", () => {
    const real = getYouTubeAuthIdentity(
      makeCookies({ youtube_token: "a", youtube_refresh_token: "ra" }),
    );
    const forged = getYouTubeAuthIdentity(
      makeCookies({
        youtube_token: "a",
        youtube_refresh_token: "ra",
        youtube_user_id: "someone-else",
      }),
    );

    expect(forged.authKey).toBe(real.authKey);
  });

  it("falls back to the access token when no refresh token exists", () => {
    const auth = getYouTubeAuthIdentity(
      makeCookies({ youtube_token: "access-only" }),
    );
    expect(auth.authenticated).toBe(true);
    expect(auth.authKey).toMatch(/^u:[a-f0-9]{32}$/);
  });
});

describe("getYouTubeSessionKey", () => {
  it("scopes a session by video and auth identity", () => {
    expect(getYouTubeSessionKey("video123", "anon")).toBe("video123:anon");
    expect(getYouTubeSessionKey("video123", "u:abc")).toBe("video123:u:abc");
  });
});
