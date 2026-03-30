import type { APIRoute } from "astro";
import { getInnertube } from "../../lib/youtube";

// Simple in-memory cache to save on InnerTube calls
const liveVideoCache = new Map<string, { videoId: string | null; expires: number }>();
const LIVE_CACHE_TTL = 1000 * 60 * 5; // 5 minutes

export const GET: APIRoute = async ({ url, cookies }) => {
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

    // Resolve the URL to get the channel ID/endpoint
    let channelId = channelUrl;
    console.log(`[YouTube Live] Looking up channel: ${channelUrl}`);
    if (channelUrl.includes('youtube.com') || channelUrl.includes('youtu.be')) {
      try {
        const endpoint = await (yt as any).resolveURL(channelUrl);
        console.log(`[YouTube Live] Resolved URL to endpoint:`, endpoint?.payload);
        if (endpoint?.payload?.browseId) {
          channelId = endpoint.payload.browseId;
          console.log(`[YouTube Live] Using channel ID: ${channelId}`);
        }
      } catch (urlError) {
        console.warn('Failed to resolve URL, will try direct lookup:', urlError);
      }
    }

    // Use getChannel with the resolved ID
    const channel = await yt.getChannel(channelId);
    console.log(`[YouTube Live] Retrieved channel info`);

    // Check if the channel is currently live
    const liveStreams = await (channel as any).getLiveStreams();
    console.log(`[YouTube Live] getLiveStreams returned:`, {
      hasVideos: !!liveStreams.videos,
      videoCount: liveStreams.videos?.length || 0,
    });
    let videoId = liveStreams.videos && liveStreams.videos.length > 0 ? liveStreams.videos[0].id : null;
    
    // If getLiveStreams didn't find anything, try checking the home tab
    if (!videoId) {
      console.log(`[YouTube Live] No live streams found via getLiveStreams, trying home feed...`);
      try {
        const home = await (channel as any).getHome();
        if (home?.contents) {
          // Look for a live stream section in the home feed
          const sections = home.contents.tabContents?.sectionListRenderer?.contents || [];
          for (const section of sections) {
            const items = section.itemSectionRenderer?.contents || [];
            for (const item of items) {
              if (item.videoRenderer?.isLiveContent || item.videoRenderer?.badges?.some((b: any) => b.metadataBadgeRenderer?.label === 'LIVE')) {
                videoId = item.videoRenderer?.videoId;
                if (videoId) {
                  console.log(`[YouTube Live] Found live video in home feed: ${videoId}`);
                  break;
                }
              }
            }
            if (videoId) break;
          }
        }
      } catch (homeError) {
        console.warn('[YouTube Live] Failed to check home feed:', homeError);
      }
    }
    console.log(`[YouTube Live] Final videoId: ${videoId}`);

    liveVideoCache.set(channelUrl, { videoId, expires: now + LIVE_CACHE_TTL });

    // Try to get channel ID from metadata or basic_info
    const returnChannelId = (channel as any).basic_info?.id || (channel as any).header?.author?.id || "";

    return new Response(JSON.stringify({ videoId, channelId: returnChannelId }), {
      status: 200,
      headers,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("youtube-live API error:", {
      message: errorMessage,
      stack: errorStack,
      channelUrl: url.searchParams.get("channelUrl"),
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
