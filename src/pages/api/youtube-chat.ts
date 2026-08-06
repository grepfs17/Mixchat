import type { APIRoute } from "astro";
import { checkRateLimit } from "../../lib/rateLimit";
import { googleFetch } from "../../lib/google";
import {
  resolveActiveLiveChatId,
  invalidateLiveChatId,
} from "../../lib/youtubeLiveChat";
import { IS_TWITCH_ONLY, twitchOnlyResponse } from "../../lib/constants";

/**
 * Sends a message to a YouTube live chat using the YouTube Data API v3.
 *
 * We deliberately avoid YouTube.js for sending messages because its
 * `session.signIn()` expects its own internal OAuth flow and it wouldn't let us use
 * the httpOnly cookie.
 */
const JSON_HEADERS = { "Content-Type": "application/json" };

export const POST: APIRoute = async ({ request, cookies }) => {
  if (IS_TWITCH_ONLY) return twitchOnlyResponse();

  const clientAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  if (!checkRateLimit(`${clientAddress}:youtube-chat`, 20, 60_000)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "60" },
    });
  }

  try {
    const body = await request.json();
    const { videoId, message } = body as {
      videoId?: string;
      message?: string;
    };

    if (!videoId || !message) {
      return new Response(
        JSON.stringify({ error: "videoId and message are required" }),
        { status: 400, headers: JSON_HEADERS },
      );
    }

    const accessToken = cookies.get("youtube_token")?.value;
    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: JSON_HEADERS,
      });
    }

    const liveChatId = await resolveActiveLiveChatId(videoId, accessToken);
    if (!liveChatId) {
      return new Response(
        JSON.stringify({
          error: "This video does not have an active live chat",
        }),
        { status: 400, headers: JSON_HEADERS },
      );
    }

    try {
      await googleFetch(
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
        { action: "liveChatMessages.insert", videoId, liveChatId },
      );
    } catch (e: any) {
      const status = e?.status || 500;
      console.error("[YouTube Chat] Failed to send message:", e);

      if (status === 404 || status === 400) {
        invalidateLiveChatId(videoId);
        console.warn(
          `[YouTube Chat] Invalidated liveChatId cache for ${videoId} due to ${status}`,
        );
      }

      return new Response(
        JSON.stringify({
          error: `Failed to send message: ${status}`,
          details:
            import.meta.env.MODE === "development"
              ? (e?.body ?? String(e))
              : undefined,
        }),
        { status, headers: JSON_HEADERS },
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: JSON_HEADERS,
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
        details:
          import.meta.env.MODE === "development" ? errorStack : undefined,
      }),
      { status: 500, headers: JSON_HEADERS },
    );
  }
};
