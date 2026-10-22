import type { APIRoute } from "astro";
import { checkRateLimit } from "../../lib/rateLimit";
import {
  findLiveForChannel,
  isValidYouTubeParam,
} from "../../lib/youtube-lookup";
import { IS_TWITCH_ONLY, twitchOnlyResponse } from "../../lib/constants";

// Simple in-memory cache to save on Innertube calls
const liveVideoCache = new Map<
  string,
  { videoId: string | null; channelId?: string; expires: number }
>();
const LIVE_CACHE_TTL = 1000 * 60 * 5;

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of liveVideoCache) {
    if (now > entry.expires) liveVideoCache.delete(key);
  }
}, 120_000);
const DEBUG_YT =
  process.env.YT_DEBUG === "1" || import.meta.env?.MODE === "development";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=60",
};
const RATE_LIMIT_HEADERS = { "Content-Type": "application/json", "Retry-After": "60" };

export const GET: APIRoute = async ({ request, url }) => {
  if (IS_TWITCH_ONLY) return twitchOnlyResponse();

  const clientAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  if (!checkRateLimit(`${clientAddress}:youtube-live`, 60, 60_000)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: RATE_LIMIT_HEADERS,
    });
  }

  try {
    const channelUrl = url.searchParams.get("channelUrl");
    if (!channelUrl) {
      return new Response(
        JSON.stringify({ error: "channelUrl parameter is required" }),
        { status: 400, headers: JSON_HEADERS },
      );
    }

    if (!isValidYouTubeParam(channelUrl)) {
      return new Response(JSON.stringify({ error: "Invalid channelUrl" }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const now = Date.now();
    const cached = liveVideoCache.get(channelUrl);
    if (cached && cached.expires > now) {
      if (DEBUG_YT)
        console.debug(
          `[YouTube Live] Returning cached live video for ${channelUrl}: ${cached.videoId}`,
        );
      return new Response(
        JSON.stringify({
          videoId: cached.videoId,
          channelId: cached.channelId || "",
        }),
        { status: 200, headers: JSON_HEADERS },
      );
    }

    const result = await findLiveForChannel(channelUrl, { debug: DEBUG_YT });
    // Only cache successful lookups. Null results should not block retries
    if (result.videoId) {
      liveVideoCache.set(channelUrl, {
        videoId: result.videoId,
        channelId: result.channelId || "",
        expires: Date.now() + LIVE_CACHE_TTL,
      });
    }

    return new Response(
      JSON.stringify({
        videoId: result.videoId,
        channelId: result.channelId || "",
      }),
      { status: 200, headers: JSON_HEADERS },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("youtube-live API error:", {
      message: errorMessage,
      stack: errorStack,
      action: "getLiveVideo",
      channelUrl: url.searchParams.get("channelUrl"),
    });
    return new Response(
      JSON.stringify({
        error: DEBUG_YT ? errorMessage : "Failed to look up live video",
        details: DEBUG_YT ? errorStack : undefined,
      }),
      { status: 500, headers: JSON_HEADERS },
    );
  }
};
