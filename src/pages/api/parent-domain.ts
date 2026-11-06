import type { APIRoute } from "astro";
import { IS_DESKTOP } from "../../lib/constants";

export const GET: APIRoute = async ({ request }) => {
  // 1. Explicit env var: highest priority.
  // 2. Astro's built-in `site` config (astro.config.mjs → site: '…'). It is
  //    always present in production builds and requires no extra configuration.
  // 3. Host header: last resort for local/dev use only.
  //
  // Desktop builds load a loopback origin, so the Twitch embed needs `localhost`
  // as its parent, not the hosted site's domain. Skip the baked `site` there.
  const rawOrigin = IS_DESKTOP
    ? null
    : import.meta.env.PUBLIC_SITE_URL || import.meta.env.SITE || null;

  if (rawOrigin) {
    try {
      const parentDomain = new URL(rawOrigin).hostname;
      return new Response(JSON.stringify({ parentDomain }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      // Malformed URL, fall through to Host header
    }
  }

  // Fallback: derive from the Host header (acceptable for local/dev use).
  const hostHeader = request.headers.get("host") || "";
  const host = hostHeader.split(":")[0];
  const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
  const parentDomain = isIpAddress ? "mixchat.local" : host;

  return new Response(JSON.stringify({ parentDomain }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
