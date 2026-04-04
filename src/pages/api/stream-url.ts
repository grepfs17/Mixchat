import type { APIRoute } from "astro";
import { checkRateLimit } from "../../lib/rateLimit";

// We get this key from the environmemnt but it is a public key
const GQL_CLIENT_ID = import.meta.env.TWITCH_GQL_CLIENT_ID;
if (!GQL_CLIENT_ID) {
  throw new Error(
    "TWITCH_GQL_CLIENT_ID environment variable is required. " +
    "Set it in your .env file.",
  );
}

export const GET: APIRoute = async ({ url, cookies, clientAddress }) => {
  // Require an active session — prevents open-proxy abuse of this endpoint.
  const twitchToken = cookies.get("twitch_token")?.value;
  const youtubeToken = cookies.get("youtube_token")?.value;
  if (!twitchToken && !youtubeToken) {
    return new Response(
      JSON.stringify({ error: "Authentication required" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!checkRateLimit(`${clientAddress}:stream-url`, 30, 60_000)) {
    return new Response(
      JSON.stringify({ error: "Too many requests" }),
      { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "60" } },
    );
  }

  try {
    const channel = url.searchParams.get("channel");

    if (!channel) {
      return new Response(
        JSON.stringify({ error: "Channel parameter required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Fetch only the playback access token from Twitch GQL (server-side).
    // We do NOT fetch the CDN playlist URL here — that must be done by the
    // browser so that the CDN token is bound to the client's IP, not ours.
    const gqlRes = await fetch("https://gql.twitch.tv/gql", {
      method: "POST",
      headers: {
        "Client-ID": GQL_CLIENT_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        operationName: "PlaybackAccessToken_Template",
        query: `query PlaybackAccessToken_Template($login: String!, $isLive: Boolean!, $vodID: ID!, $isVod: Boolean!, $playerType: String!) {
  streamPlaybackAccessToken(channelName: $login, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isLive) {
    value
    signature
    __typename
  }
  videoPlaybackAccessToken(id: $vodID, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isVod) {
    value
    signature
    __typename
  }
}`,
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

    // Surface GQL-level errors before checking for token data.
    if (Array.isArray(gqlData?.errors) && gqlData.errors.length > 0) {
      const msg = gqlData.errors.map((e: { message?: string }) => e.message).join("; ");
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

    // Return the token & sig to the client.
    // The browser will construct the usher.ttvnw.net URL itself so all CDN
    // segment requests originate from the correct client IP (fixing 403s).
    return new Response(
      JSON.stringify({
        success: true,
        token: tokenData.value,
        sig: tokenData.signature,
        clientId: GQL_CLIENT_ID,
        channel,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Stream URL error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to get stream URL" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
