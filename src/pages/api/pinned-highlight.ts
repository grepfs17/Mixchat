import type { APIRoute } from "astro";
import { checkRateLimit } from "../../lib/rateLimit";
import {
  fetchPinnedChatHighlight,
  type TwitchPinnedHighlightRaw,
} from "../../lib/twitchPinnedHighlight";

/**
 * Server response shape. We always return `highlight` (possibly null) so
 * the client polling hook can rely on shape stability — even Twitch API
 * errors become `{ highlight: null }` instead of an HTTP failure, with the
 * error reason logged server-side.
 */
interface PinnedHighlightResponse {
  highlight: TwitchPinnedHighlightRaw | null;
}

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const GET: APIRoute = async ({ request, url, cookies }) => {
  const clientAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  // The pinned highlight is a public Twitch property, but we still gate the
  // endpoint behind an authenticated Twitch or YouTube cookie to mirror the
  // other /api/* proxies and avoid casual abuse of our GQL client id.
  const twitchToken = cookies.get("twitch_token")?.value;
  const youtubeToken = cookies.get("youtube_token")?.value;
  if (!twitchToken && !youtubeToken) {
    return jsonError("Authentication required", 401);
  }

  // Polling is expected to be frequent (every ~60s). Allow a slightly higher
  // rate than the playlist endpoint.
  if (!checkRateLimit(`${clientAddress}:pinned-highlight`, 60, 60_000)) {
    return jsonError("Too many requests", 429);
  }

  const channel = url.searchParams.get("channel");
  if (!channel) {
    return jsonError("Channel parameter required", 400);
  }

  let highlight: TwitchPinnedHighlightRaw | null = null;
  try {
    highlight = await fetchPinnedChatHighlight(channel);
  } catch (err) {
    // Soft-fail: callers can treat "no pin" / "Twitch rejected" identically.
    console.warn(
      "[pinned-highlight] fetch failed (returning null):",
      err instanceof Error ? err.message : err,
    );
  }

  const body: PinnedHighlightResponse = { highlight };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
