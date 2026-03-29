import type { APIRoute } from "astro";
import { getYoutubeAccessToken, getYoutubeUser } from "../../../lib/youtube";

export const GET: APIRoute = async ({ url, cookies }) => {
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");

  if (!code) {
    return new Response("Authorization code not found", { status: 400 });
  }

  // Require the state parameter to be present on every callback request.
  if (!returnedState) {
    return new Response("Missing state parameter", { status: 400 });
  }

  try {
    const isDev = import.meta.env.MODE === 'development';
    const isSecure = !isDev;

    const clientId = import.meta.env.PUBLIC_YOUTUBE_CLIENT_ID;
    const clientSecret = import.meta.env.YOUTUBE_CLIENT_SECRET;
    const redirectUri = import.meta.env.PUBLIC_YOUTUBE_REDIRECT_URI;

    const tokenData = await getYoutubeAccessToken(
      code,
      clientId,
      clientSecret,
      redirectUri,
    );

    const user = await getYoutubeUser(tokenData.access_token);

    // Store token in secure cookie. Align settings with the refresh endpoint
    // so the server can read the refresh token later and refresh seamlessly.
    cookies.set("youtube_token", tokenData.access_token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      maxAge: tokenData.expires_in || 3600,
      path: "/",
    });

    if (tokenData.refresh_token) {
      cookies.set("youtube_refresh_token", tokenData.refresh_token, {
        httpOnly: true,
        secure: isSecure,
        sameSite: "lax",
        maxAge: 365 * 24 * 60 * 60, // 365 days
        path: "/",
      });
    }

    // Safely serialize all values with JSON.stringify so that special characters
    // (quotes, backslashes, newlines, etc.) in any user-controlled field can never
    // break out of the JavaScript context and execute arbitrary code.
    const sessionPayload = JSON.stringify({
      platform: "youtube",
      userId: user.userId,
      displayName: user.displayName,
      profileImageUrl: user.profileImageUrl,
      accessToken: tokenData.access_token,
      // Only include refreshToken when Google actually returns one.
      // An empty string would be falsy and cause useTokenRefresh to skip
      // the httpOnly-cookie-based token refresh on page reload.
      ...(tokenData.refresh_token ? { refreshToken: tokenData.refresh_token } : {}),
      expiresAt: Date.now() + ((tokenData.expires_in ?? 3600) * 1000),
      timestamp: Date.now(),
    });
    // Pass the returned state value safely so the browser can verify it.
    const returnedStateJson = JSON.stringify(returnedState);

    // Return HTML that posts the session to the opener (popup flow) and
    // falls back to a localStorage + redirect approach when opened as a
    // full-page redirect (e.g. popup blocked).
    return new Response(
      `<!DOCTYPE html>
<html>
<head><title>YouTube Auth</title></head>
<body>
<script>
  (function () {
    var returnedState = ${returnedStateJson};

    // --- CSRF state validation ---
    // In a popup flow the sessionStorage is scoped to the popup browsing context.
    // After navigating through an external OAuth provider (Google) the popup's
    // sessionStorage may no longer contain the key that was set before the navigation.
    // Try to read the expected state from the opener's sessionStorage first
    // (same-origin access is allowed), then fall back to the local copy.
    var expectedState = null;
    try {
      if (window.opener && window.opener.sessionStorage) {
        expectedState = window.opener.sessionStorage.getItem('youtube_oauth_state');
        window.opener.sessionStorage.removeItem('youtube_oauth_state');
      }
    } catch (e) { /* opener may be cross-origin or inaccessible */ }

    if (!expectedState) {
      // Fallback: redirect flow — state lives in this window's sessionStorage.
      expectedState = sessionStorage.getItem('youtube_oauth_state');
      sessionStorage.removeItem('youtube_oauth_state');
    }

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
      sessions.youtube = persisted;
      localStorage.setItem('mixchat_sessions', JSON.stringify(sessions));
    } catch (e) { /* storage unavailable */ }

    // Signal the parent window via postMessage (if opener reference is alive)
    // and also via a dedicated localStorage key as a reliable fallback.
    // Some browsers null out window.opener after cross-origin navigation.
    try {
      localStorage.setItem('mixchat_youtube_auth', JSON.stringify({ session: session, ts: Date.now() }));
    } catch (e) { /* storage unavailable */ }

    try {
      if (window.opener && window.opener.postMessage) {
        window.opener.postMessage({ type: 'mixchat_session', session: session }, window.location.origin);
      }
    } catch (e) { /* cross-origin opener */ }

    // Close the popup if we were opened as one; otherwise do a full redirect.
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
    console.error("YouTube OAuth callback error:", error);
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
