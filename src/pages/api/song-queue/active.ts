import type { APIRoute } from "astro";
import { parseChannelKey } from "../../../lib/wheel/api";
import { checkRateLimit } from "../../../lib/rateLimit";
import { getSongQueueStoreOptions } from "../../../server/songQueueConfig";
import {
  getSession,
  listSessionsForChannel,
} from "../../../server/songQueueStore";
import { clientAddress, json } from "../../../server/songQueueApi";
import { authorizeChannel } from "../../../server/wheelAuth";

/**
 * Returns the current open queue for a channel.
 *
 * Used by moderators (and any approved editor) to adopt the same session
 * without holding the streamer's owner token. Authorization is channel trust:
 * the broadcaster, or a Twitch moderator when the streamer allowed it.
 */
export const GET: APIRoute = async ({ request, cookies }) => {
  if (
    !checkRateLimit(
      `${clientAddress(request)}:song-queue-active`,
      120,
      60_000,
    )
  ) {
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }
  const url = new URL(request.url);
  const channel =
    parseChannelKey(url.searchParams.get("channelKey")) ??
    (() => {
      const name = url.searchParams.get("channelName")?.trim();
      const platform = url.searchParams.get("channelPlatform")?.trim();
      return name && platform
        ? { channelName: name, channelPlatform: platform }
        : null;
    })();
  if (!channel) return json({ error: "Missing channel" }, 400);

  const auth = await authorizeChannel(cookies, channel, {
    allowModerators: true,
  });
  if (auth === "unauthenticated")
    return json({ error: "Not authenticated" }, 401);
  if (auth !== "ok") return json({ error: "Forbidden" }, 403);

  const opts = getSongQueueStoreOptions();
  const ids = await listSessionsForChannel(
    opts,
    channel.channelName,
    channel.channelPlatform,
  );
  for (const sessionId of ids) {
    const session = await getSession(opts, sessionId);
    if (!session || session.ended) continue;
    return json({ session: { ...session, ownerTokenHash: "" } });
  }
  return json({ session: null });
};
