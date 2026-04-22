import type { APIRoute } from "astro";
import { getInnertube } from "../../lib/youtube";
import { checkRateLimit } from "../../lib/rateLimit";

// Set debug mode when `YT_DEBUG=1` is present or running in dev mode.
const DEBUG_YT = process.env.YT_DEBUG === '1' || import.meta.env?.MODE === 'development';

// In-memory cache for channel -> live video lookup. Short TTL to reduce repeated
// Innertube/API calls while keeping results reasonably fresh.
const channelLiveCache = new Map<string, { videoId: string | null; channelId: string; expires: number }>();
const inflightLiveLookup = new Map<string, Promise<{ videoId: string | null; channelId: string }>>();

// Common regexes and helpers to dedupe repeated logic
const CHANNEL_ID_RE = /^UC[\w-]{22}$/;
const HANDLE_RE = /^@[\w.]{1,100}$/;
const YT_URL_RE = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i;

function getChannelParam(url: URL | URLSearchParams): string | null {
  if (url instanceof URLSearchParams) return url.get("channelUrl");
  return url.searchParams.get("channelUrl");
}

function isValidYouTubeParam(param: string | null | undefined): boolean {
  if (!param) return false;
  return YT_URL_RE.test(param) || CHANNEL_ID_RE.test(param) || HANDLE_RE.test(param);
}

function parsePathCandidateFromUrl(channelUrlParam: string): string | null {
  try {
    const parsed = new URL(channelUrlParam);
    let candidate = (parsed.pathname || "").replace(/^\/+/, "");
    if (candidate.startsWith("channel/")) candidate = candidate.split("/")[1] || candidate;
    if (candidate.startsWith("user/")) candidate = candidate.split("/")[1] || candidate;
    return candidate || null;
  } catch {
    return null;
  }
}

async function dataApiResolveChannelId(q: string): Promise<string | null> {
  if (!process.env.YT_API_KEY) return null;
  try {
    const apiKey = process.env.YT_API_KEY as string;
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=channel&maxResults=1&key=${apiKey}`;
    const sres = await fetch(searchUrl);
    if (!sres.ok) {
      if (DEBUG_YT) {
        const txt = await sres.text().catch(() => '<no body>');
        console.warn('[YouTube Proxy] Data API resolve channel failed', sres.status, txt);
      }
      return null;
    }
    const sdata = await sres.json();
    if (sdata.items?.length) return sdata.items[0]?.id?.channelId || null;
    return null;
  } catch (err) {
    if (DEBUG_YT) console.warn('[YouTube Proxy] Data API resolve channel error', err);
    return null;
  }
}

async function dataApiFindLiveForChannelId(apiChannelId: string): Promise<string | null> {
  if (!process.env.YT_API_KEY) return null;
  try {
    const apiKey = process.env.YT_API_KEY as string;
    const apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(apiChannelId)}&eventType=live&type=video&maxResults=1&key=${apiKey}`;
    const r = await fetch(apiUrl);
    if (!r.ok) {
      if (DEBUG_YT) {
        const txt = await r.text().catch(() => '<no body>');
        console.warn('[YouTube Proxy] Data API search failed', r.status, txt);
      }
      return null;
    }
    const data = await r.json();
    if (data.items?.length) return data.items[0]?.id?.videoId || data.items[0]?.snippet?.resourceId?.videoId || null;
    return null;
  } catch (err) {
    if (DEBUG_YT) console.warn('[YouTube Proxy] Data API live search error', err);
    return null;
  }
}

async function dataApiFindLiveForParam(channelParam: string): Promise<{ videoId: string; channelId: string } | null> {
  if (!process.env.YT_API_KEY) return null;
  let apiChannelId = channelParam;
  if (!CHANNEL_ID_RE.test(apiChannelId)) {
    const resolved = await dataApiResolveChannelId(apiChannelId);
    if (resolved) apiChannelId = resolved;
  }
  if (!CHANNEL_ID_RE.test(apiChannelId)) {
    if (DEBUG_YT) console.debug('[YouTube Proxy] Data API skipped: could not resolve channelId', apiChannelId);
    return null;
  }
  const vid = await dataApiFindLiveForChannelId(apiChannelId);
  if (vid) return { videoId: vid, channelId: apiChannelId };
  return null;
}

async function resolveChannelId(channelParam: string, yt?: any): Promise<string | null> {
  const isFullUrl = YT_URL_RE.test(channelParam);
  if (isFullUrl) {
    // Prefer Innertube's resolver when available, then path parsing as fallback
    if (yt?.resolveURL) {
      try {
        const endpoint = await yt.resolveURL(channelParam);
        if (endpoint?.payload?.browseId) return endpoint.payload.browseId;
      } catch (err) {
        if (DEBUG_YT) console.warn('[YouTube Proxy] resolveURL failed', err);
      }
    }
    const pathCandidate = parsePathCandidateFromUrl(channelParam);
    if (pathCandidate) return pathCandidate;
    return null; // purposefully mirror original behavior for full URLs
  }
  return channelParam;
}

async function redirectFallbackLive(channelParam: string): Promise<string | null> {
  try {
    const candidates: string[] = [];
    const isFullUrl = YT_URL_RE.test(channelParam);
    if (isFullUrl) {
      candidates.push(channelParam.replace(/\/$/, "") + "/live");
    } else if (channelParam.startsWith("@")) {
      candidates.push(`https://www.youtube.com/${channelParam.replace(/^\/+/, "")}/live`);
    } else if (CHANNEL_ID_RE.test(channelParam)) {
      candidates.push(`https://www.youtube.com/channel/${channelParam}/live`);
    } else {
      candidates.push(`https://www.youtube.com/${channelParam.replace(/^\/+/, "")}/live`);
    }

    for (const candidate of candidates) {
      try {
        if (DEBUG_YT) console.log('[YouTube Proxy] Trying redirect fallback:', candidate);
        const res = await fetch(candidate, { method: 'GET', redirect: 'follow' });
        const finalUrl = res.url || '';
        if (finalUrl.includes('watch?v=')) {
          const parsed = new URL(finalUrl);
          const vid = parsed.searchParams.get('v');
          if (vid) return vid;
        }
        if ((res.status === 301 || res.status === 302) && !finalUrl) {
          const loc = res.headers.get('location');
          if (loc && loc.includes('watch?v=')) {
            const parsed = new URL(loc.startsWith('http') ? loc : `https://www.youtube.com${loc}`);
            const vid = parsed.searchParams.get('v');
            if (vid) return vid;
          }
        }
      } catch (err) {
        if (DEBUG_YT) console.warn('[YouTube Proxy] Redirect fallback fetch failed for', candidate, err);
        continue;
      }
    }
  } catch (err) {
    if (DEBUG_YT) console.warn('[YouTube Proxy] Redirect fallback error:', err);
  }
  return null;
}

async function findLiveWithInnertube(channelIdCandidate: string, channelParam: string, yt: any): Promise<{ videoId: string | null; channelId: string }> {
  let channel: any = null;
  try {
    channel = await yt.getChannel(channelIdCandidate);
  } catch (chErr) {
    if (DEBUG_YT) {
      const msg = chErr instanceof Error ? chErr.message : String(chErr);
      console.warn('[YouTube Proxy] getChannel failed', msg, channelIdCandidate);
    }
    channel = null;
  }

  let videoId: string | null = null;
  if (channel) {
    try {
      const liveStreams = await (channel as any).getLiveStreams();
      videoId = liveStreams?.videos && liveStreams.videos.length > 0 ? liveStreams.videos[0].id : null;
    } catch (lsErr) {
      if (DEBUG_YT) console.warn('[YouTube Proxy] getLiveStreams failed:', lsErr);
    }

    if (!videoId) {
      try {
        const home = await (channel as any).getHome();
        if (home?.contents) {
          const sections = home.contents.tabContents?.sectionListRenderer?.contents || [];
          for (const section of sections) {
            const items = section.itemSectionRenderer?.contents || [];
            for (const item of items) {
              if (item.videoRenderer?.isLiveContent || item.videoRenderer?.badges?.some((b: any) => b.metadataBadgeRenderer?.label === 'LIVE')) {
                videoId = item.videoRenderer?.videoId;
                if (videoId) break;
              }
            }
            if (videoId) break;
          }
        }
      } catch (homeError) {
        if (DEBUG_YT) console.warn('[YouTube Proxy] Failed to check home feed:', homeError);
      }
    }
  }

  // Optional Data API fallback
  if (!videoId && process.env.YT_API_KEY) {
    const apiResult = await dataApiFindLiveForParam(channelParam);
    if (apiResult?.videoId) return { videoId: apiResult.videoId, channelId: apiResult.channelId };
  }

  // Redirect fallback
  if (!videoId) {
    const redirectVid = await redirectFallbackLive(channelParam);
    if (redirectVid) return { videoId: redirectVid, channelId: channel ? ((channel as any).basic_info?.id || (channel as any).header?.author?.id || '') : '' };
  }

  return { videoId, channelId: channel ? ((channel as any).basic_info?.id || (channel as any).header?.author?.id || '') : '' };
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

    // If this is a `getLiveVideo` request and a `YT_API_KEY` is configured,
    // optionally prefer the Data API to avoid initializing Innertube (which
    // may be blocked with 403s) for simple public lookups. Set
    // `YT_PREFER_DATA_API=1` to force preferring the Data API even when an
    // access cookie is present.
    const preferDataApi = process.env.YT_PREFER_DATA_API === '1';
    if (action === 'getLiveVideo' && process.env.YT_API_KEY && (!accessToken || preferDataApi)) {
      try {
        const ch = channelUrl;
        if (ch) {
          try {
            const apiResult = await dataApiFindLiveForParam(ch);
            if (apiResult?.videoId) {
              console.log('[YouTube Proxy] Data API pre-check found live video', apiResult.videoId);
              return new Response(JSON.stringify({ videoId: apiResult.videoId, channelId: apiResult.channelId }), { status: 200, headers: { "Content-Type": "application/json" } });
            } else {
              if (DEBUG_YT) console.debug('[YouTube Proxy] Data API pre-check returned no live items or could not resolve channel', ch);
            }
          } catch (err) {
            if (DEBUG_YT) console.warn('[YouTube Proxy] Data API pre-check error', err);
          }
        }
      } catch (err) {
        if (DEBUG_YT) console.warn('[YouTube Proxy] Data API pre-check outer error', err);
      }
    }

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

  let channelId = channelUrlParam;
  console.log(`[YouTube Proxy] Looking up channel: ${channelUrlParam}`);

  const isFullUrl = YT_URL_RE.test(channelUrlParam);
  if (isFullUrl) {
    const resolved = await resolveChannelId(channelUrlParam, yt);
    if (!resolved) {
      return new Response(JSON.stringify({ error: "Could not resolve YouTube URL" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    channelId = resolved;
    console.log(`[YouTube Proxy] Resolved channel ID: ${channelId}`);
  }

  // Use a short-lived cache and inflight dedupe keyed by resolved channelId
  const now = Date.now();
  const cached = channelLiveCache.get(channelId);
  if (cached && cached.expires > now) {
    console.log(`[YouTube Proxy] Returning cached live video for ${channelId}: ${cached.videoId}`);
    return new Response(JSON.stringify({ videoId: cached.videoId, channelId: cached.channelId }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  if (inflightLiveLookup.has(channelId)) {
    const result = await inflightLiveLookup.get(channelId);
    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  const lookup = (async (): Promise<{ videoId: string | null; channelId: string }> => {
    const result = await findLiveWithInnertube(channelId, channelUrlParam, yt);
    try {
      channelLiveCache.set(channelId, { videoId: result.videoId, channelId: result.channelId, expires: Date.now() + 30_000 });
    } catch (_) {}
    return result;
  })();

  inflightLiveLookup.set(channelId, lookup);
  try {
    const result = await lookup;
    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[YouTube Proxy] Live lookup failed for', channelId, msg);
    return new Response(JSON.stringify({ error: DEBUG_YT ? msg : 'Failed to retrieve live status' }), { status: 500, headers: { "Content-Type": "application/json" } });
  } finally {
    inflightLiveLookup.delete(channelId);
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

  let channelId = channelUrlParam;
  const isFullUrl = YT_URL_RE.test(channelUrlParam);
  if (isFullUrl) {
    const resolved = await resolveChannelId(channelUrlParam, yt);
    if (!resolved) {
      return new Response(JSON.stringify({ error: "Could not resolve YouTube URL" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    channelId = resolved;
  }

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
