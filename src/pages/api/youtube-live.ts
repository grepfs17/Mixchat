import type { APIRoute } from "astro";
import { getInnertube } from "../../lib/youtube";
import { checkRateLimit } from "../../lib/rateLimit";

// Simple in-memory cache to save on InnerTube calls
const liveVideoCache = new Map<string, { videoId: string | null; expires: number }>();
const LIVE_CACHE_TTL = 1000 * 60 * 5; // 5 minutes
// Enable debug mode when `YT_DEBUG=1` or running in development
const DEBUG_YT = process.env.YT_DEBUG === '1' || import.meta.env?.MODE === 'development';

export const GET: APIRoute = async ({ url, clientAddress }) => {
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

    // Validate that channelUrl is actually a YouTube URL.
    const isYouTubeUrl =
      /^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(channelUrl) ||
      /^UC[\w-]{22}$/.test(channelUrl) || // raw channel ID
      /^@[\w.]{1,100}$/.test(channelUrl);  // handle e.g. @username
    if (!isYouTubeUrl) {
      return new Response(
        JSON.stringify({ error: "Invalid channelUrl" }),
        { status: 400, headers },
      );
    }

    // Check cache
    const now = Date.now();
    const cached = liveVideoCache.get(channelUrl);
    if (cached && cached.expires > now) {
      return new Response(JSON.stringify({ videoId: cached.videoId }), { status: 200, headers });
    }

    let yt: any;
    try {
      yt = await getInnertube();
    } catch (ytErr) {
      const msg = ytErr instanceof Error ? ytErr.message : String(ytErr);
      const stack = ytErr instanceof Error ? ytErr.stack : undefined;
      console.error('[YouTube Live] getInnertube() failed', { message: msg, stack, channelUrl });
      return new Response(
        JSON.stringify({
          error: DEBUG_YT ? msg : 'YouTube service unavailable',
          details: DEBUG_YT ? stack : undefined,
        }),
        { status: 503, headers },
      );
    }

    // Resolve the URL to get the channel ID/endpoint
    let channelId = channelUrl;
    console.log(`[YouTube Live] Looking up channel: ${channelUrl}`);

    const isFullUrl = channelUrl.includes('youtube.com') || channelUrl.includes('youtu.be');

    if (isFullUrl) {
      try {
        const endpoint = await (yt as any).resolveURL(channelUrl);
        console.log(`[YouTube Live] Resolved URL to endpoint:`, endpoint?.payload);
        if (endpoint?.payload?.browseId) {
          channelId = endpoint.payload.browseId;
          console.log(`[YouTube Live] Using channel ID: ${channelId}`);
        } else {
          // Try a best-effort fallback: parse the path component and use that
          // as a handle/channel identifier (e.g. @name, channel/UC..., user/name).
          try {
            const parsed = new URL(channelUrl);
            let candidate = (parsed.pathname || "").replace(/^\/+/, "");
            if (candidate.startsWith("channel/")) candidate = candidate.split("/")[1] || candidate;
            if (candidate.startsWith("user/")) candidate = candidate.split("/")[1] || candidate;
            if (candidate) {
              channelId = candidate;
              console.log(`[YouTube Live] Fallback using path candidate: ${channelId}`);
            } else {
              console.warn('[YouTube Live] Could not resolve URL and no path candidate found');
            }
          } catch (parseErr) {
            console.warn('[YouTube Live] Failed to parse URL for fallback:', parseErr);
          }
        }
      } catch (urlError) {
        console.warn('Failed to resolve URL:', urlError);
        // Best-effort fallback: try parsing pathname segment instead of failing fast.
        try {
          const parsed = new URL(channelUrl);
          let candidate = (parsed.pathname || "").replace(/^\/+/, "");
          if (candidate.startsWith("channel/")) candidate = candidate.split("/")[1] || candidate;
          if (candidate.startsWith("user/")) candidate = candidate.split("/")[1] || candidate;
          if (candidate) {
            channelId = candidate;
            console.log(`[YouTube Live] Fallback after resolve failure, using: ${channelId}`);
          } else {
            return new Response(
              JSON.stringify({ error: "Failed to resolve YouTube URL" }),
              { status: 400, headers },
            );
          }
        } catch (parseErr) {
          console.warn('[YouTube Live] Failed to parse URL for fallback after resolve error:', parseErr);
          return new Response(
            JSON.stringify({ error: "Failed to resolve YouTube URL" }),
            { status: 400, headers },
          );
        }
      }
    }

    // Use getChannel with the resolved ID. handles (@name) are supported by getChannel directly.
    let channel: any;
    try {
      channel = await yt.getChannel(channelId);
      console.log(`[YouTube Live] Retrieved channel info`);
    } catch (chErr) {
      const msg = chErr instanceof Error ? chErr.message : String(chErr);
      const stack = chErr instanceof Error ? chErr.stack : undefined;
      console.error('[YouTube Live] getChannel failed', { message: msg, stack, channelId, channelUrl });
      
      channel = null;
    }

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

    if (channel) {
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
    }
    // Optional Data API fallback: if a `YT_API_KEY` is configured, query the
    // YouTube Data API for live broadcasts on this channel. Useful in
    // production when Innertube is blocked by the host.
    if (!videoId && process.env.YT_API_KEY) {
      try {
        const apiKey = process.env.YT_API_KEY as string;
        let apiChannelId = (channel as any)?.basic_info?.id || (channel as any)?.header?.author?.id || channelId;

        if (!/^UC[\w-]{22}$/.test(apiChannelId)) {
          try {
            const q = String(apiChannelId || channelUrl || "");
            const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=channel&maxResults=1&key=${apiKey}`;
            const sres = await fetch(searchUrl);
            if (sres.ok) {
              const sdata = await sres.json();
              if (sdata.items?.length) {
                apiChannelId = sdata.items[0]?.id?.channelId || apiChannelId;
                if (DEBUG_YT) console.debug('[YouTube Live] Data API resolved channel id', apiChannelId);
              }
            } else {
              if (DEBUG_YT) {
                const txt = await sres.text().catch(() => '<no body>');
                console.warn('[YouTube Live] Data API channel search failed', sres.status, txt);
              }
            }
          } catch (se) {
            if (DEBUG_YT) console.warn('[YouTube Live] Data API channel search error', se);
          }
        }

        if (/^UC[\w-]{22}$/.test(apiChannelId)) {
          const apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(apiChannelId)}&eventType=live&type=video&maxResults=1&key=${apiKey}`;
          const r = await fetch(apiUrl);
          if (r.ok) {
            const data = await r.json();
            if (data.items?.length) {
              const vid = data.items[0]?.id?.videoId || data.items[0]?.snippet?.resourceId?.videoId;
              if (vid) {
                videoId = vid;
                console.log('[YouTube Live] Data API found live video', videoId);
              }
            } else {
              if (DEBUG_YT) console.debug('[YouTube Live] Data API returned no live items', data);
            }
          } else {
            if (DEBUG_YT) {
              const txt = await r.text().catch(() => '<no body>');
              console.warn('[YouTube Live] Data API search failed', r.status, txt);
            }
          }
        } else {
          if (DEBUG_YT) console.debug('[YouTube Live] Data API fallback skipped: could not resolve channelId', apiChannelId);
        }
      } catch (err) {
        console.warn('[YouTube Live] Data API fallback error:', err);
      }
    }

    // Fallback: try following a channel's `/live` redirect as a last resort
    if (!videoId) {
      try {
        const candidates: string[] = [];
        if (isFullUrl && channelUrl) {
          candidates.push(channelUrl.replace(/\/$/, "") + "/live");
        } else if (channelUrl?.startsWith("@")) {
          candidates.push(`https://www.youtube.com/${channelUrl.replace(/^\/+/, "")}/live`);
        } else if (/^UC[\w-]{22}$/.test(channelUrl || "")) {
          candidates.push(`https://www.youtube.com/channel/${channelUrl}/live`);
        } else if (channelUrl) {
          candidates.push(`https://www.youtube.com/${channelUrl.replace(/^\/+/, "")}/live`);
        }

        for (const candidate of candidates) {
          try {
            if (DEBUG_YT) console.log('[YouTube Live] Trying redirect fallback:', candidate);
            const res = await fetch(candidate, { method: 'GET', redirect: 'follow' });
            const finalUrl = res.url || '';
            if (finalUrl.includes('watch?v=')) {
              try {
                const parsed = new URL(finalUrl);
                const vid = parsed.searchParams.get('v');
                if (vid) {
                  videoId = vid;
                  console.log(`[YouTube Live] Redirect fallback found video: ${videoId}`);
                  break;
                }
              } catch (uErr) {
                // ignore parsing errors and continue
              }
            }
            if (!videoId && (res.status === 301 || res.status === 302)) {
              const loc = res.headers.get('location');
              if (loc && loc.includes('watch?v=')) {
                try {
                  const parsedLoc = new URL(loc.startsWith('http') ? loc : `https://www.youtube.com${loc}`);
                  const vid = parsedLoc.searchParams.get('v');
                  if (vid) {
                    videoId = vid;
                    console.log(`[YouTube Live] Redirect (Location) fallback found video: ${videoId}`);
                    break;
                  }
                } catch (_p) {
                  // noop
                }
              }
            }
          } catch (fetchErr) {
            if (DEBUG_YT) console.warn('[YouTube Live] Redirect fallback fetch failed for', candidate, fetchErr);
            continue;
          }
        }
      } catch (rbErr) {
        if (DEBUG_YT) console.warn('[YouTube Live] Redirect fallback error:', rbErr);
      }
    }

    console.log(`[YouTube Live] Final videoId: ${videoId}`);

    liveVideoCache.set(channelUrl, { videoId, expires: now + LIVE_CACHE_TTL });

    // Try to get channel ID from metadata or basic_info
    const returnChannelId = channel ? ((channel as any).basic_info?.id || (channel as any).header?.author?.id || "") : "";

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
      action: 'getLiveVideo',
      channelUrl: url.searchParams.get("channelUrl"),
    });
    return new Response(
      JSON.stringify({
        error: import.meta.env.MODE === 'development' ? errorMessage : "Failed to look up live video",
        details: import.meta.env.MODE === 'development' ? errorStack : undefined,
      }),
      { status: 500, headers },
    );
  }
};
