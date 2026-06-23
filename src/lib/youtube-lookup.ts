import { getInnertube } from "./youtube";
import { YT_USER_AGENT } from "./constants";

const CHANNEL_ID_RE = /^UC[\w-]{22}$/;
const HANDLE_RE = /^@[\w.]{1,100}$/;
const YT_URL_RE = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i;

const DEFAULT_TTL = 30_000;

type LookupResult = { videoId: string | null; channelId: string };

const channelLiveCache = new Map<
  string,
  { videoId: string | null; channelId: string; expires: number }
>();
const inflightLiveLookup = new Map<string, Promise<LookupResult>>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of channelLiveCache) {
    if (now > entry.expires) channelLiveCache.delete(key);
  }
}, 120_000);

function parsePathCandidateFromUrl(channelUrlParam: string): string | null {
  try {
    const parsed = new URL(channelUrlParam);
    let candidate = (parsed.pathname || "").replace(/^\/+/, "");
    if (candidate.startsWith("channel/"))
      candidate = candidate.split("/")[1] || candidate;
    if (candidate.startsWith("user/"))
      candidate = candidate.split("/")[1] || candidate;
    // @handle format — strip the @ so downstream code recognises it as a handle
    if (candidate.startsWith("@")) return candidate;
    return candidate || null;
  } catch {
    return null;
  }
}

const USER_AGENT = YT_USER_AGENT;
const REFERER = "https://www.youtube.com/";
const ORIGIN = "https://www.youtube.com";

function buildFetchHeaders(cookies?: string): HeadersInit {
  return {
    "User-Agent": USER_AGENT,
    Referer: REFERER,
    Origin: ORIGIN,
    "Accept-Language": "en-US,en;q=0.9",
    ...(cookies ? { Cookie: cookies } : {}),
  };
}

const VIDEO_ID_RE = /^[\w-]{11}$/;

function extractVideoIdFromHtml(
  html: string,
  requireLive = false,
): string | null {
  // 1. <link rel="canonical" href="...watch?v=VIDEO_ID">
  const canonicalMatch = html.match(
    /<link\s+rel="canonical"\s+href="[^"]*watch\?v=([\w-]{11})/,
  );
  if (canonicalMatch) {
    if (!requireLive) return canonicalMatch[1];
    // Only accept if page explicitly indicates this is a live stream
    if (
      /"isLive[cC]ontent"\s*:\s*true|"liveBroadcastDetails"\s*:\s*\{[^}]*"isLiveNow"\s*:\s*true/i.test(
        html,
      )
    ) {
      return canonicalMatch[1];
    }
  }

  // 2. og:video:url meta tag
  const ogMatch = html.match(
    /property="og:video:url"\s+content="[^"]*watch\?v=([\w-]{11})/,
  );
  if (ogMatch) {
    if (!requireLive) return ogMatch[1];
    if (
      /"isLive[cC]ontent"\s*:\s*true|"liveBroadcastDetails"\s*:\s*\{[^}]*"isLiveNow"\s*:\s*true/i.test(
        html,
      )
    ) {
      return ogMatch[1];
    }
  }

  // 3. ytInitialPlayerResponse embedded JSON
  const ytiprMatch = html.match(/ytInitialPlayerResponse\s*=\s*\{/);
  if (ytiprMatch) {
    const start = (ytiprMatch.index ?? 0) + ytiprMatch[0].length - 1;
    let depth = 0;
    for (let i = start; i < html.length; i++) {
      if (html[i] === "{") depth++;
      else if (html[i] === "}") {
        depth--;
        if (depth === 0) {
          try {
            const json = JSON.parse(html.slice(start, i + 1));
            const vid = json?.videoDetails?.videoId;
            if (vid && VIDEO_ID_RE.test(vid)) {
              if (!requireLive) return vid;
              // Check if videoDetails marks this as live
              const isLive =
                json?.videoDetails?.isLive === true ||
                json?.videoDetails?.isLiveContent === true ||
                json?.videoDetails?.liveBroadcastDetails?.isLiveNow === true;
              if (isLive) return vid;
            }
          } catch {}
          break;
        }
      }
    }
  }

  // 4. "videoId":"VIDEO_ID" in ytInitialData — prefer videoIds near live indicators
  const vidMatches = html.matchAll(/"videoId"\s*:\s*"([\w-]{11})"/g);
  const seen = new Set<string>();
  const liveIndicators = html.matchAll(
    /"isLive[cC]ontent"\s*:\s*true|"liveBroadcastDetails"\s*:\s*\{[^}]*"isLiveNow"\s*:\s*true/gi,
  );
  const livePositions = [...liveIndicators].map((m) => m.index ?? 0);
  for (const m of vidMatches) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      if (livePositions.length > 0) {
        const pos = m.index ?? 0;
        const nearby = livePositions.some((lp) => Math.abs(lp - pos) < 5000);
        if (nearby) return m[1];
      }
    }
  }

  // 5. watch?v=VIDEO_ID — only if not requiring live or if live indicators exist
  if (!requireLive) {
    const urlVidMatch = html.match(/watch\?v=([\w-]{11})/);
    if (urlVidMatch) return urlVidMatch[1];
  }

  return null;
}

async function redirectFallbackLive(
  channelParam: string,
): Promise<string | null> {
  try {
    const candidates: string[] = [];
    const isFullUrl = YT_URL_RE.test(channelParam);
    if (isFullUrl) {
      candidates.push(channelParam.replace(/\/$/, "") + "/live");
    } else if (channelParam.startsWith("@")) {
      candidates.push(
        `https://www.youtube.com/${channelParam.replace(/^\/+/, "")}/live`,
      );
    } else if (CHANNEL_ID_RE.test(channelParam)) {
      candidates.push(`https://www.youtube.com/channel/${channelParam}/live`);
    } else {
      candidates.push(
        `https://www.youtube.com/${channelParam.replace(/^\/+/, "")}/live`,
      );
    }

    const doFetch = fetch;
    const headers = buildFetchHeaders();

    for (const candidate of candidates) {
      try {
        const res = await doFetch(candidate, {
          method: "GET",
          redirect: "follow",
          headers,
        });

        // Check redirect URL first (works if YouTube does a real HTTP redirect)
        const finalUrl = res.url || "";
        if (finalUrl.includes("watch?v=")) {
          const parsed = new URL(finalUrl);
          const vid = parsed.searchParams.get("v");
          // Only accept if the page indicates this is currently live
          if (vid && res.ok) {
            const html = await res.text();
            const liveVid = extractVideoIdFromHtml(html, true);
            if (liveVid) return liveVid;
          }
        }

        // If no redirect detected, parse the HTML body for a live video ID
        if (res.ok) {
          const html = await res.text();
          const vid = extractVideoIdFromHtml(html, true);
          if (vid) return vid;
        }
      } catch (err) {
        continue;
      }
    }
  } catch (err) {}
  return null;
}

function isActuallyLive(video: any): boolean {
  if (!video) return false;
  if (video.is_live === true) return true;
  const badges: any[] = video.badges ?? [];
  if (
    badges.some(
      (b: any) =>
        b?.metadataBadgeRenderer?.label === "LIVE" || b?.liveBadge != null,
    )
  )
    return true;
  const overlays: any[] = video.thumbnailOverlays ?? [];
  if (
    overlays.some(
      (o: any) => o?.thumbnailOverlayTimeStatusRenderer?.style === "LIVE",
    )
  )
    return true;
  return false;
}

export async function resolveChannelId(
  channelParam: string,
  yt?: any,
): Promise<string | null> {
  const trimmed = (channelParam || "").trim();
  if (!trimmed) return null;

  // If it's already a canonical channel ID, return it immediately
  if (CHANNEL_ID_RE.test(trimmed)) return trimmed;

  const isFullUrl = YT_URL_RE.test(trimmed);
  const isHandle = HANDLE_RE.test(trimmed);

  // If we have an Innertube client, try to resolve the URL/handle to a browseId (UC...)
  if (yt?.resolveURL) {
    try {
      let url = trimmed;
      if (isHandle) {
        url = `https://www.youtube.com/${trimmed}`;
      } else if (!isFullUrl && !trimmed.includes("/")) {
        // Might be a legacy /user/ path or just a custom name
        url = `https://www.youtube.com/${trimmed}`;
      }

      const endpoint = await yt.resolveURL(url);
      if (endpoint?.payload?.browseId) {
        return endpoint.payload.browseId;
      }
    } catch (e) {
      // resolveURL failed
    }
  }

  if (isFullUrl) {
    const pathCandidate = parsePathCandidateFromUrl(trimmed);
    if (pathCandidate) {
      // If the path candidate is a @handle, resolve it via Innertube
      if (pathCandidate.startsWith("@") && yt?.resolveURL) {
        try {
          const endpoint = await yt.resolveURL(
            `https://www.youtube.com/${pathCandidate}`,
          );
          if (endpoint?.payload?.browseId) return endpoint.payload.browseId;
        } catch {}
      }
      return pathCandidate;
    }
    return null;
  }

  return trimmed;
}

export function isValidYouTubeParam(param: string | null | undefined): boolean {
  if (!param) return false;
  return (
    YT_URL_RE.test(param) || CHANNEL_ID_RE.test(param) || HANDLE_RE.test(param)
  );
}

export async function findLiveForChannel(
  channelParam: string,
  options?: { yt?: any; ttl?: number; debug?: boolean },
): Promise<LookupResult> {
  const trimmedParam = (channelParam || "").trim();
  if (!trimmedParam) return { videoId: null, channelId: "" };

  const debug = options?.debug ?? process.env.YT_DEBUG === "1";
  const ttl = options?.ttl ?? DEFAULT_TTL;
  const paramKey = `param:${trimmedParam}`;
  const now = Date.now();

  // Fast cache check by original param
  const cached = channelLiveCache.get(paramKey);
  if (cached && cached.expires > now) {
    return { videoId: cached.videoId, channelId: cached.channelId };
  }

  if (inflightLiveLookup.has(paramKey))
    return inflightLiveLookup.get(paramKey)!;

  const lookup = (async (): Promise<LookupResult> => {
    // Ensure we have an Innertube client for the richer lookups
    let ytClient = options?.yt;
    try {
      if (!ytClient) ytClient = await getInnertube();
    } catch (err) {
      if (debug) console.warn("[YouTube Lookup] getInnertube failed", err);
      ytClient = null;
    }

    // Try to resolve channel -> canonical id
    let resolvedChannelId: string | null = null;
    try {
      resolvedChannelId = await resolveChannelId(trimmedParam, ytClient);
      if (debug)
        console.log(
          `[YouTube Lookup] resolveChannelId("${trimmedParam}") → "${resolvedChannelId}"`,
        );
    } catch (e) {
      if (debug) console.warn("[YouTube Lookup] resolveChannelId failed", e);
    }

    const idKey = resolvedChannelId ? `id:${resolvedChannelId}` : null;
    if (idKey) {
      const cachedById = channelLiveCache.get(idKey);
      if (cachedById && cachedById.expires > Date.now())
        return { videoId: cachedById.videoId, channelId: cachedById.channelId };
      if (inflightLiveLookup.has(idKey)) return inflightLiveLookup.get(idKey)!;
    }

    let channel: any = null;
    let videoId: string | null = null;
    let finalChannelId = resolvedChannelId || "";

    if (ytClient && (resolvedChannelId || trimmedParam)) {
      const targetId = resolvedChannelId || trimmedParam;
      try {
        // @handle format — getChannel needs a URL, not a raw handle
        const channelParam = targetId.startsWith("@")
          ? `https://www.youtube.com/${targetId}`
          : targetId;
        channel = await ytClient.getChannel(channelParam);
        if (debug)
          console.log(
            `[YouTube Lookup] getChannel("${targetId}") OK — id=${channel?.basic_info?.id ?? "unknown"}`,
          );
      } catch (chErr) {
        if (debug)
          console.warn(
            `[YouTube Lookup] getChannel failed for "${targetId}" (source: "${trimmedParam}")`,
            chErr,
          );
        channel = null;
      }
    }

    if (channel) {
      try {
        const liveStreams = await (channel as any).getLiveStreams();
        const videos: any[] = liveStreams?.videos ?? [];
        if (debug)
          console.log(
            `[YouTube Lookup] getLiveStreams() → ${videos.length} videos`,
          );
        const liveVideo = videos.find((v: any) => isActuallyLive(v));
        if (liveVideo) {
          videoId = liveVideo.id ?? liveVideo.videoId ?? null;
          if (debug)
            console.log(
              `[YouTube Lookup] Found live video in liveStreams: ${videoId}`,
            );
        }
      } catch (lsErr) {
        if (debug)
          console.warn("[YouTube Lookup] getLiveStreams failed:", lsErr);
      }

      if (!videoId) {
        try {
          const videosTab = await (channel as any).getVideos();
          const videos: any[] = videosTab?.videos ?? [];
          const liveVideo = videos.find((v: any) => isActuallyLive(v));
          if (liveVideo) {
            videoId = liveVideo.id ?? liveVideo.videoId ?? null;
          }
        } catch (videosError) {
          if (debug)
            console.warn("[YouTube Lookup] getVideos failed:", videosError);
        }
      }

      if (!videoId && (channel as any).hasHome) {
        try {
          const home = await (channel as any).getHome();

          function findLiveInTree(node: any, depth = 0): string | null {
            if (!node || typeof node !== "object" || depth > 8) return null;
            if (Array.isArray(node)) {
              for (const item of node) {
                const found = findLiveInTree(item, depth + 1);
                if (found) return found;
              }
              return null;
            }
            const vr = node.videoRenderer;
            if (vr) {
              const vid = vr.videoId as string | undefined;
              if (
                vid &&
                (vr.isLiveContent === true ||
                  (vr.badges ?? []).some(
                    (b: any) => b?.metadataBadgeRenderer?.label === "LIVE",
                  ) ||
                  (vr.thumbnailOverlays ?? []).some(
                    (o: any) =>
                      o?.thumbnailOverlayTimeStatusRenderer?.style === "LIVE",
                  ))
              ) {
                return vid;
              }
            }
            for (const val of Object.values(node)) {
              const found = findLiveInTree(val, depth + 1);
              if (found) return found;
            }
            return null;
          }

          const found = findLiveInTree(home?.contents);
          if (found) videoId = found;
        } catch (homeError) {
          if (debug)
            console.warn(
              "[YouTube Lookup] Failed to check home feed:",
              homeError,
            );
        }
      }

      finalChannelId =
        finalChannelId ||
        (channel as any).basic_info?.id ||
        (channel as any).header?.author?.id ||
        "";
    }

    // Redirect fallback — fetch the /live page directly (not through Innertube)
    // to extract the video ID from HTML/redirects.
    if (!videoId) {
      try {
        if (debug)
          console.log(
            `[YouTube Lookup] Trying redirect fallback for "${trimmedParam}"`,
          );
        const redirectVid = await redirectFallbackLive(trimmedParam);
        if (redirectVid) {
          videoId = redirectVid;
          if (debug)
            console.log(`[YouTube Lookup] Redirect fallback found: ${videoId}`);
        } else {
          if (debug)
            console.log(
              "[YouTube Lookup] Redirect fallback found no live video",
            );
        }
      } catch (err) {
        if (debug)
          console.warn("[YouTube Lookup] Redirect fallback error:", err);
      }
    }

    if (debug)
      console.log(
        `[YouTube Lookup] Final result for "${trimmedParam}": videoId=${videoId}, channelId=${finalChannelId || ""}`,
      );

    const result: LookupResult = { videoId, channelId: finalChannelId || "" };
    try {
      channelLiveCache.set(paramKey, {
        videoId: result.videoId,
        channelId: result.channelId,
        expires: Date.now() + ttl,
      });
      if (result.channelId)
        channelLiveCache.set(`id:${result.channelId}`, {
          videoId: result.videoId,
          channelId: result.channelId,
          expires: Date.now() + ttl,
        });
    } catch {}

    return result;
  })();

  inflightLiveLookup.set(paramKey, lookup);
  lookup
    .then((res) => {
      inflightLiveLookup.delete(paramKey);
      if (res.channelId) inflightLiveLookup.delete(`id:${res.channelId}`);
    })
    .catch(() => inflightLiveLookup.delete(paramKey));

  return lookup;
}
