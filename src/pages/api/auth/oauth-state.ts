import type { APIRoute } from "astro";
import { randomBytes } from "node:crypto";

/**
 * Generate an OAuth CSRF state token, persist it in an httpOnly cookie so the
 * callback can validate it server-side before setting any auth cookies, and
 * return the token to the client for inclusion in the OAuth provider URL.
 *
 * The cookie is short-lived (5 minutes) and uses sameSite=lax so it is sent
 * on both popup-based and full-page redirect OAuth flows.
 *
 * Query params:
 *   ?flow=drive  — optional; when present the state is suffixed with ":drive"
 *                  so the YouTube callback can distinguish YouTube vs Drive
 *                  OAuth flows.
 */
export const GET: APIRoute = async ({ url, cookies }) => {
  const isDev = import.meta.env.MODE === "development";
  const flow = url.searchParams.get("flow") || "";
  let state = randomBytes(32).toString("hex");
  if (flow === "drive") state = `${state}:drive`;

  cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: !isDev,
    sameSite: "lax",
    maxAge: 5 * 60, // 5 minutes
    path: "/",
  });

  return new Response(JSON.stringify({ state }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
};
