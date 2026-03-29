import type { APIRoute } from "astro";

/**
 * Hostnames that this proxy is permitted to fetch on behalf of the client.
 * Twitch stream segments are served exclusively from these CDN domains.
 * Any URL pointing elsewhere is rejected to prevent SSRF attacks.
 */
const ALLOWED_HOSTS = new Set([
  "video.twitch.tv",
  "usher.twitchsvc.net",
  "usher.twitch.tv",
  "usher.ttvnw.net",
  "d1m7jfoe9zdc1j.cloudfront.net",  // Twitch CloudFront CDN
  "vod.twitch.tv",
  // Twitch HLS CDN — segment URLs are served from dynamic subdomains of ttvnw.net
  // e.g. use14.playlist.ttvnw.net, vod.us-east-2.aws.ttvnw.net
]);

// Allow any *.ttvnw.net subdomain (Twitch's primary HLS CDN)
function isAllowedHost(hostname: string): boolean {
  return ALLOWED_HOSTS.has(hostname) || hostname.endsWith(".ttvnw.net");
}


export const GET: APIRoute = async ({ url }) => {
  try {
    const remote = url.searchParams.get("url");
    if (!remote) {
      return new Response(JSON.stringify({ error: "url parameter required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let parsed: URL;
    try {
      parsed = new URL(decodeURIComponent(remote));
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid URL" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Enforce HTTPS and restrict to known Twitch CDN hostnames.
    if (parsed.protocol !== "https:") {
      return new Response(
        JSON.stringify({ error: "Only HTTPS URLs are allowed" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!isAllowedHost(parsed.hostname)) {
      return new Response(
        JSON.stringify({ error: `Disallowed host: ${parsed.hostname}` }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Fetch the remote segment/playlist from server-side (avoid browser CORS)
    const res = await fetch(parsed.href, {
      headers: {
        "User-Agent": "Mixchat/1.0",
        Accept: "*/*",
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        "Failed fetching remote segment",
        res.status,
        parsed.href,
        text.slice(0, 200),
      );
      return new Response(
        JSON.stringify({ error: `Remote fetch failed: ${res.status}` }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    // Clone response body and forward content-type
    const contentType =
      res.headers.get("content-type") || "application/octet-stream";
    const body = await res.arrayBuffer();

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        // Allow range requests if remote supports it
        "Accept-Ranges": res.headers.get("accept-ranges") || "bytes",
      },
    });
  } catch (error) {
    console.error("Stream segment proxy error:", error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Failed to proxy segment",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
