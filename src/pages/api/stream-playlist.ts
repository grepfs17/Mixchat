import type { APIRoute } from "astro";
import { checkRateLimit } from "../../lib/rateLimit";

function qualityRank(label: string): number {
  if (label === "audio_only") return -1;
  const match = label.match(/^(\d+)p/);
  return match ? parseInt(match[1], 10) : 0;
}

// Fall back to Streamlink's public client id, which is safe for playback
// token requests when no private client id is configured.
const GQL_CLIENT_ID =
  import.meta.env.TWITCH_GQL_CLIENT_ID ?? "kimne78kx3ncx6brgo4mv6wki5h1ko";

const BASE_GQL_HEADERS = {
  "Client-ID": GQL_CLIENT_ID,
  "Content-Type": "application/json",
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (compatible; mixchat/0.1)",
};

// 1440p (2K) is HEVC-only on Twitch, so the client must advertise the codecs
// it can actually decode or usher never lists the higher variants.
const PLAYBACK_CODECS = ["av1", "h265", "h264"] as const;
const PLAYBACK_CODEC_SET = new Set<string>(PLAYBACK_CODECS);

function resolvePlaybackCodecs(raw: string | null): string {
  const requested = (raw ?? "")
    .split(",")
    .map((codec) => codec.trim().toLowerCase())
    .filter((codec) => PLAYBACK_CODEC_SET.has(codec));
  const unique = [...new Set(requested)];
  return unique.length > 0 ? unique.join(",") : PLAYBACK_CODECS.join(",");
}

function playbackTokenBody(
  channel: string,
  playerType: string,
  platform: string,
): Record<string, unknown> {
  // Plain query instead of a persisted hash: it works for anonymous and
  // signed-in requests alike, and the account's token is what raises
  // maximum_resolution from FULL_HD to QUAD_HD for 1440p streams.
  return {
    query: `query{streamPlaybackAccessToken(channelName:${JSON.stringify(channel)},params:{platform:${JSON.stringify(platform)},playerBackend:"mediaplayer",playerType:${JSON.stringify(playerType)}}){value signature}}`,
  };
}

async function postPlaybackToken(
  channel: string,
  playerType: string,
  platform: string,
  oauthToken?: string,
): Promise<Response> {
  const headers: Record<string, string> = { ...BASE_GQL_HEADERS };
  if (oauthToken) {
    headers.Authorization = `OAuth ${oauthToken}`;
    // Twitch ties the token to the client that issued it, so signed-in
    // requests must use the desktop app's client id, not the web one.
    const appClientId = import.meta.env.PUBLIC_TWITCH_CLIENT_ID;
    if (appClientId) headers["Client-ID"] = appClientId;
  }
  return fetch("https://gql.twitch.tv/gql", {
    method: "POST",
    headers,
    body: JSON.stringify(playbackTokenBody(channel, playerType, platform)),
  });
}

/** Retry an anonymous token request with Twitch's client-integrity headers. */
async function retryPlaybackTokenWithIntegrity(
  channel: string,
): Promise<Response | null> {
  try {
    const integrityRes = await fetch("https://gql.twitch.tv/integrity", {
      method: "POST",
      headers: { "Client-ID": GQL_CLIENT_ID },
    });
    if (!integrityRes.ok) return null;

    const integrityData = await integrityRes.json();
    const clientIntegrity = integrityData?.token;
    if (!clientIntegrity) return null;

    const kpsdkCt = integrityRes.headers?.get?.("x-kpsdk-ct");
    const setCookie = integrityRes.headers?.get?.("set-cookie");
    const headers: Record<string, string> = {
      ...BASE_GQL_HEADERS,
      "Device-Id": Math.random().toString(36).slice(2, 34),
      "Client-Integrity": clientIntegrity,
    };
    if (kpsdkCt) {
      headers.Cookie = `KP_UIDz-ssn=${kpsdkCt}; KP_UIDz=${kpsdkCt}`;
    } else if (setCookie) {
      headers.Cookie = setCookie.split(/\r?\n/).join("; ");
    }

    return fetch("https://gql.twitch.tv/gql", {
      method: "POST",
      headers,
      body: JSON.stringify(playbackTokenBody(channel, "embed", "site")),
    });
  } catch (err) {
    console.error("Failed to acquire client-integrity token:", err);
    return null;
  }
}

/**
 * Fetch a Twitch GQL PlaybackAccessToken.
 *
 * Signed-in viewers get the web-player request (site/web) with the OAuth token
 * attached, which is what unlocks the authenticated 1440p/HEVC variants. The
 * anonymous embed request stays as the fallback so an expired token cannot
 * break playback, and Twitch's integrity token covers the anonymous 401/403.
 */
async function fetchPlaybackToken(
  channel: string,
  oauthToken?: string,
): Promise<{ value: string; signature: string; authenticated: boolean }> {
  let authenticated = Boolean(oauthToken);
  let gqlRes = oauthToken
    ? await postPlaybackToken(channel, "site", "web", oauthToken)
    : await postPlaybackToken(channel, "embed", "site");

  if (
    oauthToken &&
    !gqlRes.ok &&
    (gqlRes.status === 401 || gqlRes.status === 403)
  ) {
    console.warn(
      "[hls:server] Playback token rejected for the OAuth session, retrying anonymously (channel:",
      channel,
      ")",
    );
    authenticated = false;
    gqlRes = await postPlaybackToken(channel, "embed", "site");
  }

  // If Twitch requires a client-integrity token (401/403), try acquiring one
  // and retry with Device-Id + Client-Integrity headers.
  if (!gqlRes.ok && (gqlRes.status === 401 || gqlRes.status === 403)) {
    gqlRes = (await retryPlaybackTokenWithIntegrity(channel)) ?? gqlRes;
  }

  if (!gqlRes.ok) throw new Error(`Twitch GQL error: ${gqlRes.status}`);

  const gqlData = await gqlRes.json();
  if (Array.isArray(gqlData?.errors) && gqlData.errors.length > 0) {
    const msg = gqlData.errors
      .map((e: { message?: string }) => e.message)
      .join("; ");
    console.error("Twitch GQL errors:", gqlData.errors);
    throw new Error(`Twitch GQL returned errors: ${msg}`);
  }

  const tokenData = gqlData?.data?.streamPlaybackAccessToken;
  if (!tokenData?.value || !tokenData?.signature) {
    throw new Error("STREAM_OFFLINE");
  }

  // The token payload states the highest rendition Twitch will serve. Log the
  // cap so a missing 1440p can be told apart from a decode problem.
  try {
    const payload = JSON.parse(tokenData.value) as {
      maximum_resolution?: string;
      maximum_resolution_reasons?: Record<string, string[]>;
      user_id?: string | null;
    };
    // Only treat the request as signed in when Twitch actually resolved a
    // viewer, otherwise usher must not receive the OAuth token.
    if (oauthToken) authenticated = Boolean(payload.user_id);
    if (payload.maximum_resolution) {
      const quadHd = payload.maximum_resolution_reasons?.QUAD_HD;
      console.log(
        "[hls:server] Playback token resolution cap:",
        payload.maximum_resolution,
        quadHd?.length ? `(1440p: ${quadHd.join(",")})` : "",
        authenticated ? "authenticated" : "anonymous",
      );
    }
  } catch {
    // The value is normally a JSON string, but logging must not break playback.
  }

  return { value: tokenData.value, signature: tokenData.signature, authenticated };
}

/** Fetch the master HLS playlist from Twitch's usher CDN. */
async function fetchMasterPlaylist(
  channel: string,
  token: { value: string; signature: string },
  oauthToken: string | undefined,
  codecs: string,
): Promise<string> {
  const usherParams = new URLSearchParams({
    client_id: oauthToken
      ? import.meta.env.PUBLIC_TWITCH_CLIENT_ID || GQL_CLIENT_ID
      : GQL_CLIENT_ID,
    token: token.value,
    sig: token.signature,
    allow_source: "true",
    allow_audio_only: "true",
    allow_spectre: "false",
    fast_bread: "true",
    // Match the web player: without supported_codecs usher only returns the
    // H.264 ladder, which caps at 1080p and hides every 1440p HEVC rendition.
    supported_codecs: codecs,
    platform: "web",
    player: "twitchweb",
    p: String(Math.floor(Math.random() * 999999)),
  });

  if (oauthToken) {
    usherParams.set("oauth_token", oauthToken);
    console.log("[hls:server] Passing oauth_token to usher. Ads will be skipped for subscribers/Turbo (channel:", channel, ")");
  } else {
    console.log("[hls:server] No oauth_token available. The stream may include ads (channel:", channel, ")");
  }

  const usherUrl = `https://usher.ttvnw.net/api/channel/hls/${encodeURIComponent(channel)}.m3u8?${usherParams}`;
  console.log("[hls:server] Fetching usher playlist for channel:", channel);
  const res = await fetch(usherUrl);

  if (!res.ok) {
    if (res.status === 404) throw new Error("CHANNEL_OFFLINE");
    throw new Error(`Usher fetch failed: ${res.status}`);
  }

  return res.text();
}

/** Parse HLS master playlist m3u8 text into quality entries with proxied URLs. */
function parseMasterPlaylist(
  masterText: string,
): Array<{ label: string; url: string; codecs: string }> {
  const lines = masterText.split("\n");

  const nameMap = new Map<string, string>();
  for (const line of lines) {
    if (line.startsWith("#EXT-X-MEDIA:TYPE=VIDEO")) {
      const groupId = line.match(/GROUP-ID="([^"]+)"/)?.[1];
      const name = line.match(/NAME="([^"]+)"/)?.[1];
      if (groupId && name) nameMap.set(groupId, name);
    }
  }

  const qualities: Array<{ label: string; url: string; codecs: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("#EXT-X-STREAM-INF:")) {
      const videoGroup = lines[i].match(/VIDEO="([^"]+)"/)?.[1];
      const codecs = lines[i].match(/CODECS="([^"]+)"/)?.[1] ?? "";
      const variantUrl = lines[i + 1]?.trim();
      if (variantUrl?.startsWith("http")) {
        const label =
          (videoGroup && nameMap.get(videoGroup)) ?? videoGroup ?? "unknown";
        // Route through server-side proxy. *.playlist.ttvnw.net URLs are IP-locked.
        const proxied = `/api/hls-proxy?url=${encodeURIComponent(variantUrl)}`;
        qualities.push({ label, url: proxied, codecs });
      }
    }
  }

  // Sort highest resolution first, audio_only last.
  qualities.sort((a, b) => qualityRank(b.label) - qualityRank(a.label));
  return qualities;
}

/** Check if the authenticated user is subscribed to the channel (ad-free). */
async function checkSubscription(
  twitchToken: string,
  channel: string,
): Promise<boolean> {
  const clientId = import.meta.env.PUBLIC_TWITCH_CLIENT_ID;
  if (!clientId) return false;

  try {
    const headers = { "Client-Id": clientId, Authorization: `Bearer ${twitchToken}` };
    const [selfRes, chanRes] = await Promise.all([
      fetch("https://api.twitch.tv/helix/users", { headers }),
      fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(channel)}`, {
        headers,
      }),
    ]);
    if (!selfRes.ok || !chanRes.ok) return false;
    const [selfData, chanData] = await Promise.all([selfRes.json(), chanRes.json()]);
    const userId = selfData?.data?.[0]?.id;
    if (!userId) return false;
    const broadcasterId = chanData?.data?.[0]?.id;
    if (!broadcasterId) return false;

    const subRes = await fetch(
      `https://api.twitch.tv/helix/subscriptions/user?broadcaster_id=${broadcasterId}&user_id=${userId}`,
      { headers: { "Client-Id": clientId, Authorization: `Bearer ${twitchToken}` } },
    );
    if (!subRes.ok) return false;
    const subData = await subRes.json();
    const authenticated = Array.isArray(subData?.data) && subData.data.length > 0;
    console.log("[hls:server] Subscription check:", { channel, userId, broadcasterId, authenticated, subStatus: subRes.status });
    return authenticated;
  } catch (err) {
    console.warn("[hls:server] Subscription check error (non-fatal):", err);
    return false;
  }
}

function jsonError(error: string, status: number, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify({ error, ...extra }), {
    status,
    headers: { "Content-Type": "application/json", ...(status === 429 ? { "Retry-After": "60" } : {}) },
  });
}

export const GET: APIRoute = async ({ request, url, cookies }) => {
  const clientAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const twitchToken = cookies.get("twitch_token")?.value;
  const youtubeToken = cookies.get("youtube_token")?.value;
  if (!twitchToken && !youtubeToken) {
    return jsonError("Authentication required", 401);
  }

  if (!checkRateLimit(`${clientAddress}:stream-playlist`, 30, 60_000)) {
    return jsonError("Too many requests", 429);
  }

  try {
    const channel = url.searchParams.get("channel");
    if (!channel) {
      return jsonError("Channel parameter required", 400);
    }

    // Subscription check only needs the token + channel, so start it alongside
    // the playlist chain instead of after it.
    const subscriptionPromise = twitchToken
      ? checkSubscription(twitchToken, channel)
      : Promise.resolve(false);

    const codecs = resolvePlaybackCodecs(url.searchParams.get("codecs"));
    const token = await fetchPlaybackToken(channel, twitchToken);
    const masterText = await fetchMasterPlaylist(
      channel,
      token,
      token.authenticated ? twitchToken : undefined,
      codecs,
    );
    const qualities = parseMasterPlaylist(masterText);

    if (qualities.length === 0) {
      return jsonError("Could not parse master playlist", 500);
    }

    const authenticated = await subscriptionPromise;

    return new Response(JSON.stringify({ qualities, authenticated }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "STREAM_OFFLINE") {
      return jsonError("Stream not available or channel is offline", 404);
    }
    if (error instanceof Error && error.message === "CHANNEL_OFFLINE") {
      return jsonError("Channel is offline or does not exist", 404);
    }
    console.error("Stream playlist proxy error:", error);
    const isProd = process.env.NODE_ENV === "production";
    return jsonError("Failed to get playlist", 500, isProd ? {} : { details: String(error ?? "") });
  }
};
