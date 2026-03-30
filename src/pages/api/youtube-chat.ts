import type { APIRoute } from "astro";
import { getInnertube } from "../../lib/youtube";

//Sends a message to a YouTube live chat using YouTube.js (Innertube)
export const POST: APIRoute = async ({ request }) => {
  const headers = { "Content-Type": "application/json" };

  try {
    const body = await request.json();
    const { videoId, message, accessToken } = body as {
      videoId?: string;
      message?: string;
      accessToken?: string;
    };

    if (!videoId || !message || !accessToken) {
      return new Response(
        JSON.stringify({
          error: "videoId, message, and accessToken are required",
        }),
        { status: 400, headers },
      );
    }

    const yt = await getInnertube();

    // Update session credentials for this request
    // This allows us to use an existing accessToken from the client
    (yt.session as any).signIn({
      access_token: accessToken,
      refresh_token: '', // Not needed for a one-off send
      expiry_date: new Date(Date.now() + 3600 * 1000).toISOString()
    });

    const info = await yt.getInfo(videoId);
    const liveChat = info.getLiveChat();

    const response = await liveChat.sendMessage(message);

    if (!response) {
      return new Response(JSON.stringify({ error: "Failed to send message" }), {
        status: 500,
        headers,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("youtube-chat API error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      { status: 500, headers },
    );
  }
};
