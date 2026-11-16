import type { APIRoute } from "astro";
import { checkRateLimit } from "../../lib/rateLimit";

const TWITCH_HELIX_BASE = "https://api.twitch.tv/helix";
const VIDEOS_LIMIT = 100;
const CACHE_TTL_MS = 60_000;
const USER_ID_CACHE_TTL_MS = 10 * 60_000;
const MAX_AFTER_LENGTH = 512;

interface CachedVideos {
  expires: number;
  videos: TwitchVideo[];
  cursor: string | null;
}

interface CachedUserId {
  expires: number;
  id: string;
}

interface TwitchVideo {
  id: string;
  title: string;
  thumbnailUrl: string;
  url: string;
  duration: string;
  viewCount: number;
  createdAt: string;
  type: string;
}

const videosCache = new Map<string, CachedVideos>();
const userIdCache = new Map<string, CachedUserId>();

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function resolveTemplateUrl(templateUrl: string, width: number, height: number) {
  if (!templateUrl) return "";
  return templateUrl
    .replace(/%\{width\}/g, String(width))
    .replace(/\{width\}/g, String(width))
    .replace(/%\{height\}/g, String(height))
    .replace(/\{height\}/g, String(height));
}

async function helixGet(path: string, accessToken: string, clientId: string) {
  const res = await fetch(`${TWITCH_HELIX_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": clientId,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw Object.assign(new Error(`Helix ${path} ${res.status}`), {
      status: res.status,
    });
  }
  return res.json();
}

export const GET: APIRoute = async ({ url, cookies, request }) => {
  const clientAddress =
    request.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ||
    "unknown";
  if (!checkRateLimit(`${clientAddress}:twitch-videos`, 60, 60_000)) {
    return json({ error: "Too many requests" }, { status: 429 });
  }

  const login = url.searchParams.get("login")?.trim();
  if (!login || !/^[a-zA-Z0-9_]+$/.test(login)) {
    return json({ error: "Valid login parameter required" }, { status: 400 });
  }

  const after = url.searchParams.get("after")?.trim() || null;
  if (after && after.length > MAX_AFTER_LENGTH) {
    return json({ error: "Invalid pagination cursor" }, { status: 400 });
  }

  const accessToken = cookies.get("twitch_token")?.value;
  if (!accessToken) {
    return json({ error: "Twitch authentication required" }, { status: 401 });
  }

  const clientId = import.meta.env.PUBLIC_TWITCH_CLIENT_ID;
  if (!clientId) {
    return json({ error: "Server configuration error" }, { status: 500 });
  }

  const cacheKey = `${login.toLowerCase()}:${after ?? ""}`;
  const cached = videosCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return json({ videos: cached.videos, cursor: cached.cursor });
  }

  try {
    let userId = userIdCache.get(login.toLowerCase());
    if (!userId || userId.expires <= Date.now()) {
      const usersRes = await helixGet(
        `/users?login=${encodeURIComponent(login)}`,
        accessToken,
        clientId,
      );
      const user = usersRes?.data?.[0];
      if (!user) {
        return json({ videos: [], cursor: null });
      }
      userId = { id: user.id, expires: Date.now() + USER_ID_CACHE_TTL_MS };
      userIdCache.set(login.toLowerCase(), userId);
    }

    const videosRes = await helixGet(
      `/videos?user_id=${encodeURIComponent(userId.id)}&first=${VIDEOS_LIMIT}&type=archive&sort=time${
        after ? `&after=${encodeURIComponent(after)}` : ""
      }`,
      accessToken,
      clientId,
    );

    const videos: TwitchVideo[] = (videosRes?.data ?? [])
      .filter((video: any) => video?.id && video?.thumbnail_url)
      .map((video: any) => ({
        id: video.id,
        title: video.title,
        thumbnailUrl: resolveTemplateUrl(video.thumbnail_url, 320, 180),
        url: video.url,
        duration: video.duration,
        viewCount: video.view_count ?? 0,
        createdAt: video.created_at,
        type: video.type,
      }));

    const cursor = videosRes?.pagination?.cursor ?? null;

    videosCache.set(cacheKey, {
      expires: Date.now() + CACHE_TTL_MS,
      videos,
      cursor,
    });

    return json({ videos, cursor });
  } catch (error: any) {
    const status: number | undefined = error?.status;
    if (status === 401 || status === 403) {
      return json(
        { error: "Twitch authentication expired. Please re-login." },
        { status: 401 },
      );
    }
    console.error("[twitch-videos] failed:", error?.message || error);
    return json({ error: "Failed to load channel videos" }, { status: 500 });
  }
};
