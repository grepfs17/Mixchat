import type { APIRoute } from "astro";
import { checkRateLimit } from "../../lib/rateLimit";

// Use configured client id, or fall back to Streamlink's public client id.
// The public client id is used by many clients and is safe for playback token
// requests when no private client id is provided.
const GQL_CLIENT_ID =
  import.meta.env.TWITCH_GQL_CLIENT_ID ?? "kimne78kx3ncx6brgo4mv6wki5h1ko";

export const GET: APIRoute = async ({ request, url, cookies }) => {
  const clientAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  // Require an active session — prevents open-proxy abuse of this endpoint.
  const twitchToken = cookies.get("twitch_token")?.value;
  const youtubeToken = cookies.get("youtube_token")?.value;
  if (!twitchToken && !youtubeToken) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!checkRateLimit(`${clientAddress}:stream-playlist`, 30, 60_000)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "60" },
    });
  }

  try {
    const channel = url.searchParams.get("channel");
    if (!channel) {
      return new Response(
        JSON.stringify({ error: "Channel parameter required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Grab a playback access token from Twitch on the server side.
    // The token is tied to the server's IP, so everything that follows
    // must also go through the server to avoid 403 errors from the CDN.
    // Use Twitch's persisted GraphQL PlaybackAccessToken query (same approach
    // as Streamlink). Twitch may require a client-integrity token for live
    // playback requests; if we receive 401/403 try acquiring one and retry.
    const gqlBody = {
      operationName: "PlaybackAccessToken",
      extensions: {
        persistedQuery: {
          version: 1,
          // SHA256 used by Streamlink for the PlaybackAccessToken persisted query
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

    const baseGqlHeaders = {
      "Client-ID": GQL_CLIENT_ID,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; mixchat/0.1)",
    };

    let gqlRes = await fetch("https://gql.twitch.tv/gql", {
      method: "POST",
      headers: baseGqlHeaders,
      body: JSON.stringify(gqlBody),
    });

    // If Twitch requires a client-integrity token (401/403), try acquiring it
    // from /integrity and retry the GQL request with Device-Id + Client-Integrity.
    // The user's OAuth token is intentionally NOT used here because it was
    // issued for a different Client-ID than the GQL endpoint expects.  Ads are
    // controlled by passing oauth_token to the usher URL instead.
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
              ...baseGqlHeaders,
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

    if (!gqlRes.ok) {
      throw new Error(`Twitch GQL error: ${gqlRes.status}`);
    }

    const gqlData = await gqlRes.json();

    // Surface GQL-level errors before checking for token data.
    if (Array.isArray(gqlData?.errors) && gqlData.errors.length > 0) {
      const msg = gqlData.errors
        .map((e: { message?: string }) => e.message)
        .join("; ");
      console.error("Twitch GQL errors:", gqlData.errors);
      throw new Error(`Twitch GQL returned errors: ${msg}`);
    }

    const tokenData = gqlData?.data?.streamPlaybackAccessToken;

    if (!tokenData?.value || !tokenData?.signature) {
      return new Response(
        JSON.stringify({ error: "Stream not available or channel is offline" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    // Fetch the master playlist from Twitch's CDN using the token we just got.
    const usherParams = new URLSearchParams({
      client_id: GQL_CLIENT_ID,
      token: tokenData.value,
      sig: tokenData.signature,
      allow_source: "true",
      allow_audio_only: "true",
      allow_spectre: "false",
      fast_bread: "true",
      p: String(Math.floor(Math.random() * 999999)),
    });

    // Pass the user's OAuth token so Twitch can identify the viewer and skip
    // ads for subscribers / Turbo users.
    if (twitchToken) {
      usherParams.set("oauth_token", twitchToken);
    }

    const usherUrl = `https://usher.ttvnw.net/api/channel/hls/${encodeURIComponent(channel)}.m3u8?${usherParams}`;
    const masterRes = await fetch(usherUrl);

    if (!masterRes.ok) {
      if (masterRes.status === 404) {
        return new Response(
          JSON.stringify({ error: "Channel is offline or does not exist" }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`Usher fetch failed: ${masterRes.status}`);
    }

    const masterText = await masterRes.text();

    // Parse all quality variants from the HLS master playlist.
    // #EXT-X-MEDIA:TYPE=VIDEO lines carry the human-readable quality name.
    // #EXT-X-STREAM-INF lines reference a VIDEO group-id; the next line is the URL.
    const masterLines = masterText.split("\n");

    // Build GROUP-ID → display name map
    const nameMap = new Map<string, string>();
    for (const line of masterLines) {
      if (line.startsWith("#EXT-X-MEDIA:TYPE=VIDEO")) {
        const groupId = line.match(/GROUP-ID="([^"]+)"/)?.[1];
        const name = line.match(/NAME="([^"]+)"/)?.[1];
        if (groupId && name) nameMap.set(groupId, name);
      }
    }

    // Pair each #EXT-X-STREAM-INF with its variant URL
    const qualities: Array<{ label: string; url: string }> = [];
    for (let i = 0; i < masterLines.length; i++) {
      if (masterLines[i].startsWith("#EXT-X-STREAM-INF:")) {
        const videoGroup = masterLines[i].match(/VIDEO="([^"]+)"/)?.[1];
        const variantUrl = masterLines[i + 1]?.trim();
        if (variantUrl?.startsWith("http")) {
          const label =
            (videoGroup && nameMap.get(videoGroup)) ?? videoGroup ?? "unknown";
          // Route the variant playlist through our server-side proxy.
          // *.playlist.ttvnw.net URLs are IP-locked to the server that
          // requested the access token — fetching them from the browser
          // results in a 403. The proxy re-fetches server-side and rewrites
          // relative segment URLs to absolute CDN URLs so HLS.js can pull
          // the actual .ts segments directly without any proxy overhead.
          const proxied = `/api/hls-proxy?url=${encodeURIComponent(variantUrl)}`;
          qualities.push({ label, url: proxied });
        }
      }
    }

    if (qualities.length === 0) {
      return new Response(
        JSON.stringify({ error: "Could not parse master playlist" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // Sort highest resolution first, audio_only last.
    // Labels look like "1080p60 (source)", "720p60", "480p30", "audio_only".
    const qualityRank = (label: string): number => {
      if (label === "audio_only") return -1;
      const match = label.match(/^(\d+)p/);
      return match ? parseInt(match[1], 10) : 0;
    };
    qualities.sort((a, b) => qualityRank(b.label) - qualityRank(a.label));

    // The user's OAuth token is sent to the usher endpoint so Twitch can
    // identify the viewer and skip ads for subscribers / Turbo users.
    const authenticated = !!twitchToken;

    // Return all qualities to the browser.
    // Variant playlist URLs (*.playlist.ttvnw.net) are IP-locked to the server
    // that requested the GQL access token, so they are routed through
    // /api/hls-proxy. The proxy re-fetches them server-side and rewrites any
    // relative URLs to absolute CDN paths. Actual .ts segments on
    // video-weaver.*.hls.twitchsvc.net are not IP-locked, so HLS.js fetches
    // them directly from the CDN without going through the proxy.
    return new Response(JSON.stringify({ qualities, authenticated }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Stream playlist proxy error:", error);
    const isProd = process.env.NODE_ENV === "production";
    const body: any = { error: "Failed to get playlist" };
    if (!isProd) body.details = String(error ?? "");
    return new Response(JSON.stringify(body), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
