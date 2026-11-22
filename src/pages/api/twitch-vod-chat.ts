import type { APIRoute } from "astro";
import { checkRateLimit } from "../../lib/rateLimit";
import {
  fetchVodChatPage,
  VodChatUpstreamError,
} from "../../server/twitchVodChat";

const MAX_CURSOR_LENGTH = 2048;

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export const GET: APIRoute = async ({ url, request }) => {
  const clientAddress =
    request.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ||
    "unknown";
  if (!checkRateLimit(`${clientAddress}:twitch-vod-chat`, 120, 60_000)) {
    return json({ error: "Too many requests" }, { status: 429 });
  }

  const videoId = url.searchParams.get("video_id")?.trim();
  if (!videoId || !/^\d+$/.test(videoId)) {
    return json({ error: "Valid video_id parameter required" }, { status: 400 });
  }

  const cursor = url.searchParams.get("cursor")?.trim() || null;
  if (cursor && cursor.length > MAX_CURSOR_LENGTH) {
    return json({ error: "Invalid cursor" }, { status: 400 });
  }

  const rawOffset = Number(url.searchParams.get("offset") ?? "0");
  const offset =
    Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;

  try {
    const page = await fetchVodChatPage(videoId, { cursor, offset });
    return json(page);
  } catch (error) {
    if (error instanceof VodChatUpstreamError) {
      return json({ error: error.message }, { status: error.status });
    }
    console.error("[twitch-vod-chat] failed:", error);
    return json({ error: "Failed to load VOD chat" }, { status: 502 });
  }
};
