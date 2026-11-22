import type { APIRoute } from "astro";
import { clientAddress } from "../../lib/clientAddress";
import { checkRateLimit, peekRateLimit } from "../../lib/rateLimit";
import {
  getVodMedia,
  VodMediaError,
  VOD_USER_AGENT,
} from "../../server/twitchVodMedia";

const TWITCH_VALIDATE_URL = "https://id.twitch.tv/oauth2/validate";
const RATE_LIMIT = 3;
const RATE_WINDOW_MS = 10 * 60_000;

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

type SessionCheck = "valid" | "invalid" | "unavailable";

/** Twitch OAuth validation, so an expired cookie cannot download anonymously. */
async function checkTwitchSession(token: string): Promise<SessionCheck> {
  try {
    const res = await fetch(TWITCH_VALIDATE_URL, {
      headers: { Authorization: `OAuth ${token}` },
    });
    if (res.ok) return "valid";
    if (res.status === 401 || res.status === 403) return "invalid";
    console.warn(
      "[twitch-vod-download] token validation failed:",
      res.status,
    );
    return "unavailable";
  } catch (error) {
    console.warn("[twitch-vod-download] token validation unavailable:", error);
    return "unavailable";
  }
}

interface Gate {
  videoId: string;
  twitchToken: string;
}

type GateContext = {
  url: URL;
  request: Request;
  cookies: { get(name: string): { value: string } | undefined };
};

/**
 * Shared checks for GET and HEAD. `consume` reserves a rate-limit slot for the
 * real download, while HEAD only peeks so a preflight does not halve the
 * allowed downloads.
 */
async function gateRequest(
  { url, request, cookies }: GateContext,
  consume: boolean,
): Promise<Gate | Response> {
  const rateKey = `${clientAddress(request)}:twitch-vod-download`;
  const allowed = consume
    ? checkRateLimit(rateKey, RATE_LIMIT, RATE_WINDOW_MS)
    : peekRateLimit(rateKey, RATE_LIMIT);
  if (!allowed) {
    return json({ error: "Too many requests" }, { status: 429 });
  }

  const videoId = url.searchParams.get("video_id")?.trim();
  if (!videoId || !/^\d+$/.test(videoId)) {
    return json({ error: "Valid video_id parameter required" }, { status: 400 });
  }

  const twitchToken = cookies.get("twitch_token")?.value;
  if (!twitchToken) {
    return json({ error: "Twitch authentication required" }, { status: 401 });
  }

  const session = await checkTwitchSession(twitchToken);
  if (session === "invalid") {
    return json(
      { error: "Twitch authentication expired. Please re-login." },
      { status: 401 },
    );
  }
  if (session === "unavailable") {
    return json(
      { error: "Could not verify your Twitch session. Try again." },
      { status: 502 },
    );
  }

  return { videoId, twitchToken };
}

/** Preflight used by the download action so errors are not saved as files. */
export const HEAD: APIRoute = async (context) => {
  const gate = await gateRequest(context, false);
  if (gate instanceof Response) return gate;
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
};

export const GET: APIRoute = async (context) => {
  const gate = await gateRequest(context, true);
  if (gate instanceof Response) return gate;
  const { videoId, twitchToken } = gate;

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
  let segmentIndex = 0;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  const releaseReader = () => {
    const current = reader;
    reader = null;
    current?.cancel().catch(() => {});
  };

  // pull() reads one chunk per invocation, so the stream's internal queue
  // applies backpressure and a slow client cannot buffer the whole VOD in
  // server memory.
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (true) {
          if (!reader) {
            if (segmentIndex >= media.segmentUrls.length) {
              controller.close();
              return;
            }
            const res = await fetch(media.segmentUrls[segmentIndex], {
              headers: {
                "User-Agent": VOD_USER_AGENT,
                Referer: "https://www.twitch.tv/",
              },
              signal: abort.signal,
            });
            segmentIndex += 1;
            if (!res.ok || !res.body) {
              throw new Error(`VOD segment request failed (${res.status})`);
            }
            reader = res.body.getReader();
          }

          const { done, value } = await reader.read();
          if (done) {
            reader = null;
            continue;
          }
          if (value && value.length > 0) {
            controller.enqueue(value);
            return;
          }
        }
      } catch (error) {
        if (abort.signal.aborted) return;
        console.error("[twitch-vod-download] stream failed:", error);
        controller.error(error);
      }
    },
    cancel() {
      abort.abort();
      releaseReader();
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
