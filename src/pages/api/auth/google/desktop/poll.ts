import type { APIRoute } from "astro";
import { IS_DESKTOP, IS_TWITCH_ONLY } from "../../../../../lib/constants";
import { takeResult } from "../../../../../server/googleHandoff";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Complete a desktop Google OAuth handoff. When the callback has stored a
 * result, this response sets the auth cookies in the app's own cookie jar and
 * returns the session. The handoff is single use.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!IS_DESKTOP) return json({ error: "Not found" }, 404);
  if (IS_TWITCH_ONLY) {
    return json({ error: "YouTube integrations are disabled" }, 403);
  }

  const body = (await request.json().catch(() => ({}))) as {
    handoffId?: string;
  };
  if (!body.handoffId || typeof body.handoffId !== "string") {
    return json({ error: "Missing handoffId" }, 400);
  }

  const poll = takeResult(body.handoffId);
  if (poll.status !== "complete") return json(poll);

  const isDev = import.meta.env.MODE === "development";
  const isSecure = !isDev;
  const { result } = poll;
  const maxAge = result.expiresIn || 3600;

  if (result.flow === "drive") {
    cookies.set("drive_token", result.accessToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      maxAge,
      path: "/",
    });
    if (result.refreshToken) {
      cookies.set("drive_refresh_token", result.refreshToken, {
        httpOnly: true,
        secure: isSecure,
        sameSite: "strict",
        maxAge: 365 * 24 * 60 * 60,
        path: "/",
      });
    }
    return json({ status: "complete", flow: "drive" });
  }

  // Validate before writing anything: a failure response must not leave the
  // app half authenticated with cookies set but no session to return.
  if (!result.session) {
    return json({ error: "Google session is missing" }, 500);
  }

  cookies.set("youtube_token", result.accessToken, {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    maxAge,
    path: "/",
  });
  if (result.refreshToken) {
    cookies.set("youtube_refresh_token", result.refreshToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "strict",
      maxAge: 365 * 24 * 60 * 60,
      path: "/",
    });
  }

  return json({
    status: "complete",
    flow: "youtube",
    session: result.session,
  });
};
