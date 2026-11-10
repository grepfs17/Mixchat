import type { APIRoute } from "astro";
import {
  clientAddress,
  json,
  mutateSessionWithAccess,
} from "../../../../server/songQueueApi";
import { checkRateLimit } from "../../../../lib/rateLimit";
import type { SongQueueItem } from "../../../../lib/songQueue/types";

interface PlayBody {
  currentIndex: number;
  durationSec?: number;
  status?: "playing" | "played" | "skipped";
  /** Shared play/pause intent for the audio host to follow. */
  isPlaying?: boolean;
  /** Shared volume 0-100 for the audio host's iframe. */
  volume?: number;
}

function isPlayBody(value: unknown): value is PlayBody {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.currentIndex !== "number" || !Number.isInteger(v.currentIndex)) {
    return false;
  }
  if (v.durationSec !== undefined && (typeof v.durationSec !== "number" || v.durationSec < 0)) {
    return false;
  }
  if (v.status !== undefined && v.status !== "playing" && v.status !== "played" && v.status !== "skipped") {
    return false;
  }
  if (v.isPlaying !== undefined && typeof v.isPlaying !== "boolean") {
    return false;
  }
  if (
    v.volume !== undefined &&
    (typeof v.volume !== "number" || v.volume < 0 || v.volume > 100)
  ) {
    return false;
  }
  return true;
}

type PlayResult = { currentIndex: number; item: SongQueueItem | undefined };

export const POST: APIRoute = async ({ request, params, cookies }) => {
  const sessionId = params.sessionId || "";
  if (!checkRateLimit(`${clientAddress(request)}:song-queue-play`, 120, 60_000)) {
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!isPlayBody(body)) return json({ error: "Invalid body" }, 400);

  const res = await mutateSessionWithAccess<PlayResult>(
    request,
    cookies,
    sessionId,
    (s) => {
      const maxIdx = Math.max(0, s.items.length - 1);
      const idx = Math.max(0, Math.min(body.currentIndex, maxIdx));
      // Backfill the previous currentIndex so a session that gets ended
      // (or GC'd) while paused reflects what was actually played. Without
      // this, every item stays "playing" on disk because the player only
      // ever sends one index at a time. Explicit skips via PATCH /items
      // are already "skipped" and pass through unchanged.
      const prevIdx = s.currentIndex;
      let items = s.items;
      if (idx !== prevIdx && prevIdx >= 0 && prevIdx <= maxIdx) {
        if (s.items[prevIdx]?.status === "playing") {
          items = items.map((it, i) =>
            i === prevIdx ? { ...it, status: "played" as const } : it,
          );
        }
      }
      if (
        body.status !== undefined ||
        (body.durationSec !== undefined && body.durationSec > 0)
      ) {
        items = items.map((it, i) => {
          if (i !== idx) return it;
          const next = { ...it };
          if (body.status !== undefined) next.status = body.status;
          if (body.durationSec !== undefined && body.durationSec > 0) {
            next.durationSec = Math.max(next.durationSec, body.durationSec);
          }
          return next;
        });
      }
      const next: typeof s = {
        ...s,
        currentIndex: idx,
        items,
      };
      if (body.isPlaying !== undefined) next.isPlaying = body.isPlaying;
      if (body.volume !== undefined) next.volume = body.volume;
      return {
        session: next,
        result: { currentIndex: idx, item: items[idx] },
      };
    },
  );
  if (!res.ok) {
    if (res.reason === "missing") return json({ error: "Not found" }, 404);
    if (res.reason === "unauthenticated")
      return json({ error: "Not authenticated" }, 401);
    if (res.reason === "auth" || res.reason === "forbidden")
      return json({ error: "Forbidden" }, 403);
    return json({ error: "Session already ended" }, 410);
  }
  return json({ ok: true, currentIndex: res.result.currentIndex, item: res.result.item });
};
