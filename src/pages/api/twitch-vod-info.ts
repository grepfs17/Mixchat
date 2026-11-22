import type { APIRoute } from "astro";
import { clientAddress } from "../../lib/clientAddress";
import { checkRateLimit } from "../../lib/rateLimit";

const GQL_CLIENT_ID = "kd1unb4b3q4t58fwlpcbzcbnm76a8fp";
const CHAPTERS_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
const GQL_URL = "https://gql.twitch.tv/gql";
const CHAPTERS_HASH =
  "71835d5ef425e154bf282453a926d99b328cdc5e32f36d3a209d0f4778b41203";
const CACHE_TTL_MS = 10 * 60_000;
const MAX_CACHE_ENTRIES = 500;

interface VodGameChange {
  offsetSeconds: number;
  gameId: string;
  gameName: string;
}

interface CachedVodInfo {
  expires: number;
  info: VodInfo;
}

interface VodInfo {
  id: string;
  title: string;
  gameId: string;
  gameName: string;
  gameChanges: VodGameChange[];
}

const cache = new Map<string, CachedVodInfo>();

/** Drop expired entries, then the oldest ones if the cache is still full. */
function storeCachedInfo(videoId: string, info: VodInfo): void {
  const now = Date.now();
  for (const [id, entry] of cache) {
    if (entry.expires <= now) cache.delete(id);
  }
  cache.set(videoId, { expires: now + CACHE_TTL_MS, info });
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

const VOD_INFO_QUERY = `query MixchatVodInfo($id: ID!) {
  video(id: $id) {
    id
    title
    game {
      id
      name
      displayName
    }
  }
}`;

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

interface ChapterMoment {
  type?: string;
  positionMilliseconds?: number;
  details?: {
    game?: { id?: string; displayName?: string };
  };
}

/**
 * Twitch stores mid-broadcast category changes as GAME_CHANGE moments. Older
 * or single-category VODs return an empty list, in which case the video's
 * primary game is used.
 */
async function fetchGameChanges(videoId: string): Promise<VodGameChange[]> {
  try {
    const res = await fetch(GQL_URL, {
      method: "POST",
      headers: {
        "Client-ID": CHAPTERS_CLIENT_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        operationName: "VideoPlayer_ChapterSelectButtonVideo",
        variables: { videoID: videoId },
        extensions: {
          persistedQuery: { version: 1, sha256Hash: CHAPTERS_HASH },
        },
      }),
    });
    if (!res.ok) return [];

    const payload = await res.json();
    const edges = payload?.data?.video?.moments?.edges;
    if (!Array.isArray(edges)) return [];

    return edges
      .map((edge: { node?: ChapterMoment }) => edge?.node)
      .filter(
        (node: ChapterMoment | undefined): node is ChapterMoment =>
          node?.type === "GAME_CHANGE" &&
          Boolean(node.details?.game?.displayName),
      )
      .map((node) => ({
        offsetSeconds: Math.max(
          0,
          Math.floor((node.positionMilliseconds ?? 0) / 1000),
        ),
        gameId: node.details?.game?.id ?? "",
        gameName: node.details?.game?.displayName ?? "",
      }))
      .sort((a, b) => a.offsetSeconds - b.offsetSeconds);
  } catch {
    return [];
  }
}

export const GET: APIRoute = async ({ url, request }) => {
  if (
    !checkRateLimit(`${clientAddress(request)}:twitch-vod-info`, 60, 60_000)
  ) {
    return json({ error: "Too many requests" }, { status: 429 });
  }

  const videoId = url.searchParams.get("video_id")?.trim();
  if (!videoId || !/^\d+$/.test(videoId)) {
    return json({ error: "Valid video_id parameter required" }, { status: 400 });
  }

  const cached = cache.get(videoId);
  if (cached && cached.expires > Date.now()) {
    return json(cached.info);
  }

  try {
    const res = await fetch(GQL_URL, {
      method: "POST",
      headers: {
        "Client-ID": GQL_CLIENT_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: VOD_INFO_QUERY,
        variables: { id: videoId },
      }),
    });

    if (!res.ok) {
      return json(
        { error: `Twitch video request failed (${res.status})` },
        { status: res.status === 429 ? 429 : 502 },
      );
    }

    const payload = await res.json();
    if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
      const message = payload.errors[0]?.message || "Twitch GQL error";
      return json({ error: message }, { status: 502 });
    }

    const video = payload?.data?.video;
    if (!video) {
      return json({ error: "VOD not found" }, { status: 404 });
    }

    const gameChanges = await fetchGameChanges(videoId);
    const info: VodInfo = {
      id: video.id ?? videoId,
      title: video.title ?? "",
      gameId: video.game?.id ?? "",
      gameName: video.game?.displayName || video.game?.name || "",
      gameChanges,
    };

    storeCachedInfo(videoId, info);
    return json(info);
  } catch (error) {
    console.error("[twitch-vod-info] failed:", error);
    return json({ error: "Failed to load VOD info" }, { status: 502 });
  }
};
