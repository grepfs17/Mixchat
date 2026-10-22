import { createHash } from "node:crypto";
import type { AstroCookies } from "astro";

/**
 * Identity for a viewer's YouTube session. Authenticated viewers get isolated
 * sessions so AutoMod events only reach the moderator who received them;
 * guests share one session per video.
 *
 * Derive the key from a secret credential (httpOnly refresh token, else the
 * access token), never from client-controlled ids, and hash it so tokens
 * never appear in logs or map keys.
 */
export interface YouTubeAuthIdentity {
  authKey: string;
  authenticated: boolean;
  accessToken?: string;
  refreshToken?: string;
}

function hashIdentity(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export function getYouTubeAuthIdentity(
  cookies: AstroCookies,
): YouTubeAuthIdentity {
  const accessToken = cookies.get("youtube_token")?.value;
  const refreshToken = cookies.get("youtube_refresh_token")?.value;

  if (!accessToken && !refreshToken) {
    return { authKey: "anon", authenticated: false };
  }

  // The refresh token is stable across access-token refreshes, so prefer it.
  const stableIdentity = refreshToken
    ? `refresh:${refreshToken}`
    : `access:${accessToken}`;

  return {
    authKey: `u:${hashIdentity(stableIdentity)}`,
    authenticated: true,
    accessToken,
    refreshToken,
  };
}

export function getYouTubeSessionKey(
  videoId: string,
  authKey: string,
): string {
  return `${videoId}:${authKey}`;
}
