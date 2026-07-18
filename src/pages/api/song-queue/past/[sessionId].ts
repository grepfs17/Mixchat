import type { APIRoute } from "astro";
import {
  deleteSessionByChannel,
  getSession,
  publicView,
  setSessionPublicByChannel,
} from "../../../../server/songQueueStore";
import { getSongQueueStoreOptions } from "../../../../server/songQueueConfig";
import { clientAddress, json } from "../../../../server/songQueueApi";
import { checkRateLimit } from "../../../../lib/rateLimit";

/**
 * Channel-trusted read/delete/PATCH for past song-queue sessions. The
 * streamer UI is already gated by the mod-tools check, so we trust the
 * (channelName, channelPlatform) tuple. Past sessions have no surviving
 * ownerToken on the client, so the per-session route can't be used here.
 */

function getChannel(req: Request): { name: string; platform: string } | null {
  const url = new URL(req.url);
  const name = url.searchParams.get("channelName")?.trim() || "";
  const platform = url.searchParams.get("channelPlatform")?.trim() || "";
  if (!name || !platform) return null;
  return { name, platform };
}

function channelMatches(
  session: { channelName: string; channelPlatform: string },
  channel: { name: string; platform: string },
): boolean {
  return (
    (session.channelName || "").trim().toLowerCase() ===
      channel.name.toLowerCase() &&
    (session.channelPlatform || "").trim().toLowerCase() ===
      channel.platform.toLowerCase()
  );
}

export const GET: APIRoute = async ({ request, params }) => {
  if (
    !checkRateLimit(`${clientAddress(request)}:song-queue-past-get`, 60, 60_000)
  ) {
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }
  const channel = getChannel(request);
  if (!channel) return json({ error: "Missing channel" }, 400);
  const sessionId = params.sessionId || "";
  const session = await getSession(getSongQueueStoreOptions(), sessionId);
  if (!session) return json({ error: "Not found" }, 404);
  if (!channelMatches(session, channel)) {
    return json({ error: "Not found" }, 404);
  }
  return json(publicView(session));
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
  const channel = getChannel(request);
  if (!channel) return json({ error: "Missing channel" }, 400);
  const sessionId = params.sessionId || "";
  const res = await deleteSessionByChannel(
    getSongQueueStoreOptions(),
    sessionId,
    {
      channelName: channel.name,
      channelPlatform: channel.platform,
    },
  );
  if (res === "ok") return json({ ok: true });
  return json({ error: "Not found" }, 404);
};

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
  const channel = getChannel(request);
  if (!channel) return json({ error: "Missing channel" }, 400);
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
  const res = await setSessionPublicByChannel(
    getSongQueueStoreOptions(),
    sessionId,
    {
      channelName: channel.name,
      channelPlatform: channel.platform,
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
