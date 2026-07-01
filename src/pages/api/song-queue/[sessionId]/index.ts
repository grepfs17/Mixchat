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

export const GET: APIRoute = async ({ request, params }) => {
  const sessionId = params.sessionId || "";
  const result = await loadSessionForOwner(request, sessionId);
  if (result.kind === "no-auth") return json({ error: "Missing owner token" }, 401);
  if (result.kind === "missing") return json({ error: "Not found" }, 404);
  if (result.kind === "ended") return json({ error: "Session ended" }, 410);
  return json(result.session);
};

export const PATCH: APIRoute = async ({ request, params }) => {
  const sessionId = params.sessionId || "";
  const token = ownerTokenFromRequest(request);
  if (!token) return json({ error: "Missing owner token" }, 401);
  if (!checkRateLimit(`${clientAddress(request)}:song-queue-patch`, 30, 60_000)) {
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!body || typeof body !== "object") return json({ error: "Invalid body" }, 400);
  const b = body as Record<string, unknown>;
  if (b.isPublic !== undefined && typeof b.isPublic !== "boolean") {
    return json({ error: "isPublic must be a boolean" }, 400);
  }
  const patch: { isPublic?: boolean } = {};
  if (b.isPublic !== undefined) patch.isPublic = b.isPublic;
  if (Object.keys(patch).length === 0) return json({ error: "Nothing to update" }, 400);
  const res = await mutateSession(
    getSongQueueStoreOptions(),
    sessionId,
    token,
    (s) => {
      const updated = { ...s, ...patch };
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
  if (!checkRateLimit(`${clientAddress(request)}:song-queue-close`, 30, 60_000)) {
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }
  const res = await mutateSession(
    getSongQueueStoreOptions(),
    sessionId,
    token,
    (s) => ({ session: { ...s, isPublic: false, ended: true }, result: undefined }),
  );
  if (res.ok) return json({ ok: true });
  if (res.reason === "missing") return json({ error: "Not found" }, 404);
  if (res.reason === "auth") return json({ error: "Forbidden" }, 403);
  return json({ error: "Session already ended" }, 410);
};
