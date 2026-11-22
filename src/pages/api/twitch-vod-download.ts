import type { APIRoute } from "astro";
import { checkRateLimit } from "../../lib/rateLimit";
import {
  getVodMedia,
  VodMediaError,
  VOD_USER_AGENT,
} from "../../server/twitchVodMedia";

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function safeQuality(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "vod";
}

export const GET: APIRoute = async ({ url, request, cookies }) => {
  const clientAddress =
    request.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ||
    "unknown";

  const twitchToken = cookies.get("twitch_token")?.value;
  const youtubeToken = cookies.get("youtube_token")?.value;
  if (!twitchToken && !youtubeToken) {
    return json({ error: "Authentication required" }, { status: 401 });
  }

  if (
    !checkRateLimit(`${clientAddress}:twitch-vod-download`, 3, 10 * 60_000)
  ) {
    return json({ error: "Too many requests" }, { status: 429 });
  }

  const videoId = url.searchParams.get("video_id")?.trim();
  if (!videoId || !/^\d+$/.test(videoId)) {
    return json({ error: "Valid video_id parameter required" }, { status: 400 });
  }

  let media;
  try {
    media = await getVodMedia(videoId, twitchToken);
  } catch (error) {
    if (error instanceof VodMediaError) {
      return json({ error: error.message }, { status: error.status });
    }
    console.error("[twitch-vod-download] failed:", error);
    return json({ error: "Failed to prepare VOD download" }, { status: 502 });
  }

  const extension = media.isFmp4 ? "mp4" : "ts";
  const contentType = media.isFmp4 ? "video/mp4" : "video/mp2t";
  const filename = `vod-${videoId}-${safeQuality(media.quality)}.${extension}`;

  const abort = new AbortController();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (const segmentUrl of media.segmentUrls) {
          const res = await fetch(segmentUrl, {
            headers: {
              "User-Agent": VOD_USER_AGENT,
              Referer: "https://www.twitch.tv/",
            },
            signal: abort.signal,
          });
          if (!res.ok || !res.body) {
            throw new Error(`VOD segment request failed (${res.status})`);
          }

          const reader = res.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) controller.enqueue(value);
          }
        }
        controller.close();
      } catch (error) {
        if (abort.signal.aborted) return;
        console.error("[twitch-vod-download] stream failed:", error);
        controller.error(error);
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
};
