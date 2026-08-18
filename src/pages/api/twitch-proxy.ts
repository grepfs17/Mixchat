import type { APIRoute } from "astro";
import { checkRateLimit } from "../../lib/rateLimit";

/**
 * Allowlist of Twitch Helix API path prefixes this proxy is permitted to call.
 * Any path not matching one of these is rejected with 400.
 * This prevents the endpoint being abused to reach arbitrary external services.
 */
const ALLOWED_PATH_PREFIXES = [
  "/helix/chat/emotes/global",
  "/helix/chat/emotes/user",
  "/helix/chat/emotes", // covers /helix/chat/emotes?broadcaster_id=...
  "/helix/chat/badges/global",
  "/helix/chat/badges", // covers /helix/chat/badges?broadcaster_id=...
  "/helix/chat/settings", // used to check show_first_message_highlights
  "/helix/chat/announcements", // send chat announcements
  "/helix/chat/shoutouts", // send shoutouts
  "/helix/chat/pins", // pin chat messages
  "/helix/subscriptions", // check user subscription to a broadcaster
  "/helix/users", // used to resolve broadcaster IDs -> display names
  "/helix/channels/followers", // used to get follower count for own channel
  "/helix/channel_points/custom_rewards", // used to resolve reward titles by reward ID
  "/helix/moderation", // moderation endpoints (moderators only)
  "/helix/chat/messages", // used to send messages via Helix
  "/helix/raids", // raid start/cancel endpoints
  "/helix/hypetrain/status", // used to check active hype trains (replaces deprecated /events)
] as const;

const TWITCH_API_BASE = "https://api.twitch.tv";

/**
 * Server-side proxy for Twitch Helix API calls.
 *
 * Purpose: The client no longer needs to store the Twitch access token in
 * localStorage to make Twitch API calls (emotes, badges).  Instead it calls
 * this endpoint, which reads the token from the httpOnly "twitch_token" cookie
 * and forwards the request to Twitch on the server side.
 *
 * Usage: GET /api/twitch-proxy?path=/helix/chat/emotes/global
 *        GET /api/twitch-proxy?path=/helix/chat/emotes&broadcaster_id=12345
 *        GET /api/twitch-proxy?path=/helix/chat/badges/global
 */
function isPathAllowed(path: string) {
  return ALLOWED_PATH_PREFIXES.some(
    (prefix) =>
      path === prefix ||
      path.startsWith(prefix + "?") ||
      path.startsWith(prefix + "/"),
  );
}

async function forwardRequest(
  method: string,
  targetUrl: string,
  accessToken: string,
  clientId: string,
  body?: any,
) {
  const headers: Record<string, string> = {
    "Client-Id": clientId,
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };

  let opts: any = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    opts.body = typeof body === "string" ? body : JSON.stringify(body);
  }

  try {
    const response = await fetch(targetUrl, opts);
    const contentType =
      response.headers.get("content-type") || "application/json";

    // 204/205 responses must not include a body. Return an empty Response
    // with the same status for those codes to avoid invalid Response errors.
    if (response.status === 204 || response.status === 205) {
      return new Response(null, {
        status: response.status,
        headers: { "Content-Type": contentType },
      });
    }

    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: { "Content-Type": contentType },
    });
  } catch (err: any) {
    console.error("Error forwarding request to Twitch:", err);
    const bodyText = JSON.stringify({
      error: "Upstream request failed",
      details: err?.message || String(err),
    });
    return new Response(bodyText, {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const GET: APIRoute = async ({ url, cookies, request }) => {
  const clientAddress = request.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "unknown";
  if (!checkRateLimit(`${clientAddress}:twitch-proxy`, 120, 60_000)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "60" },
    });
  }

  try {
    const path = url.searchParams.get("path");
    if (!path) {
      return new Response(
        JSON.stringify({ error: "path parameter required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Validate the path against the allowlist
    if (!isPathAllowed(path)) {
      return new Response(
        JSON.stringify({ error: `Path not permitted: ${path}` }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Read the access token from the httpOnly cookie — never from client input.
    const accessToken = cookies.get("twitch_token")?.value;
    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const clientId = import.meta.env.PUBLIC_TWITCH_CLIENT_ID;
    if (!clientId) {
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // Build the full Twitch API URL, forwarding any extra query params from the
    // original request (e.g. broadcaster_id, user_id, after cursor).
    const forwardParams = new URLSearchParams(url.searchParams);
    forwardParams.delete("path"); // "path" is our own param, not Twitch's

    const targetUrl = `${TWITCH_API_BASE}${path}${
      forwardParams.size > 0 ? `?${forwardParams}` : ""
    }`;

    return await forwardRequest("GET", targetUrl, accessToken, clientId);
  } catch (error) {
    console.error("Twitch proxy error:", error);
    return new Response(JSON.stringify({ error: "Proxy request failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const POST: APIRoute = async ({ request, url, cookies }) => {
  const clientAddress = request.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "unknown";
  if (!checkRateLimit(`${clientAddress}:twitch-proxy-post`, 60, 60_000)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "60" },
    });
  }

  try {
    const path = url.searchParams.get("path");
    if (!path) {
      return new Response(
        JSON.stringify({ error: "path parameter required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!isPathAllowed(path)) {
      return new Response(
        JSON.stringify({ error: `Path not permitted: ${path}` }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const accessToken = cookies.get("twitch_token")?.value;
    if (!accessToken)
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });

    const clientId = import.meta.env.PUBLIC_TWITCH_CLIENT_ID;
    if (!clientId)
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );

    const forwardParams = new URLSearchParams(url.searchParams);
    forwardParams.delete("path");
    const targetUrl = `${TWITCH_API_BASE}${path}${forwardParams.size > 0 ? `?${forwardParams}` : ""}`;

    const body = await request.text().catch(() => "");
    let parsedBody: any;
    if (body) {
      try {
        parsedBody = JSON.parse(body);
        console.log("[twitch-proxy POST]", path, "body:", JSON.stringify(parsedBody));
      } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return await forwardRequest(
      "POST",
      targetUrl,
      accessToken,
      clientId,
      parsedBody,
    );
  } catch (error) {
    console.error("Twitch proxy POST error:", error);
    return new Response(JSON.stringify({ error: "Proxy request failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const DELETE: APIRoute = async ({ url, cookies, request }) => {
  const clientAddress = request.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "unknown";
  if (!checkRateLimit(`${clientAddress}:twitch-proxy-delete`, 60, 60_000)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "60" },
    });
  }

  try {
    const path = url.searchParams.get("path");
    if (!path)
      return new Response(
        JSON.stringify({ error: "path parameter required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );

    if (!isPathAllowed(path))
      return new Response(
        JSON.stringify({ error: `Path not permitted: ${path}` }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );

    const accessToken = cookies.get("twitch_token")?.value;
    if (!accessToken)
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });

    const clientId = import.meta.env.PUBLIC_TWITCH_CLIENT_ID;
    if (!clientId)
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );

    const forwardParams = new URLSearchParams(url.searchParams);
    forwardParams.delete("path");
    const targetUrl = `${TWITCH_API_BASE}${path}${forwardParams.size > 0 ? `?${forwardParams}` : ""}`;

    return await forwardRequest("DELETE", targetUrl, accessToken, clientId);
  } catch (error) {
    console.error("Twitch proxy DELETE error:", error);
    return new Response(JSON.stringify({ error: "Proxy request failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
