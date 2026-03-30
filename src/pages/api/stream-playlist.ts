import type { APIRoute } from "astro";

// Prefer an explicit env var; fall back to the well-known Twitch web client ID.
const GQL_CLIENT_ID =
  import.meta.env.TWITCH_GQL_CLIENT_ID ?? "kimne78kx3ncx6brgo4mv6wki5h1ko";

export const GET: APIRoute = async ({ url }) => {
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
    const gqlRes = await fetch("https://gql.twitch.tv/gql", {
      method: "POST",
      headers: {
        "Client-ID": GQL_CLIENT_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        operationName: "PlaybackAccessToken",
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash:
              "0828119ded1c13477966434e15800ff57ddacf13ba1911c129dc2200705b0712",
          },
        },
        variables: {
          isLive: true,
          login: channel,
          isVod: false,
          vodID: "",
          playerType: "embed",
        },
      }),
    });

    if (!gqlRes.ok) {
      throw new Error(`Twitch GQL error: ${gqlRes.status}`);
    }

    const gqlData = await gqlRes.json();
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

    // The master playlist lists qualities from best to worst, so the first URL is source quality.
    const masterLines = masterText.split("\n");
    let bestVariantUrl = "";
    for (const line of masterLines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("http")) {
        bestVariantUrl = trimmed;
        break;
      }
    }

    if (!bestVariantUrl) {
      return new Response(
        JSON.stringify({ error: "Could not parse master playlist" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // Fetch the quality-specific sub-playlist. This one contains the actual .ts segment URLs.
    const variantRes = await fetch(bestVariantUrl);
    if (!variantRes.ok) {
      throw new Error(`Variant playlist fetch failed: ${variantRes.status}`);
    }

    const variantText = await variantRes.text();

    // Rewrite every segment URL to go through our proxy so the browser
    // doesn't run into CORS issues when HLS.js fetches the video chunks.
    const rewrittenVariant = variantText
      .split("\n")
      .map((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("http")) {
          return `/api/stream-segment?url=${encodeURIComponent(trimmed)}`;
        }
        return line;
      })
      .join("\n");

    return new Response(rewrittenVariant, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Access-Control-Allow-Origin": "*",
        // Tell HLS.js to always re-fetch — this is a live stream
        "Cache-Control": "no-cache, no-store",
      },
    });
  } catch (error) {
    console.error("Stream playlist proxy error:", error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Failed to get playlist",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
