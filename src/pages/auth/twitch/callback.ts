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
    const isDev = import.meta.env.MODE === "development";
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

    // Build the session object and then double-stringify it:
    // - First JSON.stringify turns it into a JSON string.
    // - Second JSON.stringify (applied in the template below via JSON.stringify(sessionPayload))
    //   wraps that JSON string in JS string-literal quotes, escaping all special characters
    //   (backslashes, quotes, U+2028/U+2029 line separators, </script> sequences, etc.)
    //   so it can never cause a SyntaxError or break out of the <script> context.
    // The browser then calls JSON.parse() to recover the object.
    const sessionPayload = JSON.stringify({
      platform: "twitch",
      userId: user.userId,
      displayName: user.displayName,
      username: user.login,
      profileImageUrl: user.profileImageUrl,
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken ?? "",
      expiresAt: Date.now() + (tokenData.expiresIn ?? 3600) * 1000,
      timestamp: Date.now(),
    });
    // Double-stringify for safe JS embedding (same pattern as returnedStateJson).
    const sessionPayloadJson = JSON.stringify(sessionPayload)
      // Extra safety: escape </ so the string can never end the <script> block.
      .replace(/</g, "\\u003c");
    // Pass the returned state value safely so the browser can verify it.
    const returnedStateJson = JSON.stringify(returnedState);

    // Return HTML that stores session in localStorage, posts message to opener, and redirects
    return new Response(
      `<!DOCTYPE html>
<html>
<head><title>Twitch Auth</title></head>
<body>
<p style="font-family:sans-serif;padding:2rem;color:#555">Completing sign-in…</p>
<script>
  (function () {
    var returnedState = ${returnedStateJson};
    console.log('[twitch-callback] script running, returnedState:', returnedState);

    var expectedState = null;
    var returnUrl = '/';

    // --- Read CSRF state ---
    // Popup flow: read from the opener window's sessionStorage first (the state
    // was stored in the parent before window.open() was called).
    try {
      if (window.opener && window.opener.sessionStorage) {
        expectedState = window.opener.sessionStorage.getItem('twitch_oauth_state');
        var openerReturnUrl = window.opener.sessionStorage.getItem('twitch_oauth_return_url');
        if (openerReturnUrl) returnUrl = openerReturnUrl;
        window.opener.sessionStorage.removeItem('twitch_oauth_state');
        window.opener.sessionStorage.removeItem('twitch_oauth_return_url');
        console.log('[twitch-callback] opener sessionStorage state:', expectedState);
      }
    } catch (e) {
      console.error('[twitch-callback] opener sessionStorage error:', e);
    }

    // Redirect flow: try own sessionStorage (same-tab navigation preserves it).
    if (!expectedState) {
      try {
        expectedState = sessionStorage.getItem('twitch_oauth_state');
        var savedReturnUrl = sessionStorage.getItem('twitch_oauth_return_url');
        if (savedReturnUrl) returnUrl = savedReturnUrl;
        sessionStorage.removeItem('twitch_oauth_state');
        sessionStorage.removeItem('twitch_oauth_return_url');
        console.log('[twitch-callback] own sessionStorage state:', expectedState);
      } catch (e) {
        console.error('[twitch-callback] sessionStorage error:', e);
      }
    }

    // Fallback: localStorage (mobile browsers and Firefox private mode).
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

    console.log('[twitch-callback] expectedState:', expectedState ? 'present (len=' + expectedState.length + ')' : 'MISSING', 'match:', expectedState === returnedState);

    if (!expectedState || expectedState !== returnedState) {
      document.body.innerHTML =
        '<pre style="font-family:sans-serif;padding:2rem">' +
        'Authentication failed: invalid state.\\n\\n' +
        'expectedState: ' + (expectedState ? 'present (len=' + expectedState.length + ')' : 'MISSING') + '\\n' +
        'returnedState: ' + (returnedState ? 'present (len=' + returnedState.length + ')' : 'MISSING') + '\\n' +
        'match: ' + (expectedState === returnedState) + '\\n\\n' +
        'Check the browser console for details.\\n\\n' +
        '<a href="/">Go back and try again</a>' +
        '</pre>';
      return;
    }

    var session = JSON.parse(${sessionPayloadJson});
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

    // Popup flow: notify the opener and close this window.
    if (window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage({ type: 'mixchat_session', session: session }, window.location.origin);
        window.close();
      } catch (e) {
        console.error('[twitch-callback] postMessage to opener failed:', e);
      }
    }

    // Redirect flow (mobile or if opener is unavailable / window.close() was ignored):
    // navigate back to the app.
    window.location.href = returnUrl;
  })();
<\/script>
</body>
</html>`,
      {
        status: 200,
        headers: {
          "Content-Type": "text/html",
          // Set CSP explicitly here so the middleware does not override it with a
          // nonce-based policy. This page contains only server-generated JSON data
          // (sanitised via JSON.stringify) so unsafe-inline is safe and necessary
          // for the script to execute even when a reverse proxy has already set its
          // own Content-Security-Policy header upstream.
          "Content-Security-Policy": [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'unsafe-inline'",
            "connect-src 'self'",
            "img-src 'none'",
            "frame-src 'none'",
          ].join("; "),
        },
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
