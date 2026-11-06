import type { APIRoute } from "astro";
import { deleteSession, deleteSessionsByChannel } from "../../../../server/songQueueStore";
import { getSongQueueStoreOptions } from "../../../../server/songQueueConfig";
import { clientAddress, json } from "../../../../server/songQueueApi";
import { authorizeChannel } from "../../../../server/wheelAuth";
import { parseChannelKey } from "../../../../lib/wheel/api";
import { checkRateLimit } from "../../../../lib/rateLimit";

/**
 * Bulk owner-token-authenticated delete for past song-queue sessions.
 * Body: { sessions: Array<{ sessionId: string; ownerToken: string }> }
 */

export const POST: APIRoute = async ({ request, cookies }) => {
  if (
    !checkRateLimit(
      `${clientAddress(request)}:song-queue-past-bulk-delete`,
      10,
      60_000,
    )
  ) {
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }

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

  const channel = parseChannelKey(
    typeof b.channelKey === "string" ? b.channelKey : null,
  );
  if (channel && Array.isArray(b.sessionIds)) {
    const auth = await authorizeChannel(cookies, channel, {
      allowModerators: true,
    });
    if (auth === "unauthenticated")
      return json({ error: "Not authenticated" }, 401);
    if (auth !== "ok") return json({ error: "Forbidden" }, 403);
    const sessionIds = b.sessionIds.filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    );
    const result = await deleteSessionsByChannel(
      getSongQueueStoreOptions(),
      sessionIds,
      channel,
    );
    return json({ ok: true, ...result });
  }

  if (!Array.isArray(b.sessions) || b.sessions.length === 0) {
    return json(
      { error: "sessions (non-empty array) is required" },
      400,
    );
  }

  const sessions: Array<{ sessionId: string; ownerToken: string }> = [];
  for (const item of b.sessions) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof (item as Record<string, unknown>).sessionId !== "string" ||
      typeof (item as Record<string, unknown>).ownerToken !== "string"
    ) {
      continue;
    }
    const s = item as { sessionId: string; ownerToken: string };
    if (s.sessionId.length > 0 && s.ownerToken.length > 0) {
      sessions.push(s);
    }
  }

  if (sessions.length === 0) {
    return json(
      { error: "sessions must contain valid sessionId/ownerToken pairs" },
      400,
    );
  }

  const results = await Promise.all(
    sessions.map((s) =>
      deleteSession(getSongQueueStoreOptions(), s.sessionId, s.ownerToken),
    ),
  );

  let deleted = 0;
  let missing = 0;
  for (const result of results) {
    if (result === "ok") deleted += 1;
    else missing += 1;
  }

  return json({ ok: true, deleted, missing });
};
