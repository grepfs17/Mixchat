import { Innertube, Parser } from "youtubei.js";
import { googleFetch } from "./google";

let yt: Innertube | null = null;

// Suppress noisy "class_not_found" warnings for unknown YouTube.js nodes (e.g.
// LiveChatReportModerationStateCommand). These are harmless — youtubei.js JIT-
// generates a stub in the meantime — but they would otherwise spam the logs.
Parser.setParserErrorHandler(({ error_type }) => {
  if (error_type === "class_not_found") return;
});

export async function getInnertube() {
  if (!yt) {
    try {
      // Allow a configurable user agent and session generation to avoid
      // server-side 403s from YouTube. These options are documented by
      // youtubei.js (Innertube.create options).
      const innertubeOptions: Record<string, any> = {};
      if (process.env.YT_USER_AGENT) {
        innertubeOptions.user_agent = process.env.YT_USER_AGENT;
      } else {
        // A modern desktop UA helps avoid some server-side blocking.
        innertubeOptions.user_agent =
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36';
      }

      // Allow passing a persistent cookie to authenticate InnerTube requests.
      // This is often required to avoid 403 Forbidden ("automated queries")
      // errors in hosting environments where the IP is flagged by YouTube.
      if (process.env.YT_COOKIE) {
        innertubeOptions.cookie = process.env.YT_COOKIE;
      }

      // Generate a session locally by default to reduce extra network requests
      // that may be blocked. Set YT_GENERATE_SESSION_LOCALLY=false to disable.
      innertubeOptions.generate_session_locally =
        process.env.YT_GENERATE_SESSION_LOCALLY === 'false' ? false : true;

      // Provide a custom fetch wrapper to ensure outgoing Innertube requests
      // include a realistic User-Agent and Referer header which helps avoid
      // YouTube rejecting requests with 403 in some hosting environments.
      const baseUserAgent = innertubeOptions.user_agent;
      innertubeOptions.fetch = async (input: any, init?: any) => {
        const headers: Record<string, string> = {};
        const orig = init?.headers;
        if (orig) {
          // Support different Headers implementations (global Headers, undici/node-fetch,
          // youtubei.js Platform.shim.Headers, or a plain object). Copy existing headers
          // so we don't drop values like `Cookie` or `Authorization` that Innertube sets.
          if (typeof (orig as any).entries === 'function') {
            for (const [k, v] of (orig as any).entries()) {
              try { headers[k.toLowerCase()] = String(v); } catch {}
            }
          } else if (typeof (orig as any).forEach === 'function') {
            try {
              (orig as any).forEach((v: any, k: string) => {
                try { headers[k.toLowerCase()] = String(v); } catch {}
              });
            } catch {}
          } else if (typeof orig === 'object') {
            for (const k of Object.keys(orig)) {
              try { headers[k.toLowerCase()] = String((orig as any)[k]); } catch {}
            }
          }
        }

        if (!headers['user-agent']) headers['user-agent'] = baseUserAgent;
        if (!headers['referer']) headers['referer'] = 'https://www.youtube.com/';
        if (!headers['accept-language']) headers['accept-language'] = 'en-US,en;q=0.9';

        if (process.env.YT_DEBUG === '1') {
          try {
            const keys = Object.keys(headers);
            console.debug('[YouTube Proxy] outgoing innertube headers:', keys.join(', '), keys.includes('cookie') ? '(cookie present)' : '(no cookie)');
          } catch {}
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
                console.error('[YouTube Proxy] YouTube blocked this request for "automated queries". Consider providing a valid YT_COOKIE or using a different IP/User-Agent.', { url: String(input) });
              } else {
                console.error('[YouTube Proxy] innertube fetch non-OK', { url: String(input), status: res.status, body: short });
              }
            } catch (logErr) {
              console.error('[YouTube Proxy] innertube fetch non-OK (failed to log body)', { url: String(input), status: res.status, err: String(logErr) });
            }
          } else {
            if (process.env.YT_DEBUG === '1') {
              try {
                console.debug('[YouTube Proxy] innertube fetch', { url: String(input), status: res.status });
              } catch {}
            }
          }
          return res;
        } catch (err) {
          if (process.env.YT_DEBUG === '1') console.error('[YouTube Proxy] innertube fetch failed', err);
          throw err;
        }
      };

      yt = await Innertube.create(innertubeOptions);
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
