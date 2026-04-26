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
      const isTvClient = process.env.YT_CLIENT === 'TV' || (!process.env.YT_CLIENT && !!serverCreds?.access_token);

      if (isTvClient) {
        // We use WEB client type even for TV tokens because high-level helpers 
        // like getChannel() in youtubei.js 17.x do not yet support parsing 
        // the TVHTML5 (TvBrowse) response format.
        innertubeOptions.client_type = 'WEB';
      } else if (process.env.YT_USER_AGENT) {
        innertubeOptions.user_agent = process.env.YT_USER_AGENT;
      } else {
        // Default to a modern desktop User-Agent for WEB client type.
        innertubeOptions.user_agent =
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
      }

      // Generate a session locally by default to reduce extra network requests.
      innertubeOptions.generate_session_locally =
        process.env.YT_GENERATE_SESSION_LOCALLY === 'false' ? false : true;

      // Ensure the token variable is populated for use in the fetch wrapper.
      if (serverCreds?.access_token) {
        _ytAccessToken = serverCreds.access_token;
      } else if (process.env.YT_COOKIE) {
        innertubeOptions.cookie = process.env.YT_COOKIE;
        _ytAccessToken = null;
      } else {
        _ytAccessToken = null;
      }

      // Support for Proof-of-Token (PoToken) and Visitor Data to avoid 403 blocks.
      if (process.env.YT_POTOKEN) {
        innertubeOptions.po_token = process.env.YT_POTOKEN;
      }
      if (process.env.YT_VISITOR_DATA) {
        innertubeOptions.visitor_data = process.env.YT_VISITOR_DATA;
      }

      if (process.env.YT_DEBUG === '1' && (innertubeOptions.po_token || innertubeOptions.visitor_data)) {
        console.debug('[YouTube] InnerTube initialized with PoToken details');
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

        if (!headers['user-agent']) headers['user-agent'] = baseUserAgent;
        if (!headers['referer']) headers['referer'] = baseReferer;
        if (!headers['accept-language']) headers['accept-language'] = 'en-US,en;q=0.9';

        // This is a fallback for endpoints that strictly require authentication
        // (like live chat polling). We avoid injecting it for public browse/lookup
        // endpoints as it often triggers "automated queries" blocks on the WEB client.
        const needsAuth = urlStr.includes('/v1/live_chat/') ||
          urlStr.includes('/v1/updated_metadata');
        if (_ytAccessToken && needsAuth && !headers['authorization'] && !headers['cookie']) {
          headers['authorization'] = `Bearer ${_ytAccessToken}`;
        }

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
          // If the response is an error (4xx/5xx), clone and log a truncated
          // response body to help diagnose why YouTube is rejecting the request.
          if (res.status >= 400) {
            try {
              const clone = res.clone();
              const txt = await clone.text().catch(() => '<failed to read body>');
              const short = typeof txt === 'string' ? txt.slice(0, 2000) : String(txt);

              if (res.status === 403 && (short.includes('automated queries') || short.includes('Sorry...'))) {
                console.error('[YouTube Proxy] YouTube blocked this request for "automated queries". Consider providing a valid YT_COOKIE or using a different IP/User-Agent.', { url: urlStr });
              } else {
                console.error('[YouTube Proxy] innertube fetch non-OK', { url: urlStr, status: res.status, body: short });
              }
            } catch (logErr) {
              console.error('[YouTube Proxy] innertube fetch non-OK (failed to log body)', { url: urlStr, status: res.status, err: String(logErr) });
            }
          } else {
            if (process.env.YT_DEBUG === '1') {
              try {
                console.debug('[YouTube Proxy] innertube fetch', { url: urlStr, status: res.status });
              } catch { }
            }
          }
          return res;
        } catch (err) {
          if (process.env.YT_DEBUG === '1') console.error('[YouTube Proxy] innertube fetch failed', err);
          throw err;
        }
      };

      yt = await Innertube.create(innertubeOptions);

      /*
      // Re-enable explicit sign-in if we have credentials.
      if (serverCreds?.access_token) {
        try {
          await yt.session.signIn({
            access_token: serverCreds.access_token,
            refresh_token: serverCreds.refresh_token,
            expiry_date: new Date(serverCreds.expires_at).toISOString(),
          });
          console.debug('[YouTube] Innertube signed in (ANDROID client)');
        } catch (signInErr) {
          console.error('[YouTube] Failed to sign in Innertube session:', signInErr);
        }
      }
      */
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
