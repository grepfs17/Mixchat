import type { APIRoute } from "astro";
import { getYoutubeAccessToken, getYoutubeUser } from "../../../lib/youtube";
import { IS_DESKTOP, IS_TWITCH_ONLY } from "../../../lib/constants";

export const GET: APIRoute = async ({ url, cookies, locals }) => {
  if (IS_TWITCH_ONLY) {
    return new Response(
      `<!DOCTYPE html>
<html>
<head><title>Disabled</title></head>
<body>
<h1>YouTube Integrations Disabled</h1>
<p>This instance is configured for Twitch only. YouTube authentication is not available.</p>
<a href="/">Back to home</a>
</body>
</html>`,
      { status: 403, headers: { "Content-Type": "text/html" } },
    );
  }

  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");

  if (!code) {
    return new Response("Authorization code not found", { status: 400 });
  }

  if (!returnedState) {
    return new Response("Missing state parameter", { status: 400 });
  }

  // Server-side CSRF validation: the state must match the httpOnly cookie
  // that was set when the OAuth flow started. This prevents login CSRF
  // attacks where an attacker tricks a victim into completing OAuth with
  // the attacker's identity.
  const expectedState = cookies.get("oauth_state")?.value;
  if (!expectedState || expectedState !== returnedState) {
    cookies.delete("oauth_state", { path: "/" });
    return new Response(
      `<!DOCTYPE html>
<html>
<head><title>Auth Error</title></head>
<body>
<h1>Authentication Failed</h1>
<p>Invalid state parameter. This could be a CSRF attack. Please try again.</p>
<a href="/">Back to home</a>
</body>
</html>`,
      { status: 403, headers: { "Content-Type": "text/html" } },
    );
  }
  // State is valid. Consume it now so it can't be replayed.
  cookies.delete("oauth_state", { path: "/" });

  try {
    const isDev = import.meta.env.MODE === "development";
    const isSecure = !isDev;

    const clientId = import.meta.env.PUBLIC_YOUTUBE_CLIENT_ID;
    // Google requires the client secret even for Desktop-app (PKCE) clients.
    const clientSecret = import.meta.env.YOUTUBE_CLIENT_SECRET || undefined;
    const redirectUri = import.meta.env.PUBLIC_YOUTUBE_REDIRECT_URI;

    const codeVerifier = IS_DESKTOP
      ? cookies.get("google_code_verifier")?.value
      : undefined;
    if (IS_DESKTOP) cookies.delete("google_code_verifier", { path: "/" });

    const tokenData = await getYoutubeAccessToken(code, clientId, redirectUri, {
      clientSecret,
      codeVerifier,
    });

    // Detect which OAuth flow this callback belongs to. The flow type is
    // encoded in the state parameter as "<uuid>:drive" or "<uuid>" (YouTube).
    const driveFlow = returnedState.endsWith(":drive");
    const flow: "youtube" | "drive" = driveFlow ? "drive" : "youtube";

    if (flow === "drive") {
      // --- Drive-only flow: store tokens in separate cookies ---
      cookies.set("drive_token", tokenData.access_token, {
        httpOnly: true,
        secure: isSecure,
        sameSite: "lax",
        maxAge: tokenData.expires_in || 3600,
        path: "/",
      });

      if (tokenData.refresh_token) {
        cookies.set("drive_refresh_token", tokenData.refresh_token, {
          httpOnly: true,
          secure: isSecure,
          sameSite: "strict",
          maxAge: 365 * 24 * 60 * 60,
          path: "/",
        });
      }

      // Signal the opener that Drive access was granted so the YouTube
      // session can update its hasDriveScope flag.
      const driveReturnedStateJson = JSON.stringify(returnedState).replace(
        /</g,
        "\\u003c",
      );

      return new Response(
        `<!DOCTYPE html>
<html>
<head><title>Drive Access Granted</title></head>
<body>
<script nonce="${locals.nonce}">
  (function () {
    var returnedState = ${driveReturnedStateJson};

    // --- CSRF state validation ---
    var expectedState = null;
    try {
      if (window.opener && window.opener.sessionStorage) {
        expectedState = window.opener.sessionStorage.getItem('youtube_oauth_state');
        window.opener.sessionStorage.removeItem('youtube_oauth_state');
      }
    } catch (e) { /* opener may be cross-origin or inaccessible */ }
    if (!expectedState) {
      expectedState = sessionStorage.getItem('youtube_oauth_state');
      sessionStorage.removeItem('youtube_oauth_state');
    }
    if (!expectedState || expectedState !== returnedState) {
      document.body.innerText = 'Authentication failed: invalid state. Possible CSRF attack.';
      return;
    }
    // --- End CSRF check ---

    try {
      localStorage.setItem('mixchat_drive_granted', JSON.stringify({ ts: Date.now() }));
    } catch (e) {}
    try {
      if (window.opener && window.opener.postMessage) {
        window.opener.postMessage({ type: 'mixchat_drive_granted' }, window.location.origin);
      }
    } catch (e) {}
    if (window.opener) {
      try { window.close(); } catch (e) {}
      window.location.href = '/';
    } else {
      window.location.href = '/';
    }
  })();
<\/script>
</body>
</html>`,
        { status: 200, headers: { "Content-Type": "text/html" } },
      );
    }

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
        sameSite: "strict",
        maxAge: 365 * 24 * 60 * 60, // 365 days
        path: "/",
      });
    }

    // Serialize user-controlled fields so they can't break out of the JS context.
    const sessionPayload = JSON.stringify({
      platform: "youtube",
      userId: user.userId,
      displayName: user.displayName,
      profileImageUrl: user.profileImageUrl,
      accessToken: tokenData.access_token,
      // Only include refreshToken when Google actually returns one.
      // An empty string would be falsy and cause useTokenRefresh to skip
      // the httpOnly-cookie-based token refresh on page reload.
      ...(tokenData.refresh_token
        ? { refreshToken: tokenData.refresh_token }
        : {}),
      expiresAt: Date.now() + (tokenData.expires_in ?? 3600) * 1000,
      timestamp: Date.now(),
    });
    // Double-stringify so the payload becomes a safely escaped JS string
    // literal. The replace guards against </script> sequences.
    const sessionPayloadJson = JSON.stringify(sessionPayload).replace(
      /</g,
      "\\u003c",
    );
    // Pass the returned state value safely so the browser can verify it.
    // Escape </ to prevent the string from closing the <script> block.
    const returnedStateJson = JSON.stringify(returnedState).replace(
      /</g,
      "\\u003c",
    );

    // Return HTML that posts the session to the opener (popup flow) and
    // falls back to a localStorage + redirect approach when opened as a
    // full-page redirect (e.g. popup blocked).
    return new Response(
      `<!DOCTYPE html>
<html>
<head><title>YouTube Auth</title></head>
<body>
<script nonce="${locals.nonce}">
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
      // Fallback: redirect flow. State lives in this window's sessionStorage.
      expectedState = sessionStorage.getItem('youtube_oauth_state');
      sessionStorage.removeItem('youtube_oauth_state');
    }

    if (!expectedState || expectedState !== returnedState) {
      document.body.innerText = 'Authentication failed: invalid state. Possible CSRF attack.';
      return;
    }
    // --- End CSRF check ---

    var session = JSON.parse(${sessionPayloadJson});

    try {
      var sessions = JSON.parse(localStorage.getItem('mixchat_sessions:v1') || '{}');
      // Strip accessToken and refreshToken: they live only in httpOnly
      // cookies and must not be exposed to JavaScript.
      var persisted = Object.assign({}, session);
      delete persisted.accessToken;
      delete persisted.refreshToken;
      sessions.youtube = persisted;
      localStorage.setItem('mixchat_sessions:v1', JSON.stringify(sessions));
    } catch (e) { /* storage unavailable */ }

    // Signal the parent window via postMessage (if opener reference is alive)
    // and also via a dedicated localStorage key as a reliable fallback.
    // Some browsers null out window.opener after cross-origin navigation.
    try {
      var persistedYT = Object.assign({}, session);
      delete persistedYT.accessToken;
      delete persistedYT.refreshToken;
      localStorage.setItem('mixchat_youtube_auth', JSON.stringify({ session: persistedYT, ts: Date.now() }));
    } catch (e) { /* storage unavailable */ }

    try {
      if (window.opener && window.opener.postMessage) {
        window.opener.postMessage({ type: 'mixchat_session', session: session }, window.location.origin);
      }
    } catch (e) { /* cross-origin opener */ }

    // Close the popup if we were opened as one. Otherwise, do a full redirect.
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
  } catch (error: any) {
    if (error?.name === "NoChannelError") {
      return new Response(
        `<!DOCTYPE html>
<html>
<head><title>No YouTube Channel</title></head>
<body>
<h1>No YouTube Channel Found</h1>
<p>Your Google account is not associated with a YouTube channel. Please create a YouTube channel first, or sign in with a different Google account that has one.</p>
<a href="/">Back to home</a>
</body>
</html>`,
        { status: 400, headers: { "Content-Type": "text/html" } },
      );
    }
    console.error("YouTube OAuth callback error:", error);
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
