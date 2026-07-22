import type { APIRoute } from "astro";
import { checkRateLimit } from "../../../lib/rateLimit";

/**
 * Mapping of platform identifiers to the httpOnly cookie names that back them.
 * Kept in one place so the endpoint has a single source of truth for cookie
 * naming. If/when this is needed externally (e.g. by refresh-token.ts or the
 * OAuth callback pages), promote it to a `lib/` module and re-export from
 * there — for now no second consumer exists, so it stays module-private.
 */
const PLATFORM_COOKIES: Record<string, string[]> = {
  youtube: ["youtube_token", "youtube_refresh_token"],
  drive: ["drive_token", "drive_refresh_token"],
  twitch: ["twitch_token", "twitch_refresh_token"],
};

type LogoutPlatform = keyof typeof PLATFORM_COOKIES;

type LogoutBody = {
  /** Platforms whose httpOnly cookies should be cleared. Defaults to all. */
  platforms?: string[];
};

function isValidPlatform(p: string): p is LogoutPlatform {
  return p in PLATFORM_COOKIES;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const clientAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  if (!checkRateLimit(`${clientAddress}:auth-logout`, 30, 60_000)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": "60",
      },
    });
  }

  let body: LogoutBody = {};
  try {
    body = (await request.json()) as LogoutBody;
  } catch {
    // Empty / non-JSON body is allowed — defaults to clearing all platforms.
  }

  // Body was provided but no platforms field was sent (or it was empty) —
  // that's almost certainly a caller bug, so reject it instead of silently
  // clearing everything.
  let requested: string[];
  if (Array.isArray(body.platforms)) {
    if (body.platforms.length === 0) {
      return new Response(
        JSON.stringify({ error: "platforms must contain at least one entry" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    requested = body.platforms;
  } else {
    // No body / missing platforms field — default to clearing everything.
    requested = Object.keys(PLATFORM_COOKIES);
  }

  const unknown = requested.filter((p) => !isValidPlatform(p));
  if (unknown.length > 0) {
    return new Response(
      JSON.stringify({
        error: `Unknown platform(s): ${unknown.join(", ")}`,
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const cleared: string[] = [];
  for (const platform of requested) {
    for (const cookieName of PLATFORM_COOKIES[platform as LogoutPlatform]) {
      // `path: "/"` must match the path the cookie was set with, otherwise the
      // browser will keep a duplicate cookie under the original path.
      cookies.delete(cookieName, { path: "/" });
      cleared.push(cookieName);
    }
  }

  return new Response(
    JSON.stringify({ ok: true, cleared }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
};
