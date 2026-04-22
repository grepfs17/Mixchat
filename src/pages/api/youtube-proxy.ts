import type { APIRoute } from "astro";
import { getInnertube } from "../../lib/youtube";
import { checkRateLimit } from "../../lib/rateLimit";

// Set debug mode when `YT_DEBUG=1` is present or running in dev mode.
const DEBUG_YT = process.env.YT_DEBUG === '1' || import.meta.env?.MODE === 'development';

// In-memory cache for channel -> live video lookup. Short TTL to reduce repeated
// Innertube/API calls while keeping results reasonably fresh.
const channelLiveCache = new Map<string, { videoId: string | null; channelId: string; expires: number }>();
const inflightLiveLookup = new Map<string, Promise<{ videoId: string | null; channelId: string }>>();

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
        // Best-effort fallback: parse the path component and use it as a handle/ID
        try {
          const parsed = new URL(channelUrlParam);
          let candidate = (parsed.pathname || "").replace(/^\/+/, "");
          if (candidate.startsWith("channel/")) candidate = candidate.split("/")[1] || candidate;
          if (candidate.startsWith("user/")) candidate = candidate.split("/")[1] || candidate;
          if (candidate) {
            channelId = candidate;
            console.log(`[YouTube Proxy] Fallback using path candidate: ${channelId}`);
          } else {
            console.warn('[YouTube Proxy] Could not resolve URL and no path candidate found');
            return new Response(
              JSON.stringify({ error: "Could not resolve YouTube URL" }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }
        } catch (parseErr) {
          console.warn('[YouTube Proxy] Failed to parse URL for fallback:', parseErr);
          return new Response(
            JSON.stringify({ error: "Could not resolve YouTube URL" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
      }
    } catch (urlError) {
      console.warn('[YouTube Proxy] Failed to resolve URL:', urlError);
      // Try parsing pathname segment instead of failing fast.
      try {
        const parsed = new URL(channelUrlParam);
        let candidate = (parsed.pathname || "").replace(/^\/+/, "");
        if (candidate.startsWith("channel/")) candidate = candidate.split("/")[1] || candidate;
        if (candidate.startsWith("user/")) candidate = candidate.split("/")[1] || candidate;
        if (candidate) {
          channelId = candidate;
          console.log(`[YouTube Proxy] Fallback after resolve failure, using: ${channelId}`);
        } else {
          return new Response(
            JSON.stringify({ error: "Failed to resolve YouTube URL" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
      } catch (parseErr) {
        console.warn('[YouTube Proxy] Failed to parse URL for fallback after resolve error:', parseErr);
        return new Response(
          JSON.stringify({ error: "Failed to resolve YouTube URL" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
    }
  }

  // Use a short-lived cache and inflight dedupe keyed by resolved channelId to
  // avoid repeating heavy Innertube calls when many clients ask for the same
  // channel at once.
  const now = Date.now();
  const cached = channelLiveCache.get(channelId);
  if (cached && cached.expires > now) {
    console.log(`[YouTube Proxy] Returning cached live video for ${channelId}: ${cached.videoId}`);
    return new Response(JSON.stringify({ videoId: cached.videoId, channelId: cached.channelId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (inflightLiveLookup.has(channelId)) {
    // Another request is already resolving this channel — wait for it.
    const result = await inflightLiveLookup.get(channelId);
    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  const lookup = (async (): Promise<{ videoId: string | null; channelId: string }> => {
    let channel: any;
    try {
      channel = await yt.getChannel(channelId);
      console.log(`[YouTube Proxy] Retrieved channel info`);
    } catch (chErr) {
      const msg = chErr instanceof Error ? chErr.message : String(chErr);
      const stack = chErr instanceof Error ? chErr.stack : undefined;
      console.error('[YouTube Proxy] getChannel failed', { message: msg, stack, channelId });
      throw chErr;
    }

    // Check if the channel is currently live
    let videoId: string | null = null;
    try {
      const liveStreams = await (channel as any).getLiveStreams();
      videoId = liveStreams?.videos && liveStreams.videos.length > 0 ? liveStreams.videos[0].id : null;
    } catch (lsErr) {
      console.warn('[YouTube Proxy] getLiveStreams failed:', lsErr);
      // continue to try other strategies (home feed)
    }

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

    // Optional Data API fallback: if a `YT_API_KEY` is configured, query the
    // YouTube Data API for live broadcasts on this channel. This is useful
    // in production when Innertube fails or is blocked by hosting limits.
    if (!videoId && process.env.YT_API_KEY) {
      try {
        const apiKey = process.env.YT_API_KEY as string;
        let apiChannelId = (channel as any)?.basic_info?.id || (channel as any)?.header?.author?.id || channelId;

        // If we don't have a canonical channel ID, try resolving via a
        // lightweight channel search using the Data API.
        if (!/^UC[\w-]{22}$/.test(apiChannelId)) {
          try {
            const q = String(apiChannelId || channelUrlParam || "");
            const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=channel&maxResults=1&key=${apiKey}`;
            const sres = await fetch(searchUrl);
            if (sres.ok) {
              const sdata = await sres.json();
              if (sdata.items?.length) {
                apiChannelId = sdata.items[0]?.id?.channelId || apiChannelId;
                if (DEBUG_YT) console.debug('[YouTube Proxy] Data API resolved channel id', apiChannelId);
              }
            } else {
              if (DEBUG_YT) {
                const txt = await sres.text().catch(() => '<no body>');
                console.warn('[YouTube Proxy] Data API channel search failed', sres.status, txt);
              }
            }
          } catch (se) {
            if (DEBUG_YT) console.warn('[YouTube Proxy] Data API channel search error', se);
          }
        }

        // If we now have a proper channel ID, query for live videos on that channel.
        if (/^UC[\w-]{22}$/.test(apiChannelId)) {
          const apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(apiChannelId)}&eventType=live&type=video&maxResults=1&key=${apiKey}`;
          const r = await fetch(apiUrl);
          if (r.ok) {
            const data = await r.json();
            if (data.items?.length) {
              const vid = data.items[0]?.id?.videoId || data.items[0]?.snippet?.resourceId?.videoId;
              if (vid) {
                videoId = vid;
                console.log('[YouTube Proxy] Data API found live video', videoId);
              }
            } else {
              if (DEBUG_YT) console.debug('[YouTube Proxy] Data API returned no live items', data);
            }
          } else {
            if (DEBUG_YT) {
              const txt = await r.text().catch(() => '<no body>');
              console.warn('[YouTube Proxy] Data API search failed', r.status, txt);
            }
          }
        } else {
          if (DEBUG_YT) console.debug('[YouTube Proxy] Data API fallback skipped: could not resolve channelId', apiChannelId);
        }
      } catch (err) {
        console.warn('[YouTube Proxy] Data API fallback error:', err);
      }
    }

    // Fallback: some channels expose a `/live` redirect (e.g. /@handle/live)
    // which will redirect to the watch page when live. Try following that
    // redirect as a last-resort method to obtain the `v` query param.
    if (!videoId) {
      try {
        const candidates: string[] = [];
        if (isFullUrl && channelUrlParam) {
          candidates.push(channelUrlParam.replace(/\/$/, "") + "/live");
        } else if (channelUrlParam?.startsWith("@")) {
          candidates.push(`https://www.youtube.com/${channelUrlParam.replace(/^\/+/, "")}/live`);
        } else if (/^UC[\w-]{22}$/.test(channelUrlParam || "")) {
          candidates.push(`https://www.youtube.com/channel/${channelUrlParam}/live`);
        } else if (channelUrlParam) {
          candidates.push(`https://www.youtube.com/${channelUrlParam.replace(/^\/+/, "")}/live`);
        }

        for (const candidate of candidates) {
          try {
            console.log('[YouTube Proxy] Trying redirect fallback:', candidate);
            const res = await fetch(candidate, { method: 'GET', redirect: 'follow' });
            const finalUrl = res.url || '';
            if (finalUrl.includes('watch?v=')) {
              try {
                const parsed = new URL(finalUrl);
                const vid = parsed.searchParams.get('v');
                if (vid) {
                  videoId = vid;
                  console.log(`[YouTube Proxy] Redirect fallback found video: ${videoId}`);
                  break;
                }
              } catch (uErr) {
                // ignore parsing errors and continue
              }
            }

            // If the response itself was a redirect (manual redirect response), check Location
            if (!videoId && (res.status === 301 || res.status === 302)) {
              const loc = res.headers.get('location');
              if (loc && loc.includes('watch?v=')) {
                try {
                  const parsedLoc = new URL(loc.startsWith('http') ? loc : `https://www.youtube.com${loc}`);
                  const vid = parsedLoc.searchParams.get('v');
                  if (vid) {
                    videoId = vid;
                    console.log(`[YouTube Proxy] Redirect (Location) fallback found video: ${videoId}`);
                    break;
                  }
                } catch (_p) {
                  // noop
                }
              }
            }
          } catch (fetchErr) {
            console.warn('[YouTube Proxy] Redirect fallback fetch failed for', candidate, fetchErr);
            continue;
          }
        }
      } catch (rbErr) {
        console.warn('[YouTube Proxy] Redirect fallback error:', rbErr);
      }
    }

    const returnChannelId = (channel as any).basic_info?.id || (channel as any).header?.author?.id || "";

    // Cache the result briefly to avoid repeated fetches
    try {
      channelLiveCache.set(channelId, { videoId, channelId: returnChannelId, expires: Date.now() + 30_000 });
    } catch (_) {
      // ignore cache set failures in edge cases
    }

    return { videoId, channelId: returnChannelId };
  })();

  inflightLiveLookup.set(channelId, lookup);
  try {
    const result = await lookup;
    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    // If the lookup failed, surface a helpful error to the client and log details
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[YouTube Proxy] Live lookup failed for', channelId, msg);
    return new Response(JSON.stringify({ error: DEBUG_YT ? msg : 'Failed to retrieve live status' }), { status: 500, headers: { "Content-Type": "application/json" } });
  } finally {
    inflightLiveLookup.delete(channelId);
  }
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

  let channel: any;
  try {
    channel = await yt.getChannel(channelId);
  } catch (chErr) {
    const msg = chErr instanceof Error ? chErr.message : String(chErr);
    const stack = chErr instanceof Error ? chErr.stack : undefined;
    console.error('[YouTube Proxy] getChannel failed', { message: msg, stack, channelId });
    return new Response(
      JSON.stringify({
        error: DEBUG_YT ? msg : 'Failed to retrieve channel info',
        details: DEBUG_YT ? stack : undefined,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
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
