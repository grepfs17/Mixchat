import type { APIRoute } from "astro";
import { mutateSession } from "../../../../server/songQueueStore";
import { getSongQueueStoreOptions } from "../../../../server/songQueueConfig";
import {
  clientAddress,
  json,
  loadSessionForOwner,
  ownerTokenFromRequest,
} from "../../../../server/songQueueApi";
import { checkRateLimit } from "../../../../lib/rateLimit";
import {
  DEFAULT_SONG_QUEUE_CONFIG,
  MAX_QUEUE_LENGTH_CEILING,
  MAX_SONG_DURATION_CEILING_SEC,
  type SongQueueConfig,
} from "../../../../lib/songQueue/types";

function isValidConfig(value: unknown): value is Partial<SongQueueConfig> {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  if (
    c.maxQueueLength !== undefined &&
    (typeof c.maxQueueLength !== "number" || c.maxQueueLength < 1)
  )
    return false;
  if (
    c.maxSongDurationSec !== undefined &&
    (typeof c.maxSongDurationSec !== "number" || c.maxSongDurationSec < 1)
  )
    return false;
  if (
    c.perSubmitterLimit !== undefined &&
    (typeof c.perSubmitterLimit !== "number" || c.perSubmitterLimit < 1)
  )
    return false;
  if (
    c.eligibility !== undefined &&
    c.eligibility !== "everyone" &&
    c.eligibility !== "subscribers"
  )
    return false;
  if (
    c.scope !== undefined &&
    c.scope !== "twitch" &&
    c.scope !== "youtube" &&
    c.scope !== "both"
  )
    return false;
  if (c.announceOnPlay !== undefined && typeof c.announceOnPlay !== "boolean")
    return false;
  if (c.loop !== undefined && typeof c.loop !== "boolean") return false;
  if (c.title !== undefined && typeof c.title !== "string") return false;
  return true;
}

function clampConfig(
  base: SongQueueConfig,
  patch: Partial<SongQueueConfig>,
): SongQueueConfig {
  const merged: SongQueueConfig = { ...base, ...patch };
  return {
    ...merged,
    maxQueueLength: Math.min(
      Math.max(1, Math.floor(merged.maxQueueLength)),
      MAX_QUEUE_LENGTH_CEILING,
    ),
    maxSongDurationSec: Math.min(
      Math.max(1, Math.floor(merged.maxSongDurationSec)),
      MAX_SONG_DURATION_CEILING_SEC,
    ),
    perSubmitterLimit: Math.min(
      Math.max(1, Math.floor(merged.perSubmitterLimit)),
      50,
    ),
  };
}

export const GET: APIRoute = async ({ request, params }) => {
  const sessionId = params.sessionId || "";
  const result = await loadSessionForOwner(request, sessionId);
  if (result.kind === "no-auth")
    return json({ error: "Missing owner token" }, 401);
  if (result.kind === "missing") return json({ error: "Not found" }, 404);
  if (result.kind === "ended") return json({ error: "Session ended" }, 410);
  return json(result.session);
};

export const PATCH: APIRoute = async ({ request, params }) => {
  const sessionId = params.sessionId || "";
  const token = ownerTokenFromRequest(request);
  if (!token) return json({ error: "Missing owner token" }, 401);
  if (
    !checkRateLimit(`${clientAddress(request)}:song-queue-patch`, 30, 60_000)
  ) {
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!body || typeof body !== "object")
    return json({ error: "Invalid body" }, 400);
  const b = body as Record<string, unknown>;
  if (b.isPublic !== undefined && typeof b.isPublic !== "boolean") {
    return json({ error: "isPublic must be a boolean" }, 400);
  }
  let configPatch: Partial<SongQueueConfig> | undefined;
  if (b.config !== undefined) {
    if (!isValidConfig(b.config)) {
      return json({ error: "Invalid config" }, 400);
    }
    configPatch = b.config as Partial<SongQueueConfig>;
  }
  if (b.isPublic === undefined && !configPatch) {
    return json({ error: "Nothing to update" }, 400);
  }
  const res = await mutateSession(
    getSongQueueStoreOptions(),
    sessionId,
    token,
    (s) => {
      const base = s.config ?? {
        ...DEFAULT_SONG_QUEUE_CONFIG,
        title: s.title,
        isPublic: s.isPublic,
      };
      const next = configPatch ? clampConfig(base, configPatch) : base;
      const updated = {
        ...s,
        ...(b.isPublic !== undefined
          ? { isPublic: b.isPublic as boolean }
          : {}),
        config: next,
      };
      return { session: updated, result: updated };
    },
  );
  if (res.ok) return json(res.result);
  if (res.reason === "missing") return json({ error: "Not found" }, 404);
  if (res.reason === "auth") return json({ error: "Forbidden" }, 403);
  return json({ error: "Session already ended" }, 410);
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const sessionId = params.sessionId || "";
  const token = ownerTokenFromRequest(request);
  if (!token) return json({ error: "Missing owner token" }, 401);
  if (
    !checkRateLimit(`${clientAddress(request)}:song-queue-close`, 30, 60_000)
  ) {
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }
  const res = await mutateSession(
    getSongQueueStoreOptions(),
    sessionId,
    token,
    (s) => ({
      session: { ...s, isPublic: false, ended: true },
      result: undefined,
    }),
  );
  if (res.ok) return json({ ok: true });
  if (res.reason === "missing") return json({ error: "Not found" }, 404);
  if (res.reason === "auth") return json({ error: "Forbidden" }, 403);
  return json({ error: "Session already ended" }, 410);
};
