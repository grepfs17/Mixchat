import type { APIRoute } from "astro";
import { checkRateLimit } from "../../lib/rateLimit";
import { YT_USER_AGENT } from "../../lib/constants";

// Only allow proxying from trusted Twitch CDN domains.
// Variant playlists live on *.ttvnw.net; segments live on *.twitchsvc.net.
const ALLOWED_HOST_RE =
  /^(?:[a-z0-9-]+\.)*ttvnw\.net$|^(?:[a-z0-9-]+\.)*twitchsvc\.net$/;

export const GET: APIRoute = async ({ request, url, cookies }) => {
  const clientAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  // Require an active session — prevents open-proxy abuse.
  const twitchToken = cookies.get("twitch_token")?.value;
  const youtubeToken = cookies.get("youtube_token")?.value;
  if (!twitchToken && !youtubeToken) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Higher per-minute budget than stream-playlist: live playlists refresh
  // every 1-2 s, and a user may have several streams open simultaneously.
  if (!checkRateLimit(`${clientAddress}:hls-proxy`, 600, 60_000)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "60" },
    });
  }

  const targetUrl = url.searchParams.get("url");
  if (!targetUrl) {
    return new Response(JSON.stringify({ error: "url parameter required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let parsedTarget: URL;
  try {
    parsedTarget = new URL(targetUrl);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid url parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!ALLOWED_HOST_RE.test(parsedTarget.hostname)) {
    return new Response(
      JSON.stringify({
        error: "Forbidden: only Twitch CDN domains are allowed",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        "User-Agent": YT_USER_AGENT,
      },
    });

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: `CDN returned ${upstream.status}` }),
        {
          status: upstream.status,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const contentType =
      upstream.headers.get("Content-Type") ?? "application/vnd.apple.mpegurl";
    const text = await upstream.text();

    // Rewrite any relative URLs in the playlist body so HLS.js resolves them
    // correctly against the CDN base, not the proxy's base URL.
    const isPlaylist =
      contentType.includes("mpegurl") || targetUrl.includes(".m3u8");

    let body = text;
    if (isPlaylist) {
      const base = new URL(targetUrl);
      body = text
        .split("\n")
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) return line;
          if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
            return line;
          }
          // Resolve relative segment / sub-playlist URL to absolute CDN URL.
          return new URL(trimmed, base).toString();
        })
        .join("\n");
    }

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // Live playlists must never be cached; stale playlists break playback.
        "Cache-Control": "no-cache, no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("HLS proxy error:", err);
    return new Response(JSON.stringify({ error: "Failed to fetch from CDN" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
