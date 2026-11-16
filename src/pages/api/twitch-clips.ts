import type { APIRoute } from "astro";
import { checkRateLimit } from "../../lib/rateLimit";

const TWITCH_HELIX_BASE = "https://api.twitch.tv/helix";
const CLIPS_LIMIT = 50;
const CACHE_TTL_MS = 60_000;
const USER_ID_CACHE_TTL_MS = 10 * 60_000;
const MAX_AFTER_LENGTH = 512;
const PERIOD_DAYS: Record<string, number> = {
  day: 1,
  week: 7,
  month: 30,
};

interface CachedClips {
  expires: number;
  clips: TwitchClip[];
  cursor: string | null;
}

interface CachedUserId {
  expires: number;
  id: string;
}

interface TwitchClip {
  id: string;
  url: string;
  title: string;
  thumbnailUrl: string;
  duration: number;
  viewCount: number;
  createdAt: string;
  creatorName: string;
}

const clipsCache = new Map<string, CachedClips>();
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
  if (!checkRateLimit(`${clientAddress}:twitch-clips`, 60, 60_000)) {
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

  const period = url.searchParams.get("period") || "month";
  if (period !== "all" && !PERIOD_DAYS[period]) {
    return json({ error: "Invalid period" }, { status: 400 });
  }
  const featuredOnly = url.searchParams.get("featured") === "true";

  const accessToken = cookies.get("twitch_token")?.value;
  if (!accessToken) {
    return json({ error: "Twitch authentication required" }, { status: 401 });
  }

  const clientId = import.meta.env.PUBLIC_TWITCH_CLIENT_ID;
  if (!clientId) {
    return json({ error: "Server configuration error" }, { status: 500 });
  }

  const cacheKey = `${login.toLowerCase()}:${period}:${
    featuredOnly ? "featured" : "all"
  }:${after ?? ""}`;
  const cached = clipsCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return json({ clips: cached.clips, cursor: cached.cursor });
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
        return json({ clips: [], cursor: null });
      }
      userId = { id: user.id, expires: Date.now() + USER_ID_CACHE_TTL_MS };
      userIdCache.set(login.toLowerCase(), userId);
    }

    // The clips API returns results by view count, not date. The period filter
    // bounds the query to a recent window, matching Twitch's clips tab.
    const params = new URLSearchParams({
      broadcaster_id: userId.id,
      first: String(CLIPS_LIMIT),
    });
    const periodDays = PERIOD_DAYS[period];
    if (periodDays) {
      const endedAt = new Date();
      const startedAt = new Date(
        endedAt.getTime() - periodDays * 24 * 60 * 60 * 1000,
      );
      startedAt.setSeconds(0, 0);
      endedAt.setSeconds(0, 0);
      params.set("started_at", startedAt.toISOString());
      params.set("ended_at", endedAt.toISOString());
    }
    if (featuredOnly) params.set("is_featured", "true");
    if (after) params.set("after", after);

    const clipsRes = await helixGet(
      `/clips?${params.toString()}`,
      accessToken,
      clientId,
    );

    const clips: TwitchClip[] = (clipsRes?.data ?? [])
      .filter((clip: any) => clip?.id && clip?.url)
      .map((clip: any) => ({
        id: clip.id,
        url: clip.url,
        title: clip.title || "Untitled clip",
        thumbnailUrl: resolveTemplateUrl(clip.thumbnail_url, 320, 180),
        duration: clip.duration ?? 0,
        viewCount: clip.view_count ?? 0,
        createdAt: clip.created_at,
        creatorName: clip.creator_name ?? "",
      }));

    const cursor = clipsRes?.pagination?.cursor ?? null;

    clipsCache.set(cacheKey, {
      expires: Date.now() + CACHE_TTL_MS,
      clips,
      cursor,
    });

    return json({ clips, cursor });
  } catch (error: any) {
    const status: number | undefined = error?.status;
    if (status === 401 || status === 403) {
      return json(
        { error: "Twitch authentication expired. Please re-login." },
        { status: 401 },
      );
    }
    console.error("[twitch-clips] failed:", error?.message || error);
    return json({ error: "Failed to load channel clips" }, { status: 500 });
  }
};
