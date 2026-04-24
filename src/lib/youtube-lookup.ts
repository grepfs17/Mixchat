import { getInnertube } from './youtube';
import { loadServerCredentials } from './youtube-server-auth';

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

async function authenticatedDataApiFetch(url: string): Promise<any> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };

  // Try to use OAuth token first if available
  const creds = await loadServerCredentials();
  if (creds?.access_token) {
    headers['Authorization'] = `Bearer ${creds.access_token}`;
  }

  // If no OAuth token, we MUST have an API key in the URL or headers
  // (The URL passed in usually already has &key=... if using API key fallback)

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      console.warn(`[YouTube Data API] Request failed with status ${res.status}: ${errorBody.slice(0, 500)}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error('[YouTube Data API] Fetch error:', err);
    return null;
  }
}

async function dataApiResolveChannelId(q: string): Promise<string | null> {
  const apiKey = process.env.YT_API_KEY;
  // We can proceed if we have an API key OR if we have server credentials (which will be handled by authenticatedDataApiFetch)
  const creds = await loadServerCredentials();
  if (!apiKey && !creds?.access_token) return null;

  try {
    let searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=channel&maxResults=1`;
    if (apiKey) searchUrl += `&key=${apiKey}`;

    const sdata = await authenticatedDataApiFetch(searchUrl);
    return sdata?.items?.length ? sdata.items[0]?.id?.channelId || null : null;
  } catch (err) {
    return null;
  }
}

async function dataApiFindLiveForChannelId(apiChannelId: string): Promise<string | null> {
  const apiKey = process.env.YT_API_KEY;
  const creds = await loadServerCredentials();
  if (!apiKey && !creds?.access_token) return null;

  try {
    let apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(apiChannelId)}&eventType=live&type=video&maxResults=1`;
    if (apiKey) apiUrl += `&key=${apiKey}`;

    const data = await authenticatedDataApiFetch(apiUrl);
    if (data?.items?.length) return data.items[0]?.id?.videoId || data.items[0]?.snippet?.resourceId?.videoId || null;
    return null;
  } catch (err) {
    return null;
  }
}

export async function dataApiFindLiveForParam(channelParam: string): Promise<LookupResult | null> {
  const apiKey = process.env.YT_API_KEY;
  const creds = await loadServerCredentials();
  if (!apiKey && !creds?.access_token) return null;
  let apiChannelId = channelParam;
  if (!CHANNEL_ID_RE.test(apiChannelId)) {
    const resolved = await dataApiResolveChannelId(apiChannelId);
    if (resolved) apiChannelId = resolved;
  }
  if (!CHANNEL_ID_RE.test(apiChannelId)) return null;
  const vid = await dataApiFindLiveForChannelId(apiChannelId);
  if (vid) return { videoId: vid, channelId: apiChannelId };
  return null;
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

    for (const candidate of candidates) {
      try {
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

  const preferDataApi = process.env.YT_PREFER_DATA_API === '1' || process.env.YT_PREFER_DATA_API === 'true';

  // If Data API is preferred, try it first for handle/URL resolution
  if (preferDataApi) {
    const resolved = await dataApiResolveChannelId(trimmed);
    if (resolved) return resolved;
  }

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

  // Fallback to Data API if InnerTube failed or wasn't tried yet
  if (!preferDataApi) {
    const resolved = await dataApiResolveChannelId(trimmed);
    if (resolved) return resolved;
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

export async function findLiveForChannel(channelParam: string, options?: { yt?: any; preferDataApi?: boolean; ttl?: number; debug?: boolean }): Promise<LookupResult> {
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
    const preferDataApi = options?.preferDataApi ?? (process.env.YT_PREFER_DATA_API === '1' || process.env.YT_PREFER_DATA_API === 'true');

    // Optional Data API pre-check (useful when not authenticated or explicitly preferred)
    if (preferDataApi) {
      try {
        const apiResult = await dataApiFindLiveForParam(trimmedParam);
        if (apiResult?.videoId) {
          channelLiveCache.set(paramKey, { videoId: apiResult.videoId, channelId: apiResult.channelId, expires: Date.now() + ttl });
          if (apiResult.channelId) channelLiveCache.set(`id:${apiResult.channelId}`, { videoId: apiResult.videoId, channelId: apiResult.channelId, expires: Date.now() + ttl });
          return { videoId: apiResult.videoId, channelId: apiResult.channelId };
        }
      } catch (e) {
        if (debug) console.warn('[YouTube Lookup] Data API pre-check error', e);
      }
    }

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

    // Data API fallback (if not already tried)
    const apiKey = process.env.YT_API_KEY;
    const creds = await loadServerCredentials();
    if (!videoId && (apiKey || creds?.access_token)) {
      try {
        const apiResult = await dataApiFindLiveForParam(trimmedParam);
        if (apiResult?.videoId) {
          videoId = apiResult.videoId;
          finalChannelId = apiResult.channelId || finalChannelId;
        }
      } catch (err) {
        if (debug) console.warn('[YouTube Lookup] Data API fallback error:', err);
      }
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
