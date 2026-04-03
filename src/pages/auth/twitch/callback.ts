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
    var returnedState = ${returnedStateJson};
    console.log('[twitch-callback] script running, returnedState:', returnedState);

    // --- Read CSRF state ---
    // Primary: sessionStorage (per-tab, survives same-tab navigations).
    var expectedState = sessionStorage.getItem('twitch_oauth_state');
    var returnUrl = sessionStorage.getItem('twitch_oauth_return_url') || '/';
    sessionStorage.removeItem('twitch_oauth_state');
    sessionStorage.removeItem('twitch_oauth_return_url');
    console.log('[twitch-callback] sessionStorage state:', expectedState, 'returnUrl:', returnUrl);

    // Fallback: localStorage (handles Firefox privacy modes that clear sessionStorage).
    if (!expectedState) {
      try {
        var raw = localStorage.getItem('twitch_oauth_state_fb');
        console.log('[twitch-callback] localStorage fallback raw:', raw);
        if (raw) {
          var fb = JSON.parse(raw);
          if (fb && fb.exp > Date.now()) {
            expectedState = fb.state;
            returnUrl = fb.returnUrl || '/';
            console.log('[twitch-callback] using localStorage fallback state:', expectedState);
          } else {
            console.log('[twitch-callback] localStorage fallback expired');
          }
        }
      } catch (e) {
        console.error('[twitch-callback] localStorage fallback error:', e);
      }
    }
    try { localStorage.removeItem('twitch_oauth_state_fb'); } catch (_) {}

    console.log('[twitch-callback] expectedState:', expectedState, 'match:', expectedState === returnedState);

    if (!expectedState || expectedState !== returnedState) {
      document.body.innerHTML =
        '<pre style="font-family:sans-serif;padding:2rem">' +
        'Authentication failed: invalid state.\n\n' +
        'expectedState: ' + (expectedState ? 'present (len=' + expectedState.length + ')' : 'MISSING') + '\n' +
        'returnedState: ' + (returnedState ? 'present (len=' + returnedState.length + ')' : 'MISSING') + '\n' +
        'match: ' + (expectedState === returnedState) + '\n\n' +
        'Check the browser console for details.\n\n' +
        '<a href="/">Go back and try again</a>' +
        '</pre>';
      return;
    }

    var session = ${sessionPayload};
    console.log('[twitch-callback] session ok, user:', session.username, 'redirecting to:', returnUrl);

    try {
      var sessions = JSON.parse(localStorage.getItem('mixchat_sessions') || '{}');
      var persisted = Object.assign({}, session);
      delete persisted.accessToken;
      sessions.twitch = persisted;
      localStorage.setItem('mixchat_sessions', JSON.stringify(sessions));
      console.log('[twitch-callback] session written to localStorage');
    } catch (e) {
      console.error('[twitch-callback] localStorage write error:', e);
    }

    window.location.href = returnUrl;
log('[twitch-callback] expectedState:', expectedState, 'match:', expectedState === returnedState);

    if (!expectedState || expectedState !== returnedState) {
      document.body.innerHTML =
        '<pre style="font-family:sans-serif;padding:2rem">' +
        'Authentication failed: invalid state.\n\n' +
        'expectedState: ' + (expectedState ? 'present (len=' + expectedState.length + ')' : 'MISSING') + '\n' +
        'returnedState: ' + (returnedState ? 'present (len=' + returnedState.length + ')' : 'MISSING') + '\n' +
        'match: ' + (expectedState === returnedState) + '\n\n' +
        'Check the browser console for details.\n\n' +
        '<a href="/">Go back and try again</a>' +
        '</pre>';
      return;
    }

    var session = ${sessionPayload};
    console.log('[twitch-callback] session ok, user:', session.username, 'redirecting to:', returnUrl);

    try {
      var sessions = JSON.parse(localStorage.getItem('mixchat_sessions') || '{}');
      var persisted = Object.assign({}, session);
      delete persisted.accessToken;
      sessions.twitch = persisted;
      localStorage.setItem('mixchat_sessions', JSON.stringify(sessions));
      console.log('[twitch-callback] session written to localStorage');
    } catch (e) {
      console.error('[twitch-callback] localStorage write error:', e);
    }

    window.location.href = returnUrl;
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
