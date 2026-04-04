import type { APIRoute } from "astro";
import { checkRateLimit } from "../../lib/rateLimit";

/**
 * Sends a message to a YouTube live chat using the YouTube Data API v3.

 * We deliberately avoid YouTube.js for sending messages because its
 * `session.signIn()` expects its own internal OAuth flow and it wouldn't let us use
 * the httpOnly cookie.
 */
export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  if (!checkRateLimit(`${clientAddress}:youtube-chat`, 20, 60_000)) {
    return new Response(
      JSON.stringify({ error: "Too many requests" }),
      { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "60" } },
    );
  }

  const headers = { "Content-Type": "application/json" };

  try {
    const body = await request.json();
    const { videoId, message } = body as {
      videoId?: string;
      message?: string;
    };

    if (!videoId || !message) {
      return new Response(
        JSON.stringify({ error: "videoId and message are required" }),
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

    // Step 1: Get the liveChatId for this video via the Data API
    const videoRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${encodeURIComponent(videoId)}&key=${import.meta.env.YOUTUBE_API_KEY || ''}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!videoRes.ok) {
      const err = await videoRes.text();
      console.error("[YouTube Chat] Failed to fetch video details:", videoRes.status, err);
      return new Response(
        JSON.stringify({ error: "Failed to fetch video details" }),
        { status: videoRes.status, headers },
      );
    }

    const videoData = await videoRes.json();
    const liveChatId =
      videoData.items?.[0]?.liveStreamingDetails?.activeLiveChatId;

    if (!liveChatId) {
      return new Response(
        JSON.stringify({ error: "This video does not have an active live chat" }),
        { status: 400, headers },
      );
    }

    // Step 2: Send the message via liveChatMessages.insert
    const sendRes = await fetch(
      "https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          snippet: {
            liveChatId,
            type: "textMessageEvent",
            textMessageDetails: {
              messageText: message,
            },
          },
        }),
      },
    );

    if (!sendRes.ok) {
      const err = await sendRes.text();
      console.error("[YouTube Chat] Failed to send message:", sendRes.status, err);
      console.error("[YouTube Chat] Google API error details:", err);
      return new Response(
        JSON.stringify({
          error: `Failed to send message: ${sendRes.status}`,
        }),
        { status: sendRes.status, headers },
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("youtube-chat API error:", {
      message: errorMessage,
      stack: errorStack,
    });
    return new Response(
      JSON.stringify({
        error: errorMessage,
        details:
          import.meta.env.MODE === "development" ? errorStack : undefined,
      }),
      { status: 500, headers },
    );
  }
};
