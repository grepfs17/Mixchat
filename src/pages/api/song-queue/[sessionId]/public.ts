import type { APIRoute } from "astro";
import { readPublic, getSession } from "../../../../server/songQueueStore";
import { getSongQueueStoreOptions } from "../../../../server/songQueueConfig";
import { clientAddress, json } from "../../../../server/songQueueApi";
import { checkRateLimit } from "../../../../lib/rateLimit";

export const GET: APIRoute = async ({ request, params }) => {
  const sessionId = params.sessionId || "";
  if (!sessionId) return json({ error: "Missing sessionId" }, 400);
  if (!checkRateLimit(`${clientAddress(request)}:song-queue-public`, 60, 60_000)) {
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }
  const view = await readPublic(getSongQueueStoreOptions(), sessionId);
  if (view) return json(view);
  // Distinguish "exists but is not public" from "doesn't exist" by reading
  // the raw session. We never expose owner fields, only the ended flag.
  const session = await getSession(getSongQueueStoreOptions(), sessionId);
  if (!session) return json({ error: "Not found" }, 404);
  if (session.ended) return json({ error: "Session ended" }, 410);
  return json({ error: "Not public" }, 403);
};
