import type { APIRoute } from "astro";
import { getInnertube } from "../../lib/youtube";
import findLiveForChannel, { isValidYouTubeParam, resolveChannelId } from "../../lib/youtube-lookup";
import { checkRateLimit } from "../../lib/rateLimit";

// Set debug mode when `YT_DEBUG=1` is present or running in dev mode.
const DEBUG_YT = process.env.YT_DEBUG === '1' || import.meta.env?.MODE === 'development';

function getChannelParam(url: URL | URLSearchParams): string | null {
  if (url instanceof URLSearchParams) return url.get("channelUrl");
  return url.searchParams.get("channelUrl");
}

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
    const channelUrl = url.searchParams.get("channelUrl") ?? null;

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
    // Initialize Innertube client with request-scoped diagnostics so failures

    // Initialize Innertube client with request-scoped diagnostics so failures
    // include the action and channel context in server logs.
    let yt: any;
    try {
      yt = await getInnertube();
      console.debug('[YouTube Proxy] Innertube initialized');
    } catch (ytErr) {
      const msg = ytErr instanceof Error ? ytErr.message : String(ytErr);
      const stack = ytErr instanceof Error ? ytErr.stack : undefined;
      console.error('[YouTube Proxy] getInnertube() failed', { message: msg, stack, action, channelUrl });
      return new Response(
        JSON.stringify({
          error: DEBUG_YT ? msg : 'YouTube service unavailable',
          details: DEBUG_YT ? stack : undefined,
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }

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
      action: url.searchParams.get("action"),
      channelUrl: url.searchParams.get("channelUrl"),
    });
    return new Response(
      JSON.stringify({
        error: DEBUG_YT ? errorMessage : "YouTube proxy request failed",
        details: DEBUG_YT ? errorStack : undefined,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};

// Get the live video for a YouTube channel
async function handleGetLiveVideo(url: URLSearchParams | URL, yt: any) {
  const channelUrlParam = getChannelParam(url);
  if (!channelUrlParam) {
    return new Response(JSON.stringify({ error: "channelUrl parameter is required" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  if (!isValidYouTubeParam(channelUrlParam)) {
    return new Response(JSON.stringify({ error: "Invalid channelUrl" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  console.log(`[YouTube Proxy] Looking up channel: ${channelUrlParam}`);

  try {
    const result = await findLiveForChannel(channelUrlParam, { yt, debug: DEBUG_YT });
    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[YouTube Proxy] Live lookup failed for', channelUrlParam, msg);
    return new Response(JSON.stringify({ error: DEBUG_YT ? msg : 'Failed to retrieve live status' }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}


async function handleGetChannelInfo(url: URLSearchParams | URL, yt: any) {
  const channelUrlParam = getChannelParam(url);
  if (!channelUrlParam) {
    return new Response(JSON.stringify({ error: "channelUrl parameter is required" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  if (!isValidYouTubeParam(channelUrlParam)) {
    return new Response(JSON.stringify({ error: "Invalid channelUrl" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const resolved = await resolveChannelId(channelUrlParam, yt);
  if (!resolved) {
    return new Response(JSON.stringify({ error: "Could not resolve YouTube URL" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  const channelId = resolved;

  let channel: any;
  try {
    channel = await yt.getChannel(channelId);
  } catch (chErr) {
    const msg = chErr instanceof Error ? chErr.message : String(chErr);
    const stack = chErr instanceof Error ? chErr.stack : undefined;
    console.error('[YouTube Proxy] getChannel failed', { message: msg, stack, channelId });
    return new Response(JSON.stringify({ error: DEBUG_YT ? msg : 'Failed to retrieve channel info', details: DEBUG_YT ? stack : undefined }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const basicInfo = (channel as any).basic_info || {};
  const headerInfo = (channel as any).header?.author || {};

  return new Response(JSON.stringify({ channelId: basicInfo.id || headerInfo.id || "", displayName: basicInfo.title || headerInfo.title || "" }), { status: 200, headers: { "Content-Type": "application/json" } });
}
