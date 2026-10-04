/**
 * Server-side channel authorization for the Wheel Spin API.
 *
 * The wheel routes accept a `channelKey` (e.g. `twitch:alice`). That value is
 * a *claim*, never proof of ownership. To use the channel-trust path the
 * requester must present a provider access token (httpOnly cookie) whose
 * identity matches the claimed channel:
 * - Twitch: `GET /helix/users` with the `twitch_token` cookie → `login`.
 * - YouTube: `channels.list?mine=true` with the `youtube_token` cookie → channel id.
 *
 * The access-token cookie expires with the provider token, so when it is gone
 * (or rejected) we mint a new one from the refresh-token cookie via
 * `refreshProviderAccessToken` and retry once. Verified identities are cached
 * briefly, keyed by a hash of the token, to avoid hitting the provider APIs on
 * every request. Failed refreshes are subject to a short cooldown so a dead
 * session can't hammer the provider.
 */

import { createHash } from "node:crypto";
import type { AstroCookies } from "astro";
import { IS_TWITCH_ONLY } from "../lib/constants";
import { getTwitchUser } from "../lib/twitch";
import { getYoutubeUser } from "../lib/youtube";
import { refreshProviderAccessToken } from "./providerTokens";

export interface WheelChannel {
  channelName: string;
  channelPlatform: string;
}

export type ChannelAuthResult = "ok" | "unauthenticated" | "forbidden";

interface Identity {
  /** Twitch login (lowercased) or YouTube channel id. */
  key: string;
}

interface CacheEntry {
  expiresAt: number;
  identity: Identity;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const REFRESH_COOLDOWN_MS = 60 * 1000;
const identityCache = new Map<string, CacheEntry>();
const refreshCooldown = new Map<string, number>();

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function cacheKey(platform: string, token: string): string {
  return `${platform}:${hashToken(token)}`;
}

function readCached(platform: string, token: string): Identity | null {
  const key = cacheKey(platform, token);
  const entry = identityCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    identityCache.delete(key);
    return null;
  }
  return entry.identity;
}

function writeCached(platform: string, token: string, identity: Identity): void {
  identityCache.set(cacheKey(platform, token), {
    identity,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

async function resolveTwitchIdentity(
  token: string,
  clientId: string,
): Promise<Identity | null> {
  const cached = readCached("twitch", token);
  if (cached) return cached;
  try {
    const user = await getTwitchUser(token, clientId);
    const identity: Identity = { key: user.login.trim().toLowerCase() };
    writeCached("twitch", token, identity);
    return identity;
  } catch {
    return null;
  }
}

async function resolveYoutubeIdentity(token: string): Promise<Identity | null> {
  const cached = readCached("youtube", token);
  if (cached) return cached;
  try {
    const user = await getYoutubeUser(token);
    const identity: Identity = { key: user.userId.trim().toLowerCase() };
    writeCached("youtube", token, identity);
    return identity;
  } catch {
    return null;
  }
}

/**
 * Attempts to obtain a fresh access token from the refresh-token cookie.
 * Returns null (without calling the provider) while a recent failure is still
 * within the cooldown window.
 */
async function tryRefreshToken(
  cookies: AstroCookies,
  platform: "twitch" | "youtube",
): Promise<string | null> {
  const refreshCookie =
    platform === "twitch" ? "twitch_refresh_token" : "youtube_refresh_token";
  const refreshToken = cookies.get(refreshCookie)?.value;
  if (!refreshToken) return null;

  const key = `refresh:${platform}:${hashToken(refreshToken)}`;
  const blockedUntil = refreshCooldown.get(key);
  if (blockedUntil && blockedUntil > Date.now()) return null;

  try {
    const token = await refreshProviderAccessToken(cookies, platform);
    if (token) {
      refreshCooldown.delete(key);
      return token;
    }
  } catch {
    // fall through to cooldown
  }
  refreshCooldown.set(key, Date.now() + REFRESH_COOLDOWN_MS);
  return null;
}

async function resolveWithRefresh(
  cookies: AstroCookies,
  platform: "twitch" | "youtube",
  resolve: (token: string) => Promise<Identity | null>,
): Promise<Identity | null> {
  const accessCookie = platform === "twitch" ? "twitch_token" : "youtube_token";
  let token = cookies.get(accessCookie)?.value ?? null;
  // The access-token cookie is deleted by the browser once the provider token
  // expires, so mint a new one before giving up.
  if (!token) token = await tryRefreshToken(cookies, platform);
  if (!token) return null;

  let identity = await resolve(token);
  if (!identity) {
    // Cookie present but rejected (revoked / expired ahead of maxAge).
    const refreshed = await tryRefreshToken(cookies, platform);
    if (refreshed && refreshed !== token) {
      identity = await resolve(refreshed);
    }
  }
  return identity;
}

export async function authorizeChannel(
  cookies: AstroCookies,
  channel: WheelChannel,
): Promise<ChannelAuthResult> {
  const platform = channel.channelPlatform.trim().toLowerCase();
  const name = channel.channelName.trim().toLowerCase();
  if (!name) return "forbidden";

  if (platform === "twitch") {
    const clientId = import.meta.env.PUBLIC_TWITCH_CLIENT_ID;
    if (!clientId) return "forbidden";
    const identity = await resolveWithRefresh(cookies, "twitch", (token) =>
      resolveTwitchIdentity(token, clientId),
    );
    if (!identity) return "unauthenticated";
    return identity.key === name ? "ok" : "forbidden";
  }

  if (platform === "youtube") {
    if (IS_TWITCH_ONLY) return "forbidden";
    const identity = await resolveWithRefresh(cookies, "youtube", (token) =>
      resolveYoutubeIdentity(token),
    );
    if (!identity) return "unauthenticated";
    return identity.key === name ? "ok" : "forbidden";
  }

  return "forbidden";
}

/** Purge expired cache / cooldown entries every 5 minutes. */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of identityCache) {
    if (entry.expiresAt < now) identityCache.delete(key);
  }
  for (const [key, expiresAt] of refreshCooldown) {
    if (expiresAt < now) refreshCooldown.delete(key);
  }
}, CACHE_TTL_MS);
