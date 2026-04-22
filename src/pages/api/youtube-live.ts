import type { APIRoute } from "astro";
import { getInnertube } from "../../lib/youtube";
import { checkRateLimit } from "../../lib/rateLimit";
import findLiveForChannel from "../../lib/youtube-lookup";

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

    // Delegate the heavy lifting to the centralized lookup function
    console.log(`[YouTube Live] Looking up channel: ${channelUrl}`);
    let videoId: string | null = null;
    let returnChannelId = '';
    try {
      const result = await findLiveForChannel(channelUrl, { yt, debug: DEBUG_YT });
      videoId = result.videoId;
      returnChannelId = result.channelId;
      if (videoId) console.log(`[YouTube Live] Found live video: ${videoId}`);
    } catch (err) {
      console.warn('[YouTube Live] Central lookup failed:', err);
    }
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
