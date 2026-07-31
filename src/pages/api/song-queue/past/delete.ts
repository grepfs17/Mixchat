import type { APIRoute } from "astro";
import { deleteSession } from "../../../../server/songQueueStore";
import { getSongQueueStoreOptions } from "../../../../server/songQueueConfig";
import { clientAddress, json } from "../../../../server/songQueueApi";
import { checkRateLimit } from "../../../../lib/rateLimit";

/**
 * Bulk owner-token-authenticated delete for past song-queue sessions.
 * Body: { sessions: Array<{ sessionId: string; ownerToken: string }> }
 */

export const POST: APIRoute = async ({ request }) => {
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
