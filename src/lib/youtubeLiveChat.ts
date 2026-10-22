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

/**
 * A single message as returned by the official Data API `liveChatMessages.list`.
 * `id` here is the *official* Data API id, the one accepted by
 * `liveChatMessages.delete`.
 */
interface ListedLiveChatMessage {
  id: string;
  channelId?: string;
  text: string;
  publishedAtMs: number;
}

const messageListCache = new Map<
  string,
  { messages: ListedLiveChatMessage[]; expires: number }
>();
const inflightMessageLists = new Map<
  string,
  Promise<ListedLiveChatMessage[]>
>();
const MESSAGE_LIST_TTL_MS = 2_000;

function normalizeMessageText(s: string): string {
  return s.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Fetches recent messages for a live chat via the official Data API. Results
 * are cached briefly so rapid sequential moderation actions reuse one request.
 */
async function listLiveChatMessages(
  liveChatId: string,
  accessToken: string,
): Promise<ListedLiveChatMessage[]> {
  const now = Date.now();
  const cached = messageListCache.get(liveChatId);
  if (cached && cached.expires > now) return cached.messages;

  const inflight = inflightMessageLists.get(liveChatId);
  if (inflight) return inflight;

  const promise = (async (): Promise<ListedLiveChatMessage[]> => {
    const data = await googleFetch(
      `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${encodeURIComponent(
        liveChatId,
      )}&part=snippet,authorDetails&maxResults=2000`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
      { action: "liveChatMessages.list", liveChatId },
    );
    const items: ListedLiveChatMessage[] = (data?.items ?? []).map(
      (it: any) => ({
        id: it.id,
        channelId: it.authorDetails?.channelId,
        text: it.snippet?.displayMessage ?? "",
        publishedAtMs: it.snippet?.publishedAt
          ? Date.parse(it.snippet.publishedAt)
          : 0,
      }),
    );
    messageListCache.set(liveChatId, {
      messages: items,
      expires: Date.now() + MESSAGE_LIST_TTL_MS,
    });
    return items;
  })();

  inflightMessageLists.set(liveChatId, promise);
  try {
    return await promise;
  } finally {
    inflightMessageLists.delete(liveChatId);
  }
}

/**
 * Resolves the official Data API `liveChatMessage.id` for a message.
 *
 * The id surfaced by youtubei.js (InnerTube) does NOT match the id expected by
 * `liveChatMessages.delete`, so we look the message up in the official message
 * list and match it by author channel id, text, and closest publish time.
 *
 * Returns `null` when no confident match is found (e.g. the message has already
 * scrolled out of the recent window).
 */
export async function resolveLiveChatMessageId(
  videoId: string,
  accessToken: string,
  target: { channelId?: string; text?: string; publishedAtMs?: number },
): Promise<string | null> {
  const liveChatId = await resolveActiveLiveChatId(videoId, accessToken);
  if (!liveChatId) return null;

  let messages = await listLiveChatMessages(liveChatId, accessToken);
  if (!messages.length) return null;

  if (target.channelId) {
    messages = messages.filter((m) => m.channelId === target.channelId);
  }
  if (!messages.length) return null;

  if (target.text != null && target.text !== "") {
    const want = normalizeMessageText(target.text);
    const textMatches = messages.filter(
      (m) => normalizeMessageText(m.text) === want,
    );
    // Only narrow to text matches when we actually found some. Otherwise keep
    // the channel-filtered set (e.g. stickers/superchats have no text).
    if (textMatches.length) messages = textMatches;
  }

  if (typeof target.publishedAtMs === "number") {
    const ref = target.publishedAtMs;
    messages = [...messages].sort(
      (a, b) =>
        Math.abs(a.publishedAtMs - ref) - Math.abs(b.publishedAtMs - ref),
    );
  } else {
    messages = [...messages].sort((a, b) => b.publishedAtMs - a.publishedAtMs);
  }

  return messages[0]?.id ?? null;
}
