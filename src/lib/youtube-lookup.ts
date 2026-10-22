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
    // Keep the @handle form so downstream code recognises it as a handle
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

const LIVE_INDICATOR_RE =
  /"isLive[cC]ontent"\s*:\s*true|"liveBroadcastDetails"\s*:\s*\{[^}]*"isLiveNow"\s*:\s*true/i;

function hasLiveIndicator(html: string): boolean {
  return LIVE_INDICATOR_RE.test(html);
}

/** Extract videoId from <link rel="canonical"> or og:video:url meta tag. */
function extractFromMetaTag(html: string): string | null {
  const canonical = html.match(
    /<link\s+rel="canonical"\s+href="[^"]*watch\?v=([\w-]{11})/,
  );
  if (canonical) return canonical[1];
  const og = html.match(
    /property="og:video:url"\s+content="[^"]*watch\?v=([\w-]{11})/,
  );
  return og?.[1] ?? null;
}

/** Extract videoId from ytInitialPlayerResponse embedded JSON. */
function extractFromPlayerResponse(html: string): string | null {
  const match = html.match(/ytInitialPlayerResponse\s*=\s*\{/);
  if (!match) return null;
  const start = (match.index ?? 0) + match[0].length - 1;
  let depth = 0;
  for (let i = start; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") {
      depth--;
      if (depth === 0) {
        try {
          const json = JSON.parse(html.slice(start, i + 1));
          const vid = json?.videoDetails?.videoId;
          if (vid && VIDEO_ID_RE.test(vid)) return vid;
        } catch {}
        break;
      }
    }
  }
  return null;
}

/** Extract videoId from ytInitialData JSON, preferring IDs near live indicators. */
function extractFromInitialData(html: string): string | null {
  const vidMatches = html.matchAll(/"videoId"\s*:\s*"([\w-]{11})"/g);
  const liveIndicators = html.matchAll(
    /"isLive[cC]ontent"\s*:\s*true|"liveBroadcastDetails"\s*:\s*\{[^}]*"isLiveNow"\s*:\s*true/gi,
  );
  const livePositions = [...liveIndicators].map((m) => m.index ?? 0);
  const seen = new Set<string>();
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
  return null;
}

/** Extract videoId from any watch?v= URL in the HTML. */
function extractFromWatchUrl(html: string): string | null {
  const m = html.match(/watch\?v=([\w-]{11})/);
  return m?.[1] ?? null;
}


function extractVideoIdFromHtml(
  html: string,
  requireLive = false,
): string | null {
  const live = hasLiveIndicator(html);

  // Strategy 1-2: Meta tags (canonical, og:video)
  const metaId = extractFromMetaTag(html);
  if (metaId && (!requireLive || live)) return metaId;

  // Strategy 3: ytInitialPlayerResponse JSON
  const playerJson = extractFromPlayerResponse(html);
  if (playerJson && (!requireLive || live)) return playerJson;

  // Strategy 4: ytInitialData videoIds near live indicators
  const dataId = extractFromInitialData(html);
  if (dataId && (!requireLive || live)) return dataId;

  // Strategy 5: Any watch?v= URL (only for non-live lookups)
  if (!requireLive) return extractFromWatchUrl(html);

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

function isLockupViewLive(video: any): boolean {
  // Check metadata badges (e.g. BadgeView with style "BADGE_STYLE_TYPE_LIVE")
  const rows: any[] = video?.metadata?.metadata?.metadata_rows ?? [];
  for (const row of rows) {
    const rowBadges: any[] = row.badges ?? [];
    if (rowBadges.some((b: any) => /LIVE/i.test(b?.style ?? ""))) return true;
  }

  // Check thumbnail overlay badges (ThumbnailOverlayBadgeView → ThumbnailBadgeView)
  const overlays: any[] = video?.content_image?.overlays ?? [];
  for (const overlay of overlays) {
    const thumbnailBadges: any[] = overlay?.badges ?? [];
    if (
      thumbnailBadges.some(
        (tb: any) =>
          /LIVE/i.test(tb?.text ?? "") || /LIVE/i.test(tb?.badge_style ?? ""),
      )
    )
      return true;
  }

  return false;
}

function isActuallyLive(video: any): boolean {
  if (!video) return false;
  if (video.is_live === true) return true;

  // Old videoRenderer-style badges
  const badges: any[] = video.badges ?? [];
  if (
    badges.some(
      (b: any) =>
        b?.metadataBadgeRenderer?.label === "LIVE" || b?.liveBadge != null,
    )
  )
    return true;

  // Old videoRenderer-style thumbnail overlays
  const overlays: any[] = video.thumbnailOverlays ?? [];
  if (
    overlays.some(
      (o: any) => o?.thumbnailOverlayTimeStatusRenderer?.style === "LIVE",
    )
  )
    return true;

  // New LockupView-style detection
  if (isLockupViewLive(video)) return true;

  return false;
}

function extractVideoIdFromNode(video: any): string | null {
  return video?.id ?? video?.videoId ?? video?.content_id ?? null;
}

function findLiveInTree(node: any, depth = 0): string | null {
  if (!node || typeof node !== "object" || depth > 8) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findLiveInTree(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  // Old videoRenderer format
  const vr = node.videoRenderer;
  if (vr) {
    const vid = extractVideoIdFromNode(vr);
    if (vid && isActuallyLive(vr)) return vid;
  }

  // New LockupView format (check type string for robustness)
  if (
    node.type === "LockupView" &&
    (node.content_type === "VIDEO" || node.content_type === "MOVIE")
  ) {
    const vid = extractVideoIdFromNode(node);
    if (vid && isActuallyLive(node)) return vid;
  }

  for (const val of Object.values(node)) {
    const found = findLiveInTree(val, depth + 1);
    if (found) return found;
  }
  return null;
}

async function findLiveFromChannel(channel: any, debug: boolean): Promise<string | null> {
  // Strategy 1: Live streams tab
  try {
    const liveStreams = await channel.getLiveStreams();
    const videos: any[] = liveStreams?.videos ?? [];
    if (debug) console.log(`[YouTube Lookup] getLiveStreams() → ${videos.length} videos`);
    const liveVideo = videos.find((v: any) => isActuallyLive(v));
    if (liveVideo) {
      const id = extractVideoIdFromNode(liveVideo);
      if (debug) console.log(`[YouTube Lookup] Found live video in liveStreams: ${id}`);
      if (id) return id;
    }
  } catch (lsErr) {
    if (debug) console.warn("[YouTube Lookup] getLiveStreams failed:", lsErr);
  }

  // Strategy 2: Videos tab
  try {
    const videosTab = await channel.getVideos();
    const videos: any[] = videosTab?.videos ?? [];
    const liveVideo = videos.find((v: any) => isActuallyLive(v));
    if (liveVideo) return extractVideoIdFromNode(liveVideo);
  } catch (videosError) {
    if (debug) console.warn("[YouTube Lookup] getVideos failed:", videosError);
  }

  // Strategy 3: Home feed tree search
  if (channel.hasHome) {
    try {
      const home = await channel.getHome();
      const found = findLiveInTree(home?.contents);
      if (found) return found;
    } catch (homeError) {
      if (debug) console.warn("[YouTube Lookup] Failed to check home feed:", homeError);
    }
  }

  return null;
}

export async function resolveChannelId(
  channelParam: string,
  yt?: any,
): Promise<string | null> {
  const trimmed = (channelParam || "").trim();
  if (!trimmed) return null;

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
        // @handle format: getChannel needs a URL, not a raw handle
        const channelParam = targetId.startsWith("@")
          ? `https://www.youtube.com/${targetId}`
          : targetId;
        channel = await ytClient.getChannel(channelParam);
        if (debug)
          console.log(
            `[YouTube Lookup] getChannel("${targetId}") OK - id=${channel?.basic_info?.id ?? "unknown"}`,
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
      videoId = await findLiveFromChannel(channel, debug);
      finalChannelId =
        finalChannelId ||
        (channel as any).basic_info?.id ||
        (channel as any).header?.author?.id ||
        "";
    }

    // Redirect fallback: fetch the /live page directly (not through Innertube)
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
      // Only cache successful lookups. Null results (no live stream, transient
      // failures) should not be cached so the next poll can retry immediately.
      if (result.videoId) {
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
      }
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
