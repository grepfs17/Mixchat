import type { APIRoute } from "astro";

/**
 * POST /api/youtube-chat
 *
 * Sends a message to a YouTube live chat.
 *
 * Body (JSON):
 *   videoId      - YouTube video ID of the live stream
 *   message      - Text message to send
 *   accessToken  - YouTube OAuth2 access token (user must have granted live-chat scope)
 */
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

    const apiKey = import.meta.env.PUBLIC_YOUTUBE_API_KEY;

    // 1. Get the liveChatId from the video
    const liveChatResult = await getLiveChatId(videoId, accessToken, apiKey);
    if (!liveChatResult.liveChatId) {
      console.error("getLiveChatId failed:", liveChatResult.debugInfo);
      return new Response(
        JSON.stringify({
          error:
            liveChatResult.debugInfo ||
            "Could not find live chat for this video. The stream may not be live.",
        }),
        { status: 422, headers },
      );
    }

    const liveChatId = liveChatResult.liveChatId;

    // 2. Send the message
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
      const errData = await sendRes.json().catch(() => ({}));
      const errMsg =
        errData?.error?.message || `YouTube API error: ${sendRes.status}`;
      console.error("YouTube send message error:", errData);
      return new Response(JSON.stringify({ error: errMsg }), {
        status: sendRes.status,
        headers,
      });
    }

    const result = await sendRes.json();
    return new Response(JSON.stringify({ success: true, id: result.id }), {
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

/**
 * Resolve the liveChatId for a given YouTube video.
 * Uses the API key for video lookup (public data), falls back to access token.
 */
async function getLiveChatId(
  videoId: string,
  accessToken: string,
  apiKey?: string,
): Promise<{ liveChatId: string | null; debugInfo: string }> {
  // Try with API key first (more reliable for public video data), then fall back to OAuth token
  const urlBase = `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${encodeURIComponent(videoId)}`;

  let res: Response;
  if (apiKey) {
    res = await fetch(`${urlBase}&key=${apiKey}`);
  } else {
    res = await fetch(urlBase, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    return {
      liveChatId: null,
      debugInfo: `YouTube videos.list returned ${res.status}: ${errBody.slice(0, 200)}`,
    };
  }

  const data = await res.json();

  if (!data.items || data.items.length === 0) {
    return {
      liveChatId: null,
      debugInfo: `No video found for ID "${videoId}". The video may not exist or may be private.`,
    };
  }

  const liveDetails = data.items[0]?.liveStreamingDetails;
  if (!liveDetails) {
    return {
      liveChatId: null,
      debugInfo: `Video "${videoId}" has no liveStreamingDetails. It may not be a live stream.`,
    };
  }

  const chatId = liveDetails.activeLiveChatId;
  if (!chatId) {
    return {
      liveChatId: null,
      debugInfo: `Video "${videoId}" has liveStreamingDetails but no activeLiveChatId. The stream may have ended.`,
    };
  }

  return { liveChatId: chatId, debugInfo: "" };
}
