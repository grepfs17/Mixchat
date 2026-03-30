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
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Failed to get stream URL",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
