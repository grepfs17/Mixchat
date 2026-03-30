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
    "/helix/chat/emotes",       // covers /helix/chat/emotes?broadcaster_id=...
    "/helix/chat/badges/global",
    "/helix/chat/badges",       // covers /helix/chat/badges?broadcaster_id=...
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
export const GET: APIRoute = async ({ url, cookies, clientAddress }) => {
    if (!checkRateLimit(`${clientAddress}:twitch-proxy`, 120, 60_000)) {
        return new Response(
            JSON.stringify({ error: "Too many requests" }),
            { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "60" } },
        );
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
        const isAllowed = ALLOWED_PATH_PREFIXES.some((prefix) =>
            path === prefix || path.startsWith(prefix + "?") || path.startsWith(prefix + "/"),
        );
        if (!isAllowed) {
            return new Response(
                JSON.stringify({ error: `Path not permitted: ${path}` }),
                { status: 400, headers: { "Content-Type": "application/json" } },
            );
        }

        // Read the access token from the httpOnly cookie — never from client input.
        const accessToken = cookies.get("twitch_token")?.value;
        if (!accessToken) {
            return new Response(
                JSON.stringify({ error: "Not authenticated" }),
                { status: 401, headers: { "Content-Type": "application/json" } },
            );
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

        const targetUrl = `${TWITCH_API_BASE}${path}${forwardParams.size > 0 ? `?${forwardParams}` : ""
            }`;

        const response = await fetch(targetUrl, {
            headers: {
                "Client-Id": clientId,
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/json",
            },
        });

        const data = await response.json();

        return new Response(JSON.stringify(data), {
            status: response.status,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Twitch proxy error:", error);
        return new Response(
            JSON.stringify({ error: "Proxy request failed" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
        );
    }
};
