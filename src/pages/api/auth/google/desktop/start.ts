import type { APIRoute } from "astro";
import { IS_DESKTOP, IS_TWITCH_ONLY } from "../../../../../lib/constants";
import {
  createHandoff,
  type GoogleHandoffFlow,
} from "../../../../../server/googleHandoff";

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
 * Start a desktop Google OAuth handoff. The returned URL must be opened in the
 * user's system browser, where Google accepts the sign-in. The app then polls
 * /api/auth/google/desktop/poll with the handoff id.
 */
export const POST: APIRoute = async ({ request }) => {
  if (!IS_DESKTOP) return json({ error: "Not found" }, 404);
  if (IS_TWITCH_ONLY) {
    return json({ error: "YouTube integrations are disabled" }, 403);
  }

  const body = (await request.json().catch(() => ({}))) as {
    flow?: string;
  };
  const flow: GoogleHandoffFlow = body.flow === "drive" ? "drive" : "youtube";

  const clientId = import.meta.env.PUBLIC_YOUTUBE_CLIENT_ID;
  const redirectUri = import.meta.env.PUBLIC_YOUTUBE_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return json({ error: "Google OAuth is not configured" }, 500);
  }

  const handoff = createHandoff(flow);
  const scope =
    flow === "drive"
      ? "https://www.googleapis.com/auth/drive.file"
      : "https://www.googleapis.com/auth/youtube.force-ssl";

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
    access_type: "offline",
    prompt: "consent",
    state: handoff.state,
    code_challenge: handoff.codeChallenge,
    code_challenge_method: "S256",
  });

  return json({
    handoffId: handoff.id,
    authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  });
};
