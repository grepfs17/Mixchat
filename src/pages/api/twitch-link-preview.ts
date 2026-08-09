import type { APIRoute } from "astro";
import { checkRateLimit } from "../../lib/rateLimit";
import { IS_TWITCH_ONLY, twitchOnlyResponse } from "../../lib/constants";
import {
  type TwitchLinkKind,
  type TwitchLinkParts,
  parseTwitchUrl,
} from "../../lib/twitchLink";

/**
 * In-memory cache: keyed by (kind:identifier) so a burst of chat messages
 * sharing the same Twitch link only triggers one upstream call. 5 minute TTL
 * balances "fresh enough for live/offline changes" with "don't hammer Helix
 * when chat re-renders for unrelated reasons".
 */
interface CacheEntry {
  expires: number;
  data: TwitchLinkPreviewResponse;
}
const previewCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

interface AuthorInfo {
  login?: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface TwitchLinkPreviewResponse {
  kind: TwitchLinkKind;
  url: string;
  href: string;
  title: string;
  author: AuthorInfo;
  /** Clip-only: who created this clip (different from the broadcaster). */
  creator?: AuthorInfo;
  thumbnailUrl: string;
  live: boolean;
  viewers?: number;
  gameName?: string;
  duration?: string;
  views?: number;
}

const TWITCH_HELIX_BASE = "https://api.twitch.tv/helix";

async function helixGet(
  path: string,
  accessToken: string,
  clientId: string,
): Promise<any> {
  const res = await fetch(`${TWITCH_HELIX_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": clientId,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw Object.assign(new Error(`Helix ${path} ${res.status}`), {
      status: res.status,
      body,
    });
  }
  return res.json();
}

/** Replace Helix's `{width}`/`{height}` template placeholders with explicit values. */
function resolveTemplateUrl(templateUrl: string, width: number, height: number) {
  if (!templateUrl) return "";
  return templateUrl
    .replace(/%\{width\}/g, String(width))
    .replace(/\{width\}/g, String(width))
    .replace(/%\{height\}/g, String(height))
    .replace(/\{height\}/g, String(height));
}

function formatThumbnail(thumb: string): string {
  return resolveTemplateUrl(thumb, 320, 180) || thumb;
}

async function fetchChannelPreview(
  login: string,
  accessToken: string,
  clientId: string,
): Promise<TwitchLinkPreviewResponse | null> {
  const [usersRes, streamsRes] = await Promise.all([
    helixGet(
      `/users?login=${encodeURIComponent(login)}`,
      accessToken,
      clientId,
    ).catch(() => ({ data: [] })),
    helixGet(
      `/streams?user_login=${encodeURIComponent(login)}&first=1`,
      accessToken,
      clientId,
    ).catch(() => ({ data: [] })),
  ]);

  const user = usersRes?.data?.[0];
  if (!user) return null;
  const stream = streamsRes?.data?.[0];

  const thumb =
    stream?.thumbnail_url && stream.thumbnail_url.length > 0
      ? formatThumbnail(stream.thumbnail_url)
      : user.offline_image_url || "";

  return {
    kind: "channel",
    url: `https://www.twitch.tv/${encodeURIComponent(login)}`,
    href: `https://www.twitch.tv/${encodeURIComponent(login)}`,
    title:
      stream?.title ||
      user.description ||
      user.display_name ||
      `${user.login} on Twitch`,
    author: {
      login: user.login,
      displayName: user.display_name,
      avatarUrl: user.profile_image_url,
    },
    thumbnailUrl: thumb,
    live: !!stream,
    viewers: stream?.viewer_count ?? 0,
    gameName: stream?.game_name ?? "",
  };
}

async function fetchVideoPreview(
  videoId: string,
  accessToken: string,
  clientId: string,
): Promise<TwitchLinkPreviewResponse | null> {
  const videosRes = await helixGet(
    `/videos?id=${encodeURIComponent(videoId)}`,
    accessToken,
    clientId,
  );
  const video = videosRes?.data?.[0];
  if (!video) return null;

  const usersRes = await helixGet(
    `/users?id=${encodeURIComponent(video.user_id)}`,
    accessToken,
    clientId,
  ).catch(() => ({ data: [] }));
  const user = usersRes?.data?.[0];
  return {
    kind: "video",
    url: `https://www.twitch.tv/videos/${videoId}`,
    href: `https://www.twitch.tv/videos/${videoId}`,
    title: video.title,
    author: {
      login: user?.login,
      displayName: user?.display_name ?? user?.login,
      avatarUrl: user?.profile_image_url,
    },
    thumbnailUrl: formatThumbnail(video.thumbnail_url || ""),
    live: false,
    duration: video.duration,
    views: video.view_count,
  };
}

async function fetchClipPreview(
  parts: TwitchLinkParts,
  accessToken: string,
  clientId: string,
): Promise<TwitchLinkPreviewResponse | null> {
  // Chat links are typed by users using slugs (e.g.
  // `lunateac/clip/GracefulExuberantTriangleRlyTho-...`). Try `slug=`
  // first since `id=` would 400 on slug-shaped identifiers. Fallback to
  // `id=` only if Helix returns nothing for the slug query.
  let clip: any | null = null;
  const bySlug = await helixGet(
    `/clips?slug=${encodeURIComponent(parts.clipSlug!)}`,
    accessToken,
    clientId,
  ).catch(() => ({ data: [] }));
  clip = bySlug?.data?.[0] ?? null;
  if (!clip) {
    const byId = await helixGet(
      `/clips?id=${encodeURIComponent(parts.clipSlug!)}`,
      accessToken,
      clientId,
    ).catch(() => ({ data: [] }));
    clip = byId?.data?.[0] ?? null;
  }
  if (!clip) return null;

  const ids = Array.from(
    new Set([clip.creator_id, clip.broadcaster_id].filter(Boolean)),
  ).join("&id=");
  let broadcaster: any = null;
  let creator: any = null;
  if (ids) {
    const usersRes = await helixGet(
      `/users?id=${ids}`,
      accessToken,
      clientId,
    ).catch(() => ({ data: [] }));
    const users = usersRes?.data ?? [];
    broadcaster = users.find((u: any) => u.id === clip.broadcaster_id) || null;
    creator = users.find((u: any) => u.id === clip.creator_id) || null;
  }

  return {
    kind: "clip",
    url: parts.url,
    href: parts.href,
    title: clip.title,
    author: {
      login: broadcaster?.login,
      displayName: broadcaster?.display_name ?? broadcaster?.login,
      avatarUrl: broadcaster?.profile_image_url,
    },
    creator: {
      login: creator?.login,
      displayName: creator?.display_name ?? creator?.login,
      avatarUrl: creator?.profile_image_url,
    },
    thumbnailUrl: formatThumbnail(clip.thumbnail_url || ""),
    live: false,
    duration: clip.duration?.toString?.() ?? undefined,
    views: clip.view_count,
  };
}

function cacheKeyFor(parts: TwitchLinkParts): string {
  switch (parts.kind) {
    case "channel":
      return `channel:${parts.channel}`;
    case "video":
      return `video:${parts.videoId}`;
    case "clip":
      return `clip:${parts.channel ?? "_"}:${parts.clipSlug}`;
  }
}

function buildUrl(parts: TwitchLinkParts): string {
  if (parts.kind === "channel") {
    return `https://www.twitch.tv/${encodeURIComponent(parts.channel!)}`;
  }
  if (parts.kind === "video") {
    return `https://www.twitch.tv/videos/${encodeURIComponent(parts.videoId!)}`;
  }
  // Clips.twitch.tv/<slug> canonicalises to clips.twitch.tv/<slug>; only
  // the long form <channel>/clip/<slug> uses www.twitch.tv.
  if (!parts.channel) {
    return `https://clips.twitch.tv/${encodeURIComponent(parts.clipSlug!)}`;
  }
  return `https://www.twitch.tv/${encodeURIComponent(parts.channel)}/clip/${encodeURIComponent(
    parts.clipSlug!,
  )}`;
}

function isAuthStatus(status: number) {
  return status === 401 || status === 403;
}

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export const GET: APIRoute = async ({ url, cookies, request }) => {
  if (IS_TWITCH_ONLY) return twitchOnlyResponse();

  const clientAddress =
    request.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ||
    "unknown";
  if (!checkRateLimit(`${clientAddress}:twitch-link-preview`, 60, 60_000)) {
    return json({ error: "Too many requests" }, { status: 429 });
  }

  const urlParam = url.searchParams.get("url");
  if (!urlParam) {
    return json({ error: "url parameter required" }, { status: 400 });
  }
  const parsed = parseTwitchUrl(urlParam);
  if (!parsed) {
    return json({ error: "Not a supported Twitch URL" }, { status: 400 });
  }

  const accessToken = cookies.get("twitch_token")?.value;
  if (!accessToken) {
    return json(
      { error: "Twitch authentication required for link previews" },
      { status: 401 },
    );
  }
  const clientId = import.meta.env.PUBLIC_TWITCH_CLIENT_ID;
  if (!clientId) {
    return json({ error: "Server configuration error" }, { status: 500 });
  }

  const key = cacheKeyFor(parsed);
  const cached = previewCache.get(key);
  if (cached && cached.expires > Date.now()) {
    // Return cached body verbatim (still refresh href so a `?url=` query
    // with deferred text-decoration always points to the link the user typed).
    return json({ ...cached.data, url: buildUrl(parsed) });
  }

  try {
    let result: TwitchLinkPreviewResponse | null = null;
    if (parsed.kind === "channel" && parsed.channel) {
      result = await fetchChannelPreview(
        parsed.channel,
        accessToken,
        clientId,
      );
    } else if (parsed.kind === "video" && parsed.videoId) {
      result = await fetchVideoPreview(parsed.videoId, accessToken, clientId);
    } else if (parsed.kind === "clip" && parsed.clipSlug) {
      result = await fetchClipPreview(parsed, accessToken, clientId);
    }
    if (!result) {
      return json({ error: "Resource not found" }, { status: 404 });
    }
    result.url = buildUrl(parsed);
    result.href = parsed.href;
    previewCache.set(key, { expires: Date.now() + CACHE_TTL_MS, data: result });
    return json(result);
  } catch (err: any) {
    const status: number | undefined = err?.status;
    if (status && isAuthStatus(status)) {
      return json(
        { error: "Twitch authentication expired. Please re-login." },
        { status: 401 },
      );
    }
    console.error("[twitch-link-preview] failed:", err?.message || err);
    return json(
      { error: err?.message || "Internal error" },
      { status: 500 },
    );
  }
};
