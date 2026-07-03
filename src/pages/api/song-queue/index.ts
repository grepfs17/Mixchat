import type { APIRoute } from "astro";
import { createSession } from "../../../server/songQueueStore";
import { getSongQueueStoreOptions } from "../../../server/songQueueConfig";
import { json } from "../../../server/songQueueApi";
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
