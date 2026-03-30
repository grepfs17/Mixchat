import type { APIRoute } from "astro";
import { getTwitchAccessToken, getTwitchUser } from "../../../lib/twitch";

export const GET: APIRoute = async ({ url, cookies, locals }) => {
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");

  if (!code) {
    return new Response("Authorization code not found", { status: 400 });
  }

  // The state value is validated client-side (in the inline script) because
  // sessionStorage is only accessible in the browser. We still require it to
  // be present on the server so a stateless request is always rejected.
  if (!returnedState) {
    return new Response("Missing state parameter", { status: 400 });
  }

  try {
    const isDev = import.meta.env.MODE === 'development';
    const isSecure = !isDev;

    const clientId = import.meta.env.PUBLIC_TWITCH_CLIENT_ID;
    const clientSecret = import.meta.env.TWITCH_CLIENT_SECRET;
    const redirectUri = import.meta.env.PUBLIC_TWITCH_REDIRECT_URI;

    const tokenData = await getTwitchAccessToken(
      code,
      clientId,
      clientSecret,
      redirectUri,
    );

    const user = await getTwitchUser(tokenData.accessToken, clientId);

    // Store token in secure cookie
    cookies.set("twitch_token", tokenData.accessToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      maxAge: tokenData.expiresIn || 3600,
      path: "/",
    });

    if (tokenData.refreshToken) {
      cookies.set("twitch_refresh_token", tokenData.refreshToken, {
        httpOnly: true,
        secure: isSecure,
        sameSite: "strict",
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: "/",
      });
    }

    // Safely serialize all values with JSON.stringify so that special characters
    // (quotes, backslashes, newlines, etc.) in any user-controlled field can never
    // break out of the JavaScript context and execute arbitrary code.
    const sessionPayload = JSON.stringify({
      platform: "twitch",
      userId: user.userId,
      displayName: user.displayName,
      username: user.login,
      profileImageUrl: user.profileImageUrl,
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken ?? "",
      expiresAt: Date.now() + ((tokenData.expiresIn ?? 3600) * 1000),
      timestamp: Date.now(),
    });
    // Pass the returned state value safely so the browser can verify it.
    const returnedStateJson = JSON.stringify(returnedState);

    // Return HTML that stores session in localStorage, posts message to opener, and redirects
    return new Response(
      `<!DOCTYPE html>
<html>
<head><title>Twitch Auth</title></head>
<body>
<script nonce="${locals.nonce}">
  (function () {
    // --- CSRF state validation ---
    var expectedState = sessionStorage.getItem('twitch_oauth_state');
    var returnedState = ${returnedStateJson};
    sessionStorage.removeItem('twitch_oauth_state');

    if (!expectedState || expectedState !== returnedState) {
      document.body.innerText = 'Authentication failed: invalid state. Possible CSRF attack.';
      return;
    }
    // --- End CSRF check ---

    var session = ${sessionPayload};

    try {
      var sessions = JSON.parse(localStorage.getItem('mixchat_sessions') || '{}');
      // Strip accessToken: it lives only in memory (React state) and is
      // repopulated on reload via useTokenRefresh + the httpOnly cookie.
      var persisted = Object.assign({}, session);
      delete persisted.accessToken;
      sessions.twitch = persisted;
      localStorage.setItem('mixchat_sessions', JSON.stringify(sessions));
    } catch (e) { /* storage unavailable */ }

    try {
      if (window.opener && window.opener.postMessage) {
        window.opener.postMessage({ type: 'mixchat_session', session: session }, window.location.origin);
      }
    } catch (e) { /* cross-origin opener */ }

    // If opened as a popup, close after notifying opener; otherwise redirect
    if (window.opener) {
      try { window.close(); } catch (e) {}
      // fallback redirect in case close() is blocked
      window.location.href = '/';
    } else {
      window.location.href = '/';
    }
  })();
<\/script>
</body>
</html>`,
      {
        status: 200,
        headers: { "Content-Type": "text/html" },
      },
    );
  } catch (error) {
    console.error("Twitch OAuth callback error:", error);
    // Return a generic error page — never reflect raw error messages to the client.
    return new Response(
      `<!DOCTYPE html>
<html>
<head><title>Auth Error</title></head>
<body>
<h1>Authentication Failed</h1>
<p>An error occurred during authentication. Please try again.</p>
<a href="/">Back to home</a>
</body>
</html>`,
      { status: 500, headers: { "Content-Type": "text/html" } },
    );
  }
};
