import type { APIRoute } from "astro";
import {
  clientAddress,
  json,
  mutateSessionWithAccess,
} from "../../../../server/songQueueApi";
import { checkRateLimit } from "../../../../lib/rateLimit";
import type { SongQueueItem } from "../../../../lib/songQueue/types";

interface AnnounceResult {
  item: SongQueueItem | null;
}

/**
 * Claim the current item's "now playing" announcement.
 *
 * The claim is stored on the session, so when several streamer or moderator
 * clients see the same item advance only one receives it back and posts to
 * chat. Re-claiming the same item is a no-op.
 */
export const POST: APIRoute = async ({ request, params, cookies }) => {
  const sessionId = params.sessionId || "";
  if (
    !checkRateLimit(
      `${clientAddress(request)}:song-queue-announce`,
      120,
      60_000,
    )
  ) {
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }

  const res = await mutateSessionWithAccess<AnnounceResult>(
    request,
    cookies,
    sessionId,
    (session) => {
      const item = session.items[session.currentIndex];
      if (!item || session.announcedItemId === item.id) {
        return { session, result: { item: null } };
      }
      return {
        session: { ...session, announcedItemId: item.id },
        result: { item },
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
  return json(res.result);
};
