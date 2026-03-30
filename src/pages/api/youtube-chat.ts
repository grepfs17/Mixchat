import type { APIRoute } from "astro";
import { getInnertube } from "../../lib/youtube";

//Sends a message to a YouTube live chat using YouTube.js (Innertube)
export const POST: APIRoute = async ({ request, cookies }) => {
  const headers = { "Content-Type": "application/json" };

  try {
    const body = await request.json();
    const { videoId, message } = body as {
      videoId?: string;
      message?: string;
    };

    if (!videoId || !message) {
      return new Response(
        JSON.stringify({
          error: "videoId and message are required",
        }),
        { status: 400, headers },
      );
    }

    // Read the access token from the httpOnly cookie
    const accessToken = cookies.get("youtube_token")?.value;
    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "Not authenticated" }),
        { status: 401, headers },
      );
    }

    const yt = await getInnertube();

    // Update session credentials for this request
    try {
      await (yt.session as any).signIn({
        access_token: accessToken,
        expiry_date: Date.now() + 3600 * 1000
      });
    } catch (tokenError) {
      return new Response(
        JSON.stringify({ error: `Invalid YouTube token: ${tokenError instanceof Error ? tokenError.message : 'Unknown error'}` }),
        { status: 401, headers }
      );
    }

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
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("youtube-chat API error:", {
      message: errorMessage,
      stack: errorStack,
    });
    return new Response(
      JSON.stringify({
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? errorStack : undefined,
      }),
      { status: 500, headers },
    );
  }
};
