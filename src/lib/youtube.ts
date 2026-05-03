import { Innertube, Parser } from "youtubei.js";
import { googleFetch } from "./google";
import { getPoToken, invalidatePoToken } from "./potoken";

let yt: Innertube | null = null;
let isInitializing = false;

Parser.setParserErrorHandler(({ error_type }) => {
  if (error_type === "class_not_found") return;
});

export function invalidateInnertube(): void {
  yt = null;
  invalidatePoToken();
}

let last403Time = 0;
const COOLDOWN_AFTER_403_MS = 30_000;

export async function getInnertube() {
  if (yt) return yt;

  const timeSince403 = Date.now() - last403Time;
  if (timeSince403 < COOLDOWN_AFTER_403_MS) {
    const wait = COOLDOWN_AFTER_403_MS - timeSince403;
    throw new Error(`[YouTube] Cooldown after 403 — retry in ${Math.ceil(wait / 1000)}s`);
  }

  if (isInitializing) {
    throw new Error('[YouTube] Innertube initialization already in progress');
  }
  isInitializing = true;

  try {
    const innertubeOptions: Record<string, any> = {};
    let clientType = (process.env.YT_CLIENT || 'WEB').toUpperCase();

    if (clientType === 'TV') clientType = 'TVHTML5';
    if (clientType === 'TVHTML5_TV') clientType = 'TVHTML5_SIMPLY_EMBEDDED_PLAYER';

    innertubeOptions.client_type = clientType;

    if (process.env.YT_USER_AGENT) {
      innertubeOptions.user_agent = process.env.YT_USER_AGENT;
    } else if (clientType === 'WEB') {
      innertubeOptions.user_agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    }

    innertubeOptions.generate_session_locally =
      process.env.YT_GENERATE_SESSION_LOCALLY === 'false' ? false : true;

    if (process.env.YT_COOKIE) {
      innertubeOptions.cookie = process.env.YT_COOKIE;
    }

    const envPoToken = process.env.YT_POTOKEN;
    const envVisitorData = process.env.YT_VISITOR_DATA;

    if (envPoToken) {
      innertubeOptions.po_token = envPoToken;
    }
    if (envVisitorData) {
      innertubeOptions.visitor_data = envVisitorData;
    }

    const autoPotoken = !envPoToken && !envVisitorData && clientType === 'WEB' && process.env.YT_POTOKEN !== 'off';

    if (autoPotoken) {
      try {
        const tokenData = await getPoToken();
        innertubeOptions.po_token = tokenData.poToken;
        innertubeOptions.visitor_data = tokenData.visitorData;
      } catch (poErr) {
        const msg = poErr instanceof Error ? poErr.message : String(poErr);
        console.warn('[YouTube] Auto PoToken generation failed, continuing without it:', msg);
      }
    }

    if (process.env.YT_DEBUG === '1') {
      console.debug(`[YouTube] Initializing Innertube (${clientType} client)`, {
        hasPoToken: !!innertubeOptions.po_token,
        hasCookie: !!innertubeOptions.cookie,
        hasVisitorData: !!innertubeOptions.visitor_data,
        autoPotoken,
      });
    }

    const baseUserAgent = innertubeOptions.user_agent;
    const referrer = process.env.ORIGIN || 'https://www.youtube.com/';
    const baseReferer = referrer.endsWith('/') ? referrer : referrer + '/';

    innertubeOptions.fetch = async (input: any, init?: any) => {
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

      if ('x-goog-visitor-id' in headers) {
        const val = headers['x-goog-visitor-id'];
        if (!val || !val.trim()) delete headers['x-goog-visitor-id'];
      }

      if (!headers['user-agent'] && baseUserAgent) headers['user-agent'] = baseUserAgent;
      if (!headers['referer']) headers['referer'] = baseReferer;
      if (!headers['accept-language']) headers['accept-language'] = 'en-US,en;q=0.9';

      if (process.env.YT_DEBUG === '1') {
        try {
          const keys = Object.keys(headers);
          const hasAuth = keys.includes('authorization');
          const hasCookie = keys.includes('cookie');
          const bodyPreview = typeof init?.body === 'string' ? init.body.slice(0, 500) : undefined;
          console.debug('[YouTube Proxy] outgoing innertube headers:', keys.join(', '), hasAuth ? '(auth present)' : '(no auth)', hasCookie ? '(cookie present)' : '(no cookie)', bodyPreview ? `\n  body: ${bodyPreview}` : '');
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

            if (res.status === 403) {
              last403Time = Date.now();
              if (short.includes('automated queries') || short.includes('Sorry...')) {
                console.error('[YouTube Proxy] YouTube blocked for "automated queries". Invalidating session.', { url: urlStr, client: clientType });
              } else {
                console.error('[YouTube Proxy] innertube fetch 403 — invalidating session for cooldown.', { url: urlStr, body: short.slice(0, 500) });
              }
              invalidateInnertube();
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
    return yt;
  } catch (error) {
    yt = null;
    if (error instanceof Error && /status code 403/i.test(error.message)) {
      last403Time = Date.now();
    }
    throw error;
  } finally {
    isInitializing = false;
  }
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