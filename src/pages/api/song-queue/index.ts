import type { APIRoute } from "astro";
import {
  createSession,
  deleteSession,
  getSession,
  listSessionsForChannel,
  publicView,
  reconcileEndedItems,
} from "../../../server/songQueueStore";
import { getSongQueueStoreOptions } from "../../../server/songQueueConfig";
import {
  clientAddress,
  json,
  ownerTokenFromRequest,
} from "../../../server/songQueueApi";
import { checkRateLimit } from "../../../lib/rateLimit";
import {
  DEFAULT_SONG_QUEUE_CONFIG,
  MAX_QUEUE_LENGTH_CEILING,
  MAX_SONG_DURATION_CEILING_SEC,
  type SongQueueConfig,
} from "../../../lib/songQueue/types";

interface CreateBody {
  title?: string;
  isPublic?: boolean;
  channelName?: string;
  channelPlatform?: string;
  config?: SongQueueConfig;
}

function isCreateBody(value: unknown): value is CreateBody {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.title !== undefined && typeof v.title !== "string") return false;
  if (v.isPublic !== undefined && typeof v.isPublic !== "boolean") return false;
  if (v.channelName !== undefined && typeof v.channelName !== "string")
    return false;
  if (v.channelPlatform !== undefined && typeof v.channelPlatform !== "string")
    return false;
  if (v.config !== undefined) {
    if (!v.config || typeof v.config !== "object") return false;
    const c = v.config as Record<string, unknown>;
    if (typeof c.maxQueueLength !== "number") return false;
    if (typeof c.maxSongDurationSec !== "number") return false;
    if (typeof c.perSubmitterLimit !== "number") return false;
    if (c.eligibility !== "everyone" && c.eligibility !== "subscribers")
      return false;
    if (c.scope !== "twitch" && c.scope !== "youtube" && c.scope !== "both")
      return false;
    if (typeof c.isPublic !== "boolean") return false;
    if (typeof c.announceOnPlay !== "boolean") return false;
    if (typeof c.loop !== "boolean") return false;
  }
  return true;
}

function clampConfig(input: SongQueueConfig): SongQueueConfig {
  return {
    ...input,
    maxQueueLength: Math.min(
      Math.max(1, Math.floor(input.maxQueueLength)),
      MAX_QUEUE_LENGTH_CEILING,
    ),
    maxSongDurationSec: Math.min(
      Math.max(1, Math.floor(input.maxSongDurationSec)),
      MAX_SONG_DURATION_CEILING_SEC,
    ),
    perSubmitterLimit: Math.min(
      Math.max(1, Math.floor(input.perSubmitterLimit)),
      50,
    ),
  };
}

export const POST: APIRoute = async ({ request }) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!isCreateBody(body)) {
    return json({ error: "Invalid body" }, 400);
  }
  const title = body.title?.trim() || "";
  if (title.length > 200) {
    return json({ error: "Title too long" }, 400);
  }
  const config = body.config
    ? clampConfig({ ...DEFAULT_SONG_QUEUE_CONFIG, ...body.config, title })
    : undefined;
  const bootstrap = await createSession(getSongQueueStoreOptions(), {
    title: title || undefined,
    isPublic: Boolean(body.isPublic),
    channelName: body.channelName?.trim() || undefined,
    channelPlatform: body.channelPlatform?.trim() || undefined,
    config,
  });
  return json(bootstrap, 201);
};

interface PastPlaylistSummary {
  sessionId: string;
  title: string;
  createdAt: string;
  lastSeenAt: string;
  ended: boolean;
  isPublic: boolean;
  itemCount: number;
  playedCount: number;
  skippedCount: number;
  firstThumbnail: string | null;
  firstTitle: string | null;
}

/** Past-playlist summary list for the streamer's UI. See the past/[sessionId] route for the trust model. */
export const GET: APIRoute = async ({ request }) => {
  if (
    !checkRateLimit(
      `${clientAddress(request)}:song-queue-past-list`,
      60,
      60_000,
    )
  ) {
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }
  const url = new URL(request.url);
  const channelName = url.searchParams.get("channelName")?.trim() || "";
  const channelPlatform =
    url.searchParams.get("channelPlatform")?.trim() || "";
  if (!channelName || !channelPlatform) {
    return json({ error: "Missing channel" }, 400);
  }
  const ids = await listSessionsForChannel(
    getSongQueueStoreOptions(),
    channelName,
    channelPlatform,
  );
  const summaries: PastPlaylistSummary[] = [];
  for (const sessionId of ids) {
    const session = await getSession(getSongQueueStoreOptions(), sessionId);
    if (!session) continue;
    const reconciled = reconcileEndedItems(session);
    const playedCount = reconciled.filter(
      (it) => it.status === "played",
    ).length;
    const skippedCount = reconciled.filter(
      (it) => it.status === "skipped",
    ).length;
    const first = reconciled[0];
    summaries.push({
      sessionId,
      title: session.title,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      ended: Boolean(session.ended),
      isPublic: Boolean(session.isPublic),
      itemCount: reconciled.length,
      playedCount,
      skippedCount,
      firstThumbnail: first?.thumbnail || null,
      firstTitle: first?.title || null,
    });
  }
  return json({ sessions: summaries });
};
