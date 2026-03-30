import type { APIRoute } from "astro";
import { getInnertube } from "../../lib/youtube";
import { checkRateLimit } from "../../lib/rateLimit";

// Simple in-memory cache to save on InnerTube calls
const liveVideoCache = new Map<string, { videoId: string | null; expires: number }>();
const LIVE_CACHE_TTL = 1000 * 60 * 5; // 5 minutes

export const GET: APIRoute = async ({ url, cookies, clientAddress }) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=60",
  };

  if (!checkRateLimit(`${clientAddress}:youtube-live`, 30, 60_000)) {
    return new Response(
      JSON.stringify({ error: "Too many requests" }),
      { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "60" } },
    );
  }

  try {
    const channelUrl = url.searchParams.get("channelUrl");

    if (!channelUrl) {
      return new Response(
        JSON.stringify({ error: "channelUrl parameter is required" }),
        { status: 400, headers },
      );
    }

    // Require authentication — prevents unauthenticated callers from triggering
    // Innertube requests on the server.
    const accessToken = cookies.get("youtube_token")?.value;
    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "Not authenticated" }),
        { status: 401, headers },
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

    /** Returns true if a video object from youtubei.js is currently live */
    function isActuallyLive(video: any): boolean {
      if (video.is_live === true) return true;
      // Some builds expose it under thumbnailOverlays or badges
      const badges: any[] = video.badges ?? [];
      if (badges.some((b: any) =>
        b?.metadataBadgeRenderer?.label === 'LIVE' ||
        b?.liveBadge != null
      )) return true;
      // thumbnailOverlays array (compact video renderers)
      const overlays: any[] = video.thumbnailOverlays ?? [];
      if (overlays.some((o: any) =>
        o?.thumbnailOverlayTimeStatusRenderer?.style === 'LIVE'
      )) return true;
      return false;
    }

    let videoId: string | null = null;

    // 1. Try getLiveStreams() — filter to only currently-live videos
    try {
      const liveStreams = await (channel as any).getLiveStreams();
      const videos: any[] = liveStreams?.videos ?? [];
      console.log(`[YouTube Live] getLiveStreams returned ${videos.length} video(s)`);
      const liveVideo = videos.find((v: any) => isActuallyLive(v));
      if (liveVideo) {
        videoId = liveVideo.id ?? liveVideo.videoId ?? null;
        console.log(`[YouTube Live] Found live video via getLiveStreams: ${videoId}`);
      } else if (videos.length > 0) {
        // Fallback: take the first result even if we can't confirm live status
        // (some youtubei.js builds don't expose is_live)
        videoId = videos[0].id ?? videos[0].videoId ?? null;
        console.log(`[YouTube Live] getLiveStreams: taking first result (live status unknown): ${videoId}`);
      }
    } catch (liveStreamsError) {
      console.warn('[YouTube Live] getLiveStreams failed:', liveStreamsError);
    }

    // 2. If no result, try the Videos tab and look for a live indicator
    if (!videoId) {
      console.log('[YouTube Live] No result from getLiveStreams, trying getVideos...');
      try {
        const videosTab = await (channel as any).getVideos();
        const videos: any[] = videosTab?.videos ?? [];
        const liveVideo = videos.find((v: any) => isActuallyLive(v));
        if (liveVideo) {
          videoId = liveVideo.id ?? liveVideo.videoId ?? null;
          console.log(`[YouTube Live] Found live video in Videos tab: ${videoId}`);
        }
      } catch (videosError) {
        console.warn('[YouTube Live] getVideos failed:', videosError);
      }
    }

    // 3. Last resort — check the channel home tab, walk all renderers recursively
    if (!videoId) {
      console.log('[YouTube Live] Trying home feed as last resort...');
      try {
        const home = await (channel as any).getHome();

        /** Recursively walk any object/array looking for a live videoRenderer */
        function findLiveInTree(node: any, depth = 0): string | null {
          if (!node || typeof node !== 'object' || depth > 8) return null;
          if (Array.isArray(node)) {
            for (const item of node) {
              const found = findLiveInTree(item, depth + 1);
              if (found) return found;
            }
            return null;
          }
          // videoRenderer with live badge
          const vr = node.videoRenderer;
          if (vr) {
            const vid = vr.videoId as string | undefined;
            if (vid && (
              vr.isLiveContent === true ||
              (vr.badges ?? []).some((b: any) => b?.metadataBadgeRenderer?.label === 'LIVE') ||
              (vr.thumbnailOverlays ?? []).some((o: any) =>
                o?.thumbnailOverlayTimeStatusRenderer?.style === 'LIVE'
              )
            )) {
              return vid;
            }
          }
          // Walk all values
          for (const val of Object.values(node)) {
            const found = findLiveInTree(val, depth + 1);
            if (found) return found;
          }
          return null;
        }

        const found = findLiveInTree(home?.contents);
        if (found) {
          videoId = found;
          console.log(`[YouTube Live] Found live video in home feed: ${videoId}`);
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
