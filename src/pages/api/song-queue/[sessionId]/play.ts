import type { APIRoute } from "astro";
import { mutateSession } from "../../../../server/songQueueStore";
import { getSongQueueStoreOptions } from "../../../../server/songQueueConfig";
import {
  clientAddress,
  json,
  ownerTokenFromRequest,
} from "../../../../server/songQueueApi";
import { checkRateLimit } from "../../../../lib/rateLimit";
import type { SongQueueItem } from "../../../../lib/songQueue/types";

interface PlayBody {
  currentIndex: number;
  durationSec?: number;
  status?: "playing" | "played" | "skipped";
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
  return true;
}

type PlayResult = { currentIndex: number; item: SongQueueItem | undefined };

export const POST: APIRoute = async ({ request, params }) => {
  const sessionId = params.sessionId || "";
  const token = ownerTokenFromRequest(request);
  if (!token) return json({ error: "Missing owner token" }, 401);
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

  const res = await mutateSession<PlayResult>(
    getSongQueueStoreOptions(),
    sessionId,
    token,
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
      return {
        session: { ...s, currentIndex: idx, items },
        result: { currentIndex: idx, item: items[idx] },
      };
    },
  );
  if (!res.ok) {
    if (res.reason === "missing") return json({ error: "Not found" }, 404);
    if (res.reason === "auth") return json({ error: "Forbidden" }, 403);
    return json({ error: "Session already ended" }, 410);
  }
  return json({ ok: true, currentIndex: res.result.currentIndex, item: res.result.item });
};
