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

/** Fetch a Twitch GQL PlaybackAccessToken, retrying with integrity token if needed. */
async function fetchPlaybackToken(
  channel: string,
): Promise<{ value: string; signature: string }> {
  const gqlBody = {
    operationName: "PlaybackAccessToken",
    extensions: {
      persistedQuery: {
        version: 1,
        sha256Hash:
          "ed230aa1e33e07eebb8928504583da78a5173989fadfb1ac94be06a04f3cdbe9",
      },
    },
    variables: {
      isLive: true,
      login: channel,
      isVod: false,
      vodID: "",
      playerType: "embed",
      platform: "site",
    },
  };

  let gqlRes = await fetch("https://gql.twitch.tv/gql", {
    method: "POST",
    headers: BASE_GQL_HEADERS,
    body: JSON.stringify(gqlBody),
  });

  // If Twitch requires a client-integrity token (401/403), try acquiring one
  // and retry with Device-Id + Client-Integrity headers.
  if (!gqlRes.ok && (gqlRes.status === 401 || gqlRes.status === 403)) {
    try {
      const integrityRes = await fetch("https://gql.twitch.tv/integrity", {
        method: "POST",
        headers: { "Client-ID": GQL_CLIENT_ID },
      });
      if (integrityRes.ok) {
        const integrityData = await integrityRes.json();
        const clientIntegrity = integrityData?.token;
        const setCookie = integrityRes.headers?.get?.("set-cookie");
        const kpsdkCt = integrityRes.headers?.get?.("x-kpsdk-ct");
        let cookieHeader: Record<string, string> = {};
        if (kpsdkCt) {
          cookieHeader = {
            Cookie: `KP_UIDz-ssn=${kpsdkCt}; KP_UIDz=${kpsdkCt}`,
          };
        } else if (setCookie) {
          cookieHeader = { Cookie: setCookie.split(/\r?\n/).join("; ") };
        }
        if (clientIntegrity) {
          const deviceId = Math.random().toString(36).slice(2, 34);
          const retryHeaders: Record<string, string> = {
            ...BASE_GQL_HEADERS,
            "Device-Id": deviceId,
            "Client-Integrity": clientIntegrity,
            ...cookieHeader,
          };
          if (retryHeaders.Authorization) delete retryHeaders.Authorization;
          gqlRes = await fetch("https://gql.twitch.tv/gql", {
            method: "POST",
            headers: retryHeaders,
            body: JSON.stringify(gqlBody),
          });
        }
      }
    } catch (err) {
      console.error("Failed to acquire client-integrity token:", err);
    }
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

  return { value: tokenData.value, signature: tokenData.signature };
}

/** Fetch the master HLS playlist from Twitch's usher CDN. */
async function fetchMasterPlaylist(
  channel: string,
  token: { value: string; signature: string },
  oauthToken?: string,
): Promise<string> {
  const usherParams = new URLSearchParams({
    client_id: GQL_CLIENT_ID,
    token: token.value,
    sig: token.signature,
    allow_source: "true",
    allow_audio_only: "true",
    allow_spectre: "false",
    fast_bread: "true",
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
): Array<{ label: string; url: string }> {
  const lines = masterText.split("\n");

  const nameMap = new Map<string, string>();
  for (const line of lines) {
    if (line.startsWith("#EXT-X-MEDIA:TYPE=VIDEO")) {
      const groupId = line.match(/GROUP-ID="([^"]+)"/)?.[1];
      const name = line.match(/NAME="([^"]+)"/)?.[1];
      if (groupId && name) nameMap.set(groupId, name);
    }
  }

  const qualities: Array<{ label: string; url: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("#EXT-X-STREAM-INF:")) {
      const videoGroup = lines[i].match(/VIDEO="([^"]+)"/)?.[1];
      const variantUrl = lines[i + 1]?.trim();
      if (variantUrl?.startsWith("http")) {
        const label =
          (videoGroup && nameMap.get(videoGroup)) ?? videoGroup ?? "unknown";
        // Route through server-side proxy. *.playlist.ttvnw.net URLs are IP-locked.
        const proxied = `/api/hls-proxy?url=${encodeURIComponent(variantUrl)}`;
        qualities.push({ label, url: proxied });
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

    const token = await fetchPlaybackToken(channel);
    const masterText = await fetchMasterPlaylist(channel, token, twitchToken);
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
