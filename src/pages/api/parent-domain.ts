import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ request }) => {
  const hostHeader = request.headers.get("host") || "";
  const host = hostHeader.split(":")[0];
  const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
  const parentDomain = isIpAddress ? "mixchat.local" : host;

  return new Response(JSON.stringify({ parentDomain }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
