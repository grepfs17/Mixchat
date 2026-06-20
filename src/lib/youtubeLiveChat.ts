import { googleFetch } from "./google";

const liveChatIdCache = new Map<
  string,
  { liveChatId: string | null; expires: number }
>();
const inflightVideos = new Map<string, Promise<string | null>>();

const CACHE_TTL_MS = 300_000;
const NEGATIVE_TTL_MS = 60_000;

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of liveChatIdCache) {
    if (now > entry.expires) liveChatIdCache.delete(key);
  }
}, 120_000);

export function invalidateLiveChatId(videoId: string) {
  liveChatIdCache.delete(videoId);
}

/**
 * Resolves the active `liveChatId` for a given YouTube live video via the
 * official Data API v3. Results are cached in memory and de-duplicated across
 * concurrent callers.
 */
export async function resolveActiveLiveChatId(
  videoId: string,
  accessToken: string,
): Promise<string | null> {
  const now = Date.now();
  const cached = liveChatIdCache.get(videoId);
  if (cached && cached.expires > now) {
    console.debug(
      "[YouTube LiveChat] Using cached liveChatId for",
      videoId,
      cached.liveChatId,
    );
    return cached.liveChatId;
  }

  const inflight = inflightVideos.get(videoId);
  if (inflight) return inflight;

  const promise = (async (): Promise<string | null> => {
    try {
      const data = await googleFetch(
        `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${encodeURIComponent(videoId)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
        { action: "videos.list", videoId },
      );
      const chatId = data?.items?.[0]?.liveStreamingDetails?.activeLiveChatId;
      if (chatId) {
        liveChatIdCache.set(videoId, {
          liveChatId: chatId,
          expires: Date.now() + CACHE_TTL_MS,
        });
        return chatId;
      }
      console.warn(
        "[YouTube LiveChat] No liveChatId via Data API for",
        videoId,
      );
    } catch (e) {
      console.error("[YouTube LiveChat] Data API videos.list failed:", e);
    }

    liveChatIdCache.set(videoId, {
      liveChatId: null,
      expires: Date.now() + NEGATIVE_TTL_MS,
    });
    return null;
  })();

  inflightVideos.set(videoId, promise);
  try {
    return await promise;
  } finally {
    inflightVideos.delete(videoId);
  }
}
