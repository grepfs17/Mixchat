/**
 * Server-side provider token refresh via the httpOnly refresh-token cookies.
 *
 * The app's client hook (`useTokenRefresh`) calls `/api/refresh-token`, but
 * standalone server consumers (e.g. the Wheel Spin standalone page) must be
 * able to refresh on their own. This module sets the refreshed access token
 * (and any rotated refresh token) back onto the response cookies.
 */

import type { AstroCookies } from "astro";
import { IS_DESKTOP, IS_TWITCH_ONLY } from "../lib/constants";
import { refreshTwitchAccessToken } from "../lib/twitch";
import { refreshYoutubeToken } from "../lib/youtube";

export type RefreshablePlatform = "twitch" | "youtube";

const REFRESH_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

function isSecureDeployment(): boolean {
  return import.meta.env.MODE !== "development";
}

/**
 * Uses the stored refresh-token cookie to mint a new access token, updating
 * the auth cookies. Returns the new access token, or `null` when no refresh
 * token is available or the refresh fails.
 */
export async function refreshProviderAccessToken(
  cookies: AstroCookies,
  platform: RefreshablePlatform,
): Promise<string | null> {
  const isSecure = isSecureDeployment();

  if (platform === "twitch") {
    const refreshToken = cookies.get("twitch_refresh_token")?.value;
    if (!refreshToken) return null;
    const clientId = import.meta.env.PUBLIC_TWITCH_CLIENT_ID;
    const clientSecret = IS_DESKTOP
      ? undefined
      : import.meta.env.TWITCH_CLIENT_SECRET;
    if (!clientId || (!IS_DESKTOP && !clientSecret)) return null;

    const tokenData = await refreshTwitchAccessToken(
      refreshToken,
      clientId,
      clientSecret,
    );
    if (tokenData.accessToken) {
      cookies.set("twitch_token", tokenData.accessToken, {
        httpOnly: true,
        secure: isSecure,
        sameSite: "lax",
        maxAge: tokenData.expiresIn || 3600,
        path: "/",
      });
    }
    if (tokenData.refreshToken) {
      cookies.set("twitch_refresh_token", tokenData.refreshToken, {
        httpOnly: true,
        secure: isSecure,
        sameSite: "strict",
        maxAge: REFRESH_COOKIE_MAX_AGE,
        path: "/",
      });
    }
    return tokenData.accessToken ?? null;
  }

  if (platform === "youtube") {
    if (IS_TWITCH_ONLY) return null;
    const refreshToken = cookies.get("youtube_refresh_token")?.value;
    if (!refreshToken) return null;
    const clientId = import.meta.env.PUBLIC_YOUTUBE_CLIENT_ID;
    // Google requires the client secret even for desktop (PKCE) clients.
    const clientSecret = import.meta.env.YOUTUBE_CLIENT_SECRET || undefined;
    if (!clientId || !clientSecret) return null;

    const tokenData = await refreshYoutubeToken(
      refreshToken,
      clientId,
      clientSecret,
    );
    if (tokenData.access_token) {
      cookies.set("youtube_token", tokenData.access_token, {
        httpOnly: true,
        secure: isSecure,
        sameSite: "lax",
        maxAge: tokenData.expires_in || 3600,
        path: "/",
      });
    }
    if (tokenData.refresh_token) {
      cookies.set("youtube_refresh_token", tokenData.refresh_token, {
        httpOnly: true,
        secure: isSecure,
        sameSite: "strict",
        maxAge: REFRESH_COOKIE_MAX_AGE,
        path: "/",
      });
    }
    return tokenData.access_token ?? null;
  }

  return null;
}
