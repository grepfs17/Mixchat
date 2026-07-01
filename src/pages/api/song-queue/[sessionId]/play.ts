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
      const idx = Math.max(0, Math.min(body.currentIndex, Math.max(0, s.items.length - 1)));
      let items = s.items;
      if (
        body.status !== undefined ||
        (body.durationSec !== undefined && body.durationSec > 0)
      ) {
        items = s.items.map((it, i) => {
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
