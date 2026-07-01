import type { APIRoute } from "astro";
import { readPublic } from "../../../../server/songQueueStore";
import { getSongQueueStoreOptions } from "../../../../server/songQueueConfig";
import { clientAddress, json } from "../../../../server/songQueueApi";
import { checkRateLimit } from "../../../../lib/rateLimit";

export const GET: APIRoute = async ({ request, params }) => {
  const sessionId = params.sessionId || "";
  if (!sessionId) return json({ error: "Missing sessionId" }, 400);
  if (
    !checkRateLimit(`${clientAddress(request)}:song-queue-public`, 60, 60_000)
  ) {
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }
  const view = await readPublic(getSongQueueStoreOptions(), sessionId);
  if (view) return json(view);
  // Collapse "missing" and "exists but not public" into a single 404 so we
  // don't leak the existence of private sessions to unauthenticated callers.
  // The owner-token-authenticated GET /api/song-queue/:sessionId endpoint
  // still returns a 410 for ended sessions to support client cache logic.
  return json({ error: "Not found" }, 404);
};
