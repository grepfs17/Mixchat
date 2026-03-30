import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ request }) => {
  // Prefer an explicitly configured public origin to avoid Host-header injection.
  // Set PUBLIC_SITE_URL=https://yourdomain.com in your environment.
  const configuredOrigin = import.meta.env.PUBLIC_SITE_URL;
  if (configuredOrigin) {
    try {
      const parentDomain = new URL(configuredOrigin).hostname;
      return new Response(JSON.stringify({ parentDomain }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      // Malformed PUBLIC_SITE_URL — fall through to Host header
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
