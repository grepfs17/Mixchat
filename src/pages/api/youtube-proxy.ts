import type { APIRoute } from "astro";
import { getInnertube } from "../../lib/youtube";
import { checkRateLimit } from "../../lib/rateLimit";

/**
 * Server-side proxy for YouTube Innertube operations.
 *
 * Purpose: Keep YouTube access tokens secure in httpOnly cookies rather than
 * exposing them in client-side queries. This endpoint reads the token from the
 * httpOnly "youtube_token" cookie and uses it to authenticate Innertube requests.
 *
 * Usage: GET /api/youtube-proxy?action=getLiveVideo&channelUrl=https://youtube.com/@channel
 *        GET /api/youtube-proxy?action=getChatMessages&videoId=dQw4w9WgXcQ
 */
export const GET: APIRoute = async ({ url, cookies, clientAddress }) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=60",
  };

  if (!checkRateLimit(`${clientAddress}:youtube-proxy`, 60, 60_000)) {
    return new Response(
      JSON.stringify({ error: "Too many requests" }),
      { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "60" } },
    );
  }

  try {
    const action = url.searchParams.get("action");

    if (!action) {
      return new Response(
        JSON.stringify({ error: "action parameter is required" }),
        { status: 400, headers },
      );
    }

    // Validate the action against an allowlist.
    const ALLOWED_ACTIONS = new Set(["getLiveVideo", "getChannelInfo"]);
    if (!ALLOWED_ACTIONS.has(action)) {
      return new Response(
        JSON.stringify({ error: `Unknown action: ${action}` }),
        { status: 400, headers },
      );
    }

    // Read the access token from the httpOnly cookie if present.
    // Note: public lookups (getLiveVideo, getChannelInfo) do not strictly
    // require authentication. Allow unauthenticated requests so clients can
    // still resolve public channel/video info without having a cookie set.
    const accessToken = cookies.get("youtube_token")?.value;
    if (!accessToken) {
      console.debug('[YouTube Proxy] No youtube_token cookie present — proceeding unauthenticated');
    }

    const yt = await getInnertube();

    // Route to appropriate handler
    if (action === "getLiveVideo") {
      return await handleGetLiveVideo(url, yt);
    } else if (action === "getChannelInfo") {
      return await handleGetChannelInfo(url, yt);
    } else {
      return new Response(
        JSON.stringify({ error: `Unknown action: ${action}` }),
        { status: 400, headers },
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("[YouTube Proxy] Error:", {
      message: errorMessage,
      stack: errorStack,
    });
    return new Response(
      JSON.stringify({
        error: import.meta.env.MODE === 'development' ? errorMessage : "YouTube proxy request failed",
        details: import.meta.env.MODE === 'development' ? errorStack : undefined,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};

//Get the live video for a YouTube channel
async function handleGetLiveVideo(url: URLSearchParams | URL, yt: any) {
  const channelUrl = url instanceof URLSearchParams ? null : url.searchParams.get("channelUrl");
  const channelUrlParam = channelUrl || (url instanceof URL ? url.searchParams.get("channelUrl") : url.get("channelUrl"));

  if (!channelUrlParam) {
    return new Response(
      JSON.stringify({ error: "channelUrl parameter is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Validate that channelUrl is actually a YouTube URL/handle/channel ID.
  const isYouTubeUrl =
    /^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(channelUrlParam) ||
    /^UC[\w-]{22}$/.test(channelUrlParam) ||
    /^@[\w.]{1,100}$/.test(channelUrlParam);
  if (!isYouTubeUrl) {
    return new Response(
      JSON.stringify({ error: "Invalid channelUrl" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  let channelId = channelUrlParam;
  console.log(`[YouTube Proxy] Looking up channel: ${channelUrlParam}`);

  const isFullUrl = channelUrlParam.includes('youtube.com') || channelUrlParam.includes('youtu.be');

  if (isFullUrl) {
    try {
      const endpoint = await (yt as any).resolveURL(channelUrlParam);
      if (endpoint?.payload?.browseId) {
        channelId = endpoint.payload.browseId;
        console.log(`[YouTube Proxy] Resolved channel ID: ${channelId}`);
      } else {
        return new Response(
          JSON.stringify({ error: "Could not resolve YouTube URL" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
    } catch (urlError) {
      console.warn('[YouTube Proxy] Failed to resolve URL:', urlError);
      return new Response(
        JSON.stringify({ error: "Failed to resolve YouTube URL" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  const channel = await yt.getChannel(channelId);
  console.log(`[YouTube Proxy] Retrieved channel info`);

  // Check if the channel is currently live
  const liveStreams = await (channel as any).getLiveStreams();
  let videoId = liveStreams.videos && liveStreams.videos.length > 0 ? liveStreams.videos[0].id : null;

  // If getLiveStreams didn't find anything, try checking the home tab
  if (!videoId) {
    console.log(`[YouTube Proxy] No live streams found, checking home feed...`);
    try {
      const home = await (channel as any).getHome();
      if (home?.contents) {
        const sections = home.contents.tabContents?.sectionListRenderer?.contents || [];
        for (const section of sections) {
          const items = section.itemSectionRenderer?.contents || [];
          for (const item of items) {
            if (item.videoRenderer?.isLiveContent || item.videoRenderer?.badges?.some((b: any) => b.metadataBadgeRenderer?.label === 'LIVE')) {
              videoId = item.videoRenderer?.videoId;
              if (videoId) {
                console.log(`[YouTube Proxy] Found live video: ${videoId}`);
                break;
              }
            }
          }
          if (videoId) break;
        }
      }
    } catch (homeError) {
      console.warn('[YouTube Proxy] Failed to check home feed:', homeError);
    }
  }

  const returnChannelId = (channel as any).basic_info?.id || (channel as any).header?.author?.id || "";

  return new Response(JSON.stringify({ videoId, channelId: returnChannelId }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}


async function handleGetChannelInfo(url: URLSearchParams | URL, yt: any) {
  const channelUrl = url instanceof URLSearchParams ? null : url.searchParams.get("channelUrl");
  const channelUrlParam = channelUrl || (url instanceof URL ? url.searchParams.get("channelUrl") : url.get("channelUrl"));

  if (!channelUrlParam) {
    return new Response(
      JSON.stringify({ error: "channelUrl parameter is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Validate that channelUrl is actually a YouTube URL/handle/channel ID.
  const isYouTubeUrl =
    /^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(channelUrlParam) ||
    /^UC[\w-]{22}$/.test(channelUrlParam) ||
    /^@[\w.]{1,100}$/.test(channelUrlParam);
  if (!isYouTubeUrl) {
    return new Response(
      JSON.stringify({ error: "Invalid channelUrl" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  let channelId = channelUrlParam;

  const isFullUrl = channelUrlParam.includes('youtube.com') || channelUrlParam.includes('youtu.be');

  if (isFullUrl) {
    try {
      const endpoint = await (yt as any).resolveURL(channelUrlParam);
      if (endpoint?.payload?.browseId) {
        channelId = endpoint.payload.browseId;
      } else {
        return new Response(
          JSON.stringify({ error: "Could not resolve YouTube URL" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
    } catch (urlError) {
      console.warn('[YouTube Proxy] Failed to resolve URL:', urlError);
      return new Response(
        JSON.stringify({ error: "Failed to resolve YouTube URL" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  const channel = await yt.getChannel(channelId);
  const basicInfo = (channel as any).basic_info || {};
  const headerInfo = (channel as any).header?.author || {};

  return new Response(
    JSON.stringify({
      channelId: basicInfo.id || headerInfo.id || "",
      displayName: basicInfo.title || headerInfo.title || "",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
