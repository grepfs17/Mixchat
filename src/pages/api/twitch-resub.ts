import type { APIRoute } from "astro";
import { checkRateLimit } from "../../lib/rateLimit";
import { readJsonBody } from "../../server/jsonBody";
import {
  fetchTwitchResubNotification,
  shareTwitchResubMessage,
  TwitchResubAuthError,
} from "../../lib/twitchResub";
import { MAX_RESUB_MESSAGE_LENGTH } from "../../lib/constants";

const MAX_BODY_BYTES = 2_048;
const MAX_CHANNEL_LENGTH = 64;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function clientAddress(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * GET /api/twitch-resub?channel=<login>
 *
 * Returns the viewer's pending resub notification for the channel, or null.
 * The notification token is intentionally omitted: the browser only needs to
 * know whether something is shareable and how to label the banner.
 */
export const GET: APIRoute = async ({ request, url, cookies }) => {
  if (
    !checkRateLimit(`${clientAddress(request)}:twitch-resub`, 60, 60_000)
  ) {
    return json({ error: "Too many requests" }, 429);
  }

  const accessToken = cookies.get("twitch_token")?.value;
  if (!accessToken) return json({ error: "Not authenticated" }, 401);

  const channel = url.searchParams.get("channel")?.trim();
  if (!channel) return json({ error: "Channel is required" }, 400);
  if (channel.length > MAX_CHANNEL_LENGTH) {
    return json({ error: "Channel is invalid" }, 400);
  }

  try {
    const notification = await fetchTwitchResubNotification(
      channel,
      accessToken,
    );
    if (!notification) return json({ notification: null });
    return json({
      notification: {
        id: notification.id,
        months: notification.months,
        cumulativeTenureMonths: notification.cumulativeTenureMonths,
        streakTenureMonths: notification.streakTenureMonths,
      },
    });
  } catch (err) {
    if (err instanceof TwitchResubAuthError) {
      return json({ error: "Twitch login expired" }, 401);
    }
    console.warn(
      "[twitch-resub] fetch failed:",
      err instanceof Error ? err.message : err,
    );
    return json({ notification: null });
  }
};

/**
 * POST /api/twitch-resub
 * Body: { channel: string, message: string, includeStreak: boolean }
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  if (
    !checkRateLimit(
      `${clientAddress(request)}:twitch-resub-share`,
      10,
      60_000,
    )
  ) {
    return json({ error: "Too many requests" }, 429);
  }

  const accessToken = cookies.get("twitch_token")?.value;
  if (!accessToken) return json({ error: "Not authenticated" }, 401);

  const parsed = await readJsonBody(request, MAX_BODY_BYTES);
  if (!parsed.ok) return json({ error: parsed.error }, parsed.status);

  const body = parsed.value as Record<string, unknown> | null;
  const channel = typeof body?.channel === "string" ? body.channel.trim() : "";
  const message = typeof body?.message === "string" ? body.message : "";
  const includeStreak = body?.includeStreak === true;

  if (!channel) return json({ error: "Channel is required" }, 400);
  if (channel.length > MAX_CHANNEL_LENGTH) {
    return json({ error: "Channel is invalid" }, 400);
  }
  if (message.length > MAX_RESUB_MESSAGE_LENGTH) {
    return json(
      { error: `Message must be ${MAX_RESUB_MESSAGE_LENGTH} characters or fewer` },
      400,
    );
  }

  try {
    const result = await shareTwitchResubMessage(
      channel,
      message,
      includeStreak,
      accessToken,
    );
    if (result.ok) return json({ success: true });
    if (result.reason === "no-notification") {
      return json(
        { error: "No resub message is available to share." },
        409,
      );
    }
    return json({ error: "Twitch could not share the resub message." }, 502);
  } catch (err) {
    if (err instanceof TwitchResubAuthError) {
      return json({ error: "Twitch login expired" }, 401);
    }
    console.warn(
      "[twitch-resub] share failed:",
      err instanceof Error ? err.message : err,
    );
    return json({ error: "Twitch could not share the resub message." }, 502);
  }
};
