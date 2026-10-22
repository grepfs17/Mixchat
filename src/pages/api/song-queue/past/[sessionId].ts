import type { APIRoute } from "astro";
import {
  deleteSession,
  getSession,
  publicView,
  readSessionWithToken,
  setSessionPublicByChannel,
} from "../../../../server/songQueueStore";
import { getSongQueueStoreOptions } from "../../../../server/songQueueConfig";
import {
  clientAddress,
  json,
  loadSessionForOwner,
  ownerTokenFromRequest,
} from "../../../../server/songQueueApi";
import { checkRateLimit } from "../../../../lib/rateLimit";

/**
 * Owner-token-authenticated read/delete/PATCH for past song-queue sessions.
 * The `Authorization: Bearer <ownerToken>` token is checked against the
 * session's stored hash and is valid for both live and ended sessions.
 */

export const GET: APIRoute = async ({ request, params }) => {
  if (
    !checkRateLimit(`${clientAddress(request)}:song-queue-past-get`, 60, 60_000)
  ) {
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }
  const sessionId = params.sessionId || "";
  const result = await loadSessionForOwner(request, sessionId);
  if (result.kind === "no-auth")
    return json({ error: "Missing owner token" }, 401);
  if (result.kind === "missing") return json({ error: "Not found" }, 404);
  // Accept both live and ended sessions. The owner token is valid for both.
  return json(publicView(result.session));
};

export const DELETE: APIRoute = async ({ request, params }) => {
  if (
    !checkRateLimit(
      `${clientAddress(request)}:song-queue-past-delete`,
      30,
      60_000,
    )
  ) {
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }
  const token = ownerTokenFromRequest(request);
  if (!token) return json({ error: "Missing owner token" }, 401);
  const sessionId = params.sessionId || "";
  const res = await deleteSession(getSongQueueStoreOptions(), sessionId, token);
  if (res === "ok") return json({ ok: true });
  if (res === "auth") return json({ error: "Forbidden" }, 403);
  return json({ error: "Not found" }, 404);
};

/** POST fallback for proxies that block the DELETE verb (e.g. Cloudflare WAF). */
export const POST: APIRoute = DELETE;

export const PATCH: APIRoute = async ({ request, params }) => {
  if (
    !checkRateLimit(
      `${clientAddress(request)}:song-queue-past-patch`,
      30,
      60_000,
    )
  ) {
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }
  const token = ownerTokenFromRequest(request);
  if (!token) return json({ error: "Missing owner token" }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!body || typeof body !== "object") {
    return json({ error: "Invalid body" }, 400);
  }
  const b = body as Record<string, unknown>;
  if (typeof b.isPublic !== "boolean") {
    return json({ error: "isPublic (boolean) is required" }, 400);
  }

  const sessionId = params.sessionId || "";
  const result = await readSessionWithToken(
    getSongQueueStoreOptions(),
    sessionId,
    token,
  );
  // readSessionWithToken returns "missing" for both non-existent sessions
  // and token mismatches. Distinguish the two so attackers can't probe
  // for valid session IDs via this endpoint.
  if (result.kind === "missing") {
    const exists = await getSession(
      getSongQueueStoreOptions(),
      sessionId,
    );
    if (exists) return json({ error: "Forbidden" }, 403);
    return json({ error: "Not found" }, 404);
  }

  // Ownership was already verified. The channel check inside
  // setSessionPublicByChannel is an additional safety layer.
  const session = result.session;
  const res = await setSessionPublicByChannel(
    getSongQueueStoreOptions(),
    sessionId,
    {
      channelName: session.channelName,
      channelPlatform: session.channelPlatform,
    },
    b.isPublic,
  );
  if (res.kind === "ok") {
    return json({ ok: true, session: publicView(res.session) });
  }
  if (res.kind === "noop") {
    return json({ ok: true, session: publicView(res.session) });
  }
  if (res.kind === "not-ended") {
    return json(
      { error: "Only ended (past) sessions can be shared from here" },
      409,
    );
  }
  return json({ error: "Not found" }, 404);
};
