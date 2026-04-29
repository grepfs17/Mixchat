import { getInnertube } from './youtube';

const CHANNEL_ID_RE = /^UC[\w-]{22}$/;
const HANDLE_RE = /^@[\w.]{1,100}$/;
const YT_URL_RE = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i;

const DEFAULT_TTL = 30_000;

type LookupResult = { videoId: string | null; channelId: string };

const channelLiveCache = new Map<string, { videoId: string | null; channelId: string; expires: number }>();
const inflightLiveLookup = new Map<string, Promise<LookupResult>>();

function parsePathCandidateFromUrl(channelUrlParam: string): string | null {
  try {
    const parsed = new URL(channelUrlParam);
    let candidate = (parsed.pathname || '').replace(/^\/+/, '');
    if (candidate.startsWith('channel/')) candidate = candidate.split('/')[1] || candidate;
    if (candidate.startsWith('user/')) candidate = candidate.split('/')[1] || candidate;
    return candidate || null;
  } catch {
    return null;
  }
}

const USER_AGENT = process.env.YT_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const REFERER = 'https://www.youtube.com/';
const ORIGIN = 'https://www.youtube.com';

function buildFetchHeaders(cookies?: string): HeadersInit {
  return {
    'User-Agent': USER_AGENT,
    'Referer': REFERER,
    'Origin': ORIGIN,
    'Accept-Language': 'en-US,en;q=0.9',
    ...(cookies ? { 'Cookie': cookies } : {}),
  };
}

async function redirectFallbackLive(channelParam: string): Promise<string | null> {
  try {
    const candidates: string[] = [];
    const isFullUrl = YT_URL_RE.test(channelParam);
    if (isFullUrl) {
      candidates.push(channelParam.replace(/\/$/, '') + '/live');
    } else if (channelParam.startsWith('@')) {
      candidates.push(`https://www.youtube.com/${channelParam.replace(/^\/+/, '')}/live`);
    } else if (CHANNEL_ID_RE.test(channelParam)) {
      candidates.push(`https://www.youtube.com/channel/${channelParam}/live`);
    } else {
      candidates.push(`https://www.youtube.com/${channelParam.replace(/^\/+/, '')}/live`);
    }

    const fetchOptions: RequestInit = {
      method: 'GET',
      redirect: 'follow',
      headers: buildFetchHeaders(),
    };

    for (const candidate of candidates) {
      try {
        const res = await fetch(candidate, fetchOptions);
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
        continue;
      }
    }
  } catch (err) { }
  return null;
}

function isActuallyLive(video: any): boolean {
  if (!video) return false;
  if (video.is_live === true) return true;
  const badges: any[] = video.badges ?? [];
  if (badges.some((b: any) => b?.metadataBadgeRenderer?.label === 'LIVE' || b?.liveBadge != null)) return true;
  const overlays: any[] = video.thumbnailOverlays ?? [];
  if (overlays.some((o: any) => o?.thumbnailOverlayTimeStatusRenderer?.style === 'LIVE')) return true;
  return false;
}

export async function resolveChannelId(channelParam: string, yt?: any): Promise<string | null> {
  const trimmed = (channelParam || '').trim();
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
      } else if (!isFullUrl && !trimmed.includes('/')) {
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
    if (pathCandidate) return pathCandidate;
    return null;
  }

  return trimmed;
}

export function isValidYouTubeParam(param: string | null | undefined): boolean {
  if (!param) return false;
  return YT_URL_RE.test(param) || CHANNEL_ID_RE.test(param) || HANDLE_RE.test(param);
}

export async function findLiveForChannel(channelParam: string, options?: { yt?: any; ttl?: number; debug?: boolean }): Promise<LookupResult> {
  const trimmedParam = (channelParam || '').trim();
  if (!trimmedParam) return { videoId: null, channelId: '' };

  const debug = options?.debug ?? (process.env.YT_DEBUG === '1');
  const ttl = options?.ttl ?? DEFAULT_TTL;
  const paramKey = `param:${trimmedParam}`;
  const now = Date.now();

  // Fast cache check by original param
  const cached = channelLiveCache.get(paramKey);
  if (cached && cached.expires > now) {
    return { videoId: cached.videoId, channelId: cached.channelId };
  }

  if (inflightLiveLookup.has(paramKey)) return inflightLiveLookup.get(paramKey)!;

  const lookup = (async (): Promise<LookupResult> => {
    // Ensure we have an Innertube client for the richer lookups
    let ytClient = options?.yt;
    try {
      if (!ytClient) ytClient = await getInnertube();
    } catch (err) {
      if (debug) console.warn('[YouTube Lookup] getInnertube failed', err);
      ytClient = null;
    }

    // Try to resolve channel -> canonical id
    let resolvedChannelId: string | null = null;
    try {
      resolvedChannelId = await resolveChannelId(trimmedParam, ytClient);
    } catch (e) {
      if (debug) console.warn('[YouTube Lookup] resolveChannelId failed', e);
    }

    const idKey = resolvedChannelId ? `id:${resolvedChannelId}` : null;
    if (idKey) {
      const cachedById = channelLiveCache.get(idKey);
      if (cachedById && cachedById.expires > Date.now()) return { videoId: cachedById.videoId, channelId: cachedById.channelId };
      if (inflightLiveLookup.has(idKey)) return inflightLiveLookup.get(idKey)!;
    }

    let channel: any = null;
    let videoId: string | null = null;
    let finalChannelId = resolvedChannelId || '';

    if (ytClient && (resolvedChannelId || trimmedParam)) {
      const targetId = resolvedChannelId || trimmedParam;
      try {
        channel = await ytClient.getChannel(targetId);
      } catch (chErr) {
        if (debug) console.warn(`[YouTube Lookup] getChannel failed for "${targetId}" (source: "${trimmedParam}")`, chErr);
        channel = null;
      }
    }

    if (channel) {
      try {
        const liveStreams = await (channel as any).getLiveStreams();
        const videos: any[] = liveStreams?.videos ?? [];
        const liveVideo = videos.find((v: any) => isActuallyLive(v));
        if (liveVideo) {
          videoId = liveVideo.id ?? liveVideo.videoId ?? null;
        } else if (videos.length > 0) {
          videoId = videos[0].id ?? videos[0].videoId ?? null;
        }
      } catch (lsErr) {
        if (debug) console.warn('[YouTube Lookup] getLiveStreams failed:', lsErr);
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
          if (debug) console.warn('[YouTube Lookup] getVideos failed:', videosError);
        }
      }

      if (!videoId) {
        try {
          const home = await (channel as any).getHome();

          function findLiveInTree(node: any, depth = 0): string | null {
            if (!node || typeof node !== 'object' || depth > 8) return null;
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
              if (vid && (
                vr.isLiveContent === true ||
                (vr.badges ?? []).some((b: any) => b?.metadataBadgeRenderer?.label === 'LIVE') ||
                (vr.thumbnailOverlays ?? []).some((o: any) => o?.thumbnailOverlayTimeStatusRenderer?.style === 'LIVE')
              )) {
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
          if (debug) console.warn('[YouTube Lookup] Failed to check home feed:', homeError);
        }
      }

      finalChannelId = finalChannelId || ((channel as any).basic_info?.id || (channel as any).header?.author?.id || '');
    }

    // Redirect fallback
    if (!videoId) {
      try {
        const redirectVid = await redirectFallbackLive(trimmedParam);
        if (redirectVid) videoId = redirectVid;
      } catch (err) {
        if (debug) console.warn('[YouTube Lookup] Redirect fallback error:', err);
      }
    }

    const result: LookupResult = { videoId, channelId: finalChannelId || '' };
    try {
      channelLiveCache.set(paramKey, { videoId: result.videoId, channelId: result.channelId, expires: Date.now() + ttl });
      if (result.channelId) channelLiveCache.set(`id:${result.channelId}`, { videoId: result.videoId, channelId: result.channelId, expires: Date.now() + ttl });
    } catch { }

    return result;
  })();

  inflightLiveLookup.set(paramKey, lookup);
  lookup.then((res) => {
    inflightLiveLookup.delete(paramKey);
    if (res.channelId) inflightLiveLookup.delete(`id:${res.channelId}`);
  }).catch(() => inflightLiveLookup.delete(paramKey));

  return lookup;
}

export default findLiveForChannel;

