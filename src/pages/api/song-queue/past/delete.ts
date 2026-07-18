import type { APIRoute } from "astro";
import { deleteSessionsByChannel } from "../../../../server/songQueueStore";
import { getSongQueueStoreOptions } from "../../../../server/songQueueConfig";
import { clientAddress, json } from "../../../../server/songQueueApi";
import { checkRateLimit } from "../../../../lib/rateLimit";

/**
 * Bulk channel-trusted delete for past song-queue sessions.
 * Body: { sessionIds: string[], channelName: string, channelPlatform: string }
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

  const channelName =
    typeof b.channelName === "string" ? b.channelName.trim() : "";
  const channelPlatform =
    typeof b.channelPlatform === "string" ? b.channelPlatform.trim() : "";
  if (!channelName || !channelPlatform) {
    return json({ error: "Missing channel" }, 400);
  }

  if (!Array.isArray(b.sessionIds) || b.sessionIds.length === 0) {
    return json({ error: "sessionIds (non-empty array) is required" }, 400);
  }
  const sessionIds = b.sessionIds.filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  if (sessionIds.length === 0) {
    return json({ error: "sessionIds must contain valid strings" }, 400);
  }

  const result = await deleteSessionsByChannel(
    getSongQueueStoreOptions(),
    sessionIds,
    { channelName, channelPlatform },
  );

  return json({ ok: true, ...result });
};
