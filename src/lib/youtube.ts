import { Innertube, Parser } from "youtubei.js";
import { googleFetch } from "./google";
import { loadServerCredentials } from "./youtube-server-auth";

let yt: Innertube | null = null;
/** Track which access_token the singleton was built with so we can rebuild on refresh. */
let _ytAccessToken: string | null = null;

// Suppress noisy "class_not_found" warnings for unknown YouTube.js nodes (e.g.
// LiveChatReportModerationStateCommand). These are harmless — youtubei.js JIT-
// generates a stub in the meantime — but they would otherwise spam the logs.
Parser.setParserErrorHandler(({ error_type }) => {
  if (error_type === "class_not_found") return;
});

export async function getInnertube() {
  // Load the server's own OAuth credential (set up via /api/youtube-device-auth).
  // If present and fresh, use it. If the access token has changed (after a refresh),
  // rebuild the Innertube singleton so it picks up the new token.
  const serverCreds = await loadServerCredentials();
  const currentToken = serverCreds?.access_token ?? null;
  if (yt && _ytAccessToken !== currentToken) {
    // Token was refreshed — invalidate singleton so it rebuilds with new token.
    yt = null;
  }

  if (!yt) {
    try {
      // Allow a configurable user agent and session generation to avoid
      // server-side 403s from YouTube. These options are documented by
      // youtubei.js (Innertube.create options).
      const innertubeOptions: Record<string, any> = {};
      const hasServerAuth = !!serverCreds?.access_token;
      let clientType = (process.env.YT_CLIENT || (hasServerAuth ? 'ANDROID' : 'WEB')).toUpperCase();

      // Normalize common aliases to prevent "INVALID_ARGUMENT" errors from YouTube
      if (clientType === 'TV') clientType = 'TVHTML5';

      innertubeOptions.client_type = clientType;

      if (process.env.YT_USER_AGENT) {
        innertubeOptions.user_agent = process.env.YT_USER_AGENT;
      } else if (clientType === 'WEB') {
        innertubeOptions.user_agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
      }

      // Generate a session locally by default to reduce extra network requests.
      innertubeOptions.generate_session_locally =
        process.env.YT_GENERATE_SESSION_LOCALLY === 'false' ? false : true;

      // Ensure the token variable is populated for use in diagnostics.
      if (hasServerAuth) {
        _ytAccessToken = serverCreds.access_token;
      } else if (process.env.YT_COOKIE) {
        innertubeOptions.cookie = process.env.YT_COOKIE;
        _ytAccessToken = null;
      } else {
        _ytAccessToken = null;
      }

      // Support for Proof-of-Token (PoToken) and Visitor Data (mainly for WEB client).
      if (process.env.YT_POTOKEN) {
        innertubeOptions.po_token = process.env.YT_POTOKEN;
      }
      if (process.env.YT_VISITOR_DATA) {
        innertubeOptions.visitor_data = process.env.YT_VISITOR_DATA;
      }

      if (process.env.YT_DEBUG === '1') {
        console.debug(`[YouTube] Initializing Innertube (${clientType} client)`, { hasPoToken: !!innertubeOptions.po_token, hasAuth: hasServerAuth });
      }

      // Provide a custom fetch wrapper to ensure outgoing Innertube requests
      // include a realistic User-Agent and Referer header.
      const baseUserAgent = innertubeOptions.user_agent;
      const referrer = process.env.ORIGIN || 'https://www.youtube.com/';
      const baseReferer = referrer.endsWith('/') ? referrer : referrer + '/';

      innertubeOptions.fetch = async (input: any, init?: any) => {
        // Compute a readable URL string for logging and diagnostics.
        let urlStr = '';
        try {
          if (typeof input === 'string') urlStr = input;
          else if (input && typeof input === 'object' && 'url' in input) urlStr = String((input as any).url);
          else urlStr = String(input);
        } catch {
          urlStr = String(input);
        }

        const headers: Record<string, string> = {};
        const orig = init?.headers;
        if (orig) {
          // Copy existing headers so we don't drop headers youtubei.js sets.
          if (typeof (orig as any).entries === 'function') {
            for (const [k, v] of (orig as any).entries()) {
              try { headers[k.toLowerCase()] = String(v); } catch { }
            }
          } else if (typeof (orig as any).forEach === 'function') {
            try {
              (orig as any).forEach((v: any, k: string) => {
                try { headers[k.toLowerCase()] = String(v); } catch { }
              });
            } catch { }
          } else if (typeof orig === 'object') {
            for (const k of Object.keys(orig)) {
              try { headers[k.toLowerCase()] = String((orig as any)[k]); } catch { }
            }
          }
        }

        if (!headers['user-agent'] && baseUserAgent) headers['user-agent'] = baseUserAgent;
        if (!headers['referer']) headers['referer'] = baseReferer;
        if (!headers['accept-language']) headers['accept-language'] = 'en-US,en;q=0.9';

        if (process.env.YT_DEBUG === '1') {
          try {
            const keys = Object.keys(headers);
            const hasAuth = keys.includes('authorization');
            const hasCookie = keys.includes('cookie');
            console.debug('[YouTube Proxy] outgoing innertube headers:', keys.join(', '), hasAuth ? '(auth present)' : '(no auth)', hasCookie ? '(cookie present)' : '(no cookie)');
          } catch { }
        }

        const merged = { ...(init || {}), headers };
        try {
          const res = await fetch(input, merged);
          if (res.status >= 400) {
            try {
              const clone = res.clone();
              const txt = await clone.text().catch(() => '<failed to read body>');
              const short = typeof txt === 'string' ? txt.slice(0, 2000) : String(txt);

              if (res.status === 403 && (short.includes('automated queries') || short.includes('Sorry...'))) {
                console.error('[YouTube Proxy] YouTube blocked this request for "automated queries".', { url: urlStr, client: clientType });
              } else {
                console.error('[YouTube Proxy] innertube fetch non-OK', { url: urlStr, status: res.status, body: short });
              }
            } catch (logErr) {
              console.error('[YouTube Proxy] innertube fetch non-OK (failed to log body)', { url: urlStr, status: res.status, err: String(logErr) });
            }
          }
          return res;
        } catch (err) {
          if (process.env.YT_DEBUG === '1') console.error('[YouTube Proxy] innertube fetch failed', err);
          throw err;
        }
      };

      yt = await Innertube.create(innertubeOptions);

      // Re-enable explicit sign-in if we have credentials.
      if (serverCreds?.access_token) {
        try {
          await yt.session.signIn({
            access_token: serverCreds.access_token,
            refresh_token: serverCreds.refresh_token,
            expiry_date: new Date(serverCreds.expires_at).toISOString(),
          });
          if (process.env.YT_DEBUG === '1') console.debug(`[YouTube] Innertube session signed in (${clientType} client)`);
        } catch (signInErr) {
          console.error('[YouTube] Failed to sign in Innertube session:', signInErr);
        }
      }
    } catch (error) {
      // Reset to null on error so next call retries instead of returning failed instance
      yt = null;
      throw error;
    }
  }
  return yt;
}

export async function getYoutubeAccessToken(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get YouTube access token: ${err}`);
  }

  return res.json();
}

export async function getYoutubeUser(accessToken: string) {
  let data: any;
  try {
    data = await googleFetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
      { action: "channels.list", caller: "getYoutubeUser" },
    );
  } catch (e: any) {
    const raw = e?.message ?? String(e);
    // Strip generic prefix from googleFetch where present
    const message = raw.replace(/^Google API error:\s*/i, '');
    throw new Error(`Failed to get YouTube user: ${message}`);
  }

  if (!data.items || data.items.length === 0) {
    throw new Error("No YouTube channel found for this user");
  }

  const channel = data.items[0];
  return {
    userId: channel.id,
    displayName: channel.snippet.title,
    profileImageUrl: channel.snippet.thumbnails.default?.url,
  };
}

export async function refreshYoutubeToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    if (res.status === 400 || res.status === 401) {
      throw new Error(`Invalid refresh token (Google returned ${res.status})`);
    }
    const err = await res.text();
    throw new Error(`Failed to refresh YouTube token: ${err}`);
  }

  return res.json();
}
