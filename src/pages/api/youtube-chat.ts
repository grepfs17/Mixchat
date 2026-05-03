import type { APIRoute } from "astro";
import { checkRateLimit } from "../../lib/rateLimit";
import { googleFetch } from "../../lib/google";

// Simple in-memory cache for videoId -> liveChatId to reduce repeated Data API calls.
const liveChatIdCache = new Map<string, { liveChatId: string | null; expires: number }>();
const inflightVideos = new Map<string, Promise<string | null>>();

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

    // Step 1: Resolve the liveChatId for this video.
    // We try InnerTube first (fast, no OAuth needed), then fall back to the
    // Data API (requires OAuth but returns IDs guaranteed compatible with
    // liveChatMessages.insert).
    let liveChatId: string | null = null;
    const now = Date.now();
    const cached = liveChatIdCache.get(videoId);
    if (cached && cached.expires > now) {
      liveChatId = cached.liveChatId;
      console.debug('[YouTube Chat] Using cached liveChatId for', videoId, liveChatId);
    } else {
      if (inflightVideos.has(videoId)) {
        const p = inflightVideos.get(videoId);
        if (p) {
          liveChatId = await p;
        }
      } else {
        const p = (async (): Promise<string | null> => {
          // 1a. Try InnerTube (no auth required)
          try {
            const { getInnertube } = await import("../../lib/youtube");
            const yt = await getInnertube();
            const info = await yt.getInfo(videoId);
            const livechat = info.livechat;
            const id = livechat?.continuation || null;
            if (id) {
              const ttl = 300_000;
              liveChatIdCache.set(videoId, { liveChatId: id, expires: Date.now() + ttl });
              return id;
            }
            console.warn('[YouTube Chat] No liveChatId via InnerTube for', videoId, 'is_live:', info.basic_info.is_live, 'has livechat:', !!livechat);
          } catch (e) {
            console.error('[YouTube Chat] Failed to resolve liveChatId via InnerTube:', e);
          }

          // 1b. Fallback: use Data API videos.list (needs the OAuth token we already have)
          try {
            const data = await googleFetch(
              `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${encodeURIComponent(videoId)}`,
              { headers: { Authorization: `Bearer ${accessToken}` } },
              { action: 'videos.list', videoId },
            );
            const items = data?.items;
            if (items && items.length > 0) {
              const chatId = items[0]?.liveStreamingDetails?.activeLiveChatId;
              if (chatId) {
                const ttl = 300_000;
                liveChatIdCache.set(videoId, { liveChatId: chatId, expires: Date.now() + ttl });
                return chatId;
              }
            }
            console.warn('[YouTube Chat] No liveChatId via Data API for', videoId);
          } catch (e) {
            console.error('[YouTube Chat] Data API videos.list fallback failed:', e);
          }

          liveChatIdCache.set(videoId, { liveChatId: null, expires: Date.now() + 60_000 });
          return null;
        })();
        inflightVideos.set(videoId, p);
        try {
          liveChatId = await p;
        } finally {
          inflightVideos.delete(videoId);
        }
      }
    }

    if (!liveChatId) {
      return new Response(
        JSON.stringify({ error: "This video does not have an active live chat" }),
        { status: 400, headers },
      );
    }

    // Step 2: Send the message via liveChatMessages.insert
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
        { action: 'liveChatMessages.insert', videoId, liveChatId },
      );
    } catch (e: any) {
      const status = e?.status || 500;
      console.error("[YouTube Chat] Failed to send message:", e);

      // If the liveChatId was rejected, invalidate the cache so the next
      // request resolves a fresh ID instead of retrying with a stale one.
      if (status === 404 || status === 400) {
        liveChatIdCache.delete(videoId);
        console.warn(`[YouTube Chat] Invalidated liveChatId cache for ${videoId} due to ${status}`);
      }

      return new Response(
        JSON.stringify({
          error: `Failed to send message: ${status}`,
          details: import.meta.env.MODE === "development" ? e?.body ?? String(e) : undefined,
        }),
        { status, headers },
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
