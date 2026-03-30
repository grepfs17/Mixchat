import type { APIRoute } from "astro";
import { getInnertube } from "../../lib/youtube";

// Simple in-memory cache to save on InnerTube calls
const liveVideoCache = new Map<string, { videoId: string | null; expires: number }>();
const LIVE_CACHE_TTL = 1000 * 60 * 5; // 5 minutes

export const GET: APIRoute = async ({ url }) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=60",
  };

  try {
    const channelUrl = url.searchParams.get("channelUrl");

    if (!channelUrl) {
      return new Response(
        JSON.stringify({ error: "channelUrl parameter is required" }),
        { status: 400, headers },
      );
    }

    // Check cache
    const now = Date.now();
    const cached = liveVideoCache.get(channelUrl);
    if (cached && cached.expires > now) {
      return new Response(JSON.stringify({ videoId: cached.videoId }), { status: 200, headers });
    }

    const yt = await getInnertube();

    // Use getChannel which handles handles, URLs, and IDs
    const channel = await yt.getChannel(channelUrl);

    // Check if the channel is currently live
    const liveStreams = await (channel as any).getLiveStreams();
    const videoId = liveStreams.videos && liveStreams.videos.length > 0 ? liveStreams.videos[0].id : null;

    liveVideoCache.set(channelUrl, { videoId, expires: now + LIVE_CACHE_TTL });

    // Try to get channel ID from metadata or basic_info
    const channelId = (channel as any).basic_info?.id || (channel as any).header?.author?.id || "";

    return new Response(JSON.stringify({ videoId, channelId }), {
      status: 200,
      headers,
    });

  } catch (error) {
    console.error("youtube-live API error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      { status: 500, headers },
    );
  }
};
