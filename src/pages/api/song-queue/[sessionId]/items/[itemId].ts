import type { APIRoute } from "astro";
import { mutateSession } from "../../../../../server/songQueueStore";
import { getSongQueueStoreOptions } from "../../../../../server/songQueueConfig";
import {
  clientAddress,
  json,
  ownerTokenFromRequest,
} from "../../../../../server/songQueueApi";
import { checkRateLimit } from "../../../../../lib/rateLimit";
import type { SongQueueItem, SongQueueItemStatus } from "../../../../../lib/songQueue/types";

interface UpdateBody {
  status?: SongQueueItemStatus;
  position?: number;
}

const VALID_STATUS: ReadonlySet<SongQueueItemStatus> = new Set([
  "pending",
  "playing",
  "played",
  "skipped",
]);

function isUpdateBody(value: unknown): value is UpdateBody {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (
    v.status !== undefined &&
    (typeof v.status !== "string" || !VALID_STATUS.has(v.status as SongQueueItemStatus))
  ) {
    return false;
  }
  if (
    v.position !== undefined &&
    (typeof v.position !== "number" || !Number.isInteger(v.position) || v.position < 0)
  ) {
    return false;
  }
  return true;
}

type PatchResult =
  | { kind: "ok"; item: SongQueueItem | undefined }
  | { kind: "missing" };

type DeleteResult = { kind: "ok" } | { kind: "missing" };

export const PATCH: APIRoute = async ({ request, params }) => {
  const sessionId = params.sessionId || "";
  const itemId = params.itemId || "";
  const token = ownerTokenFromRequest(request);
  if (!token) return json({ error: "Missing owner token" }, 401);
  if (!checkRateLimit(`${clientAddress(request)}:song-queue-item`, 60, 60_000)) {
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!isUpdateBody(body)) return json({ error: "Invalid body" }, 400);

  const res = await mutateSession<PatchResult>(
    getSongQueueStoreOptions(),
    sessionId,
    token,
    (s) => {
      const idx = s.items.findIndex((it) => it.id === itemId);
      if (idx === -1) return { session: s, result: { kind: "missing" } };
      const items = s.items.slice();
      if (body.status !== undefined) {
        items[idx] = { ...items[idx], status: body.status };
      }
      if (body.position !== undefined) {
        const target = Math.max(0, Math.min(body.position, items.length - 1));
        const [moved] = items.splice(idx, 1);
        items.splice(target, 0, moved);
      }
      return { session: { ...s, items }, result: { kind: "ok", item: items.find((it) => it.id === itemId) } };
    },
  );
  if (!res.ok) {
    if (res.reason === "missing") return json({ error: "Not found" }, 404);
    if (res.reason === "auth") return json({ error: "Forbidden" }, 403);
    return json({ error: "Session already ended" }, 410);
  }
  if (res.result.kind === "missing") {
    return json({ error: "Item not found" }, 404);
  }
  return json({ item: res.result.item });
};

const removeItemHandler: APIRoute = async ({ request, params }) => {
  const sessionId = params.sessionId || "";
  const itemId = params.itemId || "";
  const token = ownerTokenFromRequest(request);
  if (!token) return json({ error: "Missing owner token" }, 401);
  if (!checkRateLimit(`${clientAddress(request)}:song-queue-item`, 60, 60_000)) {
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }
  const res = await mutateSession<DeleteResult>(
    getSongQueueStoreOptions(),
    sessionId,
    token,
    (s) => {
      const next = s.items.filter((it) => it.id !== itemId);
      if (next.length === s.items.length) {
        return { session: s, result: { kind: "missing" } };
      }
      return {
        session: {
          ...s,
          items: next,
          currentIndex: Math.min(s.currentIndex, Math.max(0, next.length - 1)),
        },
        result: { kind: "ok" },
      };
    },
  );
  if (!res.ok) {
    if (res.reason === "missing") return json({ error: "Not found" }, 404);
    if (res.reason === "auth") return json({ error: "Forbidden" }, 403);
    return json({ error: "Session already ended" }, 410);
  }
  if (res.result.kind === "missing") return json({ error: "Item not found" }, 404);
  return json({ ok: true });
};

export const DELETE: APIRoute = removeItemHandler;

/** POST fallback — accepts X-HTTP-Method-Override: DELETE for proxies that
 *  block the DELETE verb (e.g. Cloudflare WAF). */
export const POST: APIRoute = async (ctx) => {
  if (ctx.request.headers.get("x-http-method-override")?.toUpperCase() !== "DELETE") {
    return json({ error: "Use X-HTTP-Method-Override: DELETE" }, 400);
  }
  return removeItemHandler(ctx);
};
