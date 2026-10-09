import { Innertube, Parser } from "youtubei.js";
import { googleFetch } from "./google";
import { getPoToken, invalidatePoToken } from "./potoken";
import { YT_USER_AGENT } from "./constants";

let yt: Innertube | null = null;
let isInitializing = false;

Parser.setParserErrorHandler(({ error_type }) => {
  if (error_type === "class_not_found") return;
});

function invalidateInnertube(): void {
  yt = null;
  if (!YT_PROXIES.length) {
    invalidatePoToken();
  }
}

let last403Time = 0;
const COOLDOWN_AFTER_403_MS = 30_000;

const YT_PROXIES: string[] = process.env.YT_PROXY
  ? process.env.YT_PROXY.split(",")
      .map((u: string) => u.trim().replace(/\/+$/, ""))
      .filter(Boolean)
  : [];
const YT_PROXY_TOKEN = process.env.YT_PROXY_TOKEN;

let proxyFailCounts: Record<string, number> = {};
let proxyCooldownUntil: Record<string, number> = {};
const PROXY_MAX_FAILS = 3;
const PROXY_COOLDOWN_MS = 30_000;

function selectProxy(
  proxies: string[] = YT_PROXIES,
  videoId?: string,
): string | undefined {
  if (!proxies.length) return undefined;
  const now = Date.now();

  // Without a videoId, return first available (backward compat).
  if (!videoId) {
    for (const proxy of proxies) {
      if (proxyCooldownUntil[proxy] && now < proxyCooldownUntil[proxy])
        continue;
      return proxy;
    }
    return proxies[0];
  }

  // Hash-based distribution: same videoId always maps to the same proxy,
  // different videos spread evenly. Failover to next available on cooldown.
  const idx = simpleHash(videoId) % proxies.length;
  for (let i = 0; i < proxies.length; i++) {
    const proxy = proxies[(idx + i) % proxies.length];
    if (proxyCooldownUntil[proxy] && now < proxyCooldownUntil[proxy]) continue;
    return proxy;
  }
  return proxies[idx]; // all cooled down — return hash pick anyway
}

/** Deterministic string hash (djb2 variant). Non-cryptographic, good distribution. */
function simpleHash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function markProxyFailed(proxy: string, cooldownMs?: number): void {
  proxyFailCounts[proxy] = (proxyFailCounts[proxy] || 0) + 1;
  const effectiveCooldown =
    Number.isFinite(cooldownMs) && cooldownMs! > 0
      ? cooldownMs!
      : PROXY_COOLDOWN_MS;
  if (proxyFailCounts[proxy] >= PROXY_MAX_FAILS || cooldownMs) {
    proxyCooldownUntil[proxy] = Date.now() + effectiveCooldown;
    console.warn(
      `[YouTube Proxy] ${proxy} failed ${proxyFailCounts[proxy]} time(s) — cooling down for ${effectiveCooldown / 1000}s`,
    );
    proxyFailCounts[proxy] = 0;
  }
}

function markProxyOk(proxy: string): void {
  delete proxyFailCounts[proxy];
  delete proxyCooldownUntil[proxy];
}

export function _resetProxyState(): void {
  proxyFailCounts = {};
  proxyCooldownUntil = {};
}

export function _getProxyState() {
  return { failCounts: proxyFailCounts, cooldownUntil: proxyCooldownUntil };
}

export function _resetThrottleState(): void {
  throttleTimestamps.clear();
}

export function _getThrottleState() {
  return Object.fromEntries(throttleTimestamps);
}

export { selectProxy, markProxyFailed, markProxyOk, PROXY_MAX_FAILS };
export { extractVideoId, getThrottleKey, simpleHash };

const LIVE_CHAT_POLL_MIN_MS = parseInt(
  process.env.YT_CHAT_POLL_MIN_MS || "2000",
  10,
);
const METADATA_POLL_MIN_MS = parseInt(
  process.env.YT_METADATA_POLL_MIN_MS || "30000",
  10,
);

// Per-videoId throttle timestamps so each session polls independently.
// Key format: "live_chat:<videoId>" or "metadata:<videoId>"
const throttleTimestamps = new Map<string, number>();

function extractVideoId(body: string | undefined): string | null {
  if (!body) return null;
  try {
    const parsed = JSON.parse(body);
    // InnerTube live_chat/get_live_chat sends videoId at top level
    if (parsed.videoId) return String(parsed.videoId);
    // updated_metadata may also carry videoId
    if (parsed.context?.videoId) return String(parsed.context.videoId);
  } catch {}
  return null;
}

function getThrottleKey(urlStr: string, body?: string): string | null {
  if (urlStr.includes("/live_chat/get_live_chat")) {
    const videoId = extractVideoId(body);
    return videoId ? `live_chat:${videoId}` : "live_chat";
  }
  if (urlStr.includes("/updated_metadata")) {
    const videoId = extractVideoId(body);
    return videoId ? `metadata:${videoId}` : "metadata";
  }
  return null;
}

function getThrottleBaseKey(compositeKey: string): string {
  // "live_chat:abc123" → "live_chat"
  const idx = compositeKey.indexOf(":");
  return idx >= 0 ? compositeKey.slice(0, idx) : compositeKey;
}

function getThrottleInterval(compositeKey: string): number {
  const base = getThrottleBaseKey(compositeKey);
  return base === "live_chat" ? LIVE_CHAT_POLL_MIN_MS : METADATA_POLL_MIN_MS;
}

// Evict stale throttle entries every 60s to prevent unbounded growth.
setInterval(() => {
  const now = Date.now();
  for (const [key, expiresAt] of throttleTimestamps) {
    if (now > expiresAt) throttleTimestamps.delete(key);
  }
}, 60_000);

export async function getInnertube() {
  if (yt) return yt;

  const timeSince403 = Date.now() - last403Time;
  if (timeSince403 < COOLDOWN_AFTER_403_MS) {
    const wait = COOLDOWN_AFTER_403_MS - timeSince403;
    throw new Error(
      `[YouTube] Cooldown after 403 — retry in ${Math.ceil(wait / 1000)}s`,
    );
  }

  if (isInitializing) {
    throw new Error("[YouTube] Innertube initialization already in progress");
  }
  isInitializing = true;

  try {
    const innertubeOptions: Record<string, any> = {};
    let clientType = (process.env.YT_CLIENT || "WEB").toUpperCase();

    if (clientType === "TV") clientType = "TVHTML5";
    if (clientType === "TVHTML5_TV")
      clientType = "TVHTML5_SIMPLY_EMBEDDED_PLAYER";

    innertubeOptions.client_type = clientType;

    if (process.env.YT_USER_AGENT) {
      innertubeOptions.user_agent = process.env.YT_USER_AGENT;
    } else if (clientType === "WEB") {
      innertubeOptions.user_agent = YT_USER_AGENT;
    }

    innertubeOptions.generate_session_locally =
      process.env.YT_GENERATE_SESSION_LOCALLY === "false" ? false : true;

    if (process.env.YT_COOKIE) {
      innertubeOptions.cookie = process.env.YT_COOKIE;
    }

    // When using a proxy, PoToken and visitor data are handled by the proxy.
    // Otherwise, auto-generate or use env vars.
    if (YT_PROXIES.length) {
      // PoToken handled by proxy — skip local generation
    } else {
      const envPoToken = process.env.YT_POTOKEN;
      const envVisitorData = process.env.YT_VISITOR_DATA;

      if (envPoToken) {
        innertubeOptions.po_token = envPoToken;
      }
      if (envVisitorData) {
        innertubeOptions.visitor_data = envVisitorData;
      }

      const autoPotoken =
        !envPoToken &&
        !envVisitorData &&
        clientType === "WEB" &&
        process.env.YT_POTOKEN !== "off";

      if (autoPotoken) {
        try {
          const tokenData = await getPoToken();
          innertubeOptions.po_token = tokenData.poToken;
          innertubeOptions.visitor_data = tokenData.visitorData;
        } catch (poErr) {
          const msg = poErr instanceof Error ? poErr.message : String(poErr);
          console.warn(
            "[YouTube] Auto PoToken generation failed, continuing without it:",
            msg,
          );
        }
      }
    }

    if (process.env.YT_DEBUG === "1") {
      console.debug(`[YouTube] Initializing Innertube (${clientType} client)`, {
        hasPoToken: !!innertubeOptions.po_token,
        hasCookie: !!innertubeOptions.cookie,
        hasVisitorData: !!innertubeOptions.visitor_data,
        useProxy: !!YT_PROXIES.length,
      });
    }

    const baseUserAgent = innertubeOptions.user_agent;
    const baseReferer = (
      process.env.ORIGIN || "https://www.youtube.com/"
    ).replace(/\/?$/, "/");

    innertubeOptions.fetch = async (input: any, init?: any) => {
      let urlStr = "";
      try {
        if (typeof input === "string") urlStr = input;
        else if (input && typeof input === "object" && "url" in input)
          urlStr = String((input as any).url);
        else urlStr = String(input);
      } catch {
        urlStr = String(input);
      }

      const body = typeof init?.body === "string" ? init.body : undefined;
      const throttleKey = getThrottleKey(urlStr, body);
      if (throttleKey) {
        const interval = getThrottleInterval(throttleKey);
        if (interval > 0) {
          const now = Date.now();
          const lastRun = throttleTimestamps.get(throttleKey) || 0;
          const elapsed = Math.max(0, now - lastRun);
          const wait = Math.max(0, interval - elapsed);
          // Set expiry so the cleanup interval can evict stale entries
          throttleTimestamps.set(throttleKey, now + wait + interval);
          if (wait > 0 && Number.isFinite(wait))
            await new Promise((r) => setTimeout(r, wait));
        }
      }

      // Route InnerTube API requests through the proxy when YT_PROXY is set.
      // Other URLs (thumbnails, player assets) are fetched directly.
      if (YT_PROXIES.length) {
        try {
          const targetUrl = new URL(urlStr);
          if (
            targetUrl.hostname === "www.youtube.com" &&
            targetUrl.pathname.startsWith("/youtubei/")
          ) {
            const proxyPath = targetUrl.pathname + targetUrl.search;

            const proxyHeaders: Record<string, string> = {
              "Content-Type": init?.headers
                ? "application/json"
                : "application/x-www-form-urlencoded",
            };
            if (YT_PROXY_TOKEN) {
              proxyHeaders["Authorization"] = `Bearer ${YT_PROXY_TOKEN}`;
            }

            const method = init?.method || (body ? "POST" : "GET");

            const requestVideoId = extractVideoId(body) ?? undefined;
            const startIndex = YT_PROXIES.indexOf(
              selectProxy(YT_PROXIES, requestVideoId)!,
            );
            const order =
              startIndex >= 0
                ? [
                    ...YT_PROXIES.slice(startIndex),
                    ...YT_PROXIES.slice(0, startIndex),
                  ]
                : YT_PROXIES;

            const now = Date.now();
            const available = order.filter(
              (p) => !proxyCooldownUntil[p] || now >= proxyCooldownUntil[p],
            );
            const tryOrder = available.length ? available : order;
            let lastError: Error | null = null;
            let lastStatus = 0;

            for (const proxy of tryOrder) {
              const proxyUrl = `${proxy}/api/youtube${proxyPath}`;

              if (process.env.YT_DEBUG === "1") {
                console.debug("[YouTube Proxy] Trying:", proxyUrl);
              }

              try {
                const proxyRes = await fetch(proxyUrl, {
                  method,
                  headers: proxyHeaders,
                  body,
                });

                if (proxyRes.status === 503) {
                  const errBody = await proxyRes.text().catch(() => "");
                  let retryAfter: number | undefined;
                  try {
                    const parsed = JSON.parse(errBody);
                    if (parsed.retryAfter) {
                      const ms = Number(parsed.retryAfter) * 1000;
                      if (Number.isFinite(ms) && ms > 0) retryAfter = ms;
                    }
                  } catch {}
                  console.error(
                    `[YouTube Proxy] ${proxy} returned 503 (YouTube blocked):`,
                    errBody.slice(0, 500),
                  );
                  markProxyFailed(proxy, retryAfter);
                  lastError = new Error(errBody || "503");
                  lastStatus = 503;
                  continue;
                }

                if (proxyRes.status >= 500) {
                  console.error(
                    `[YouTube Proxy] ${proxy} server error ${proxyRes.status}`,
                  );
                  markProxyFailed(proxy);
                  lastError = new Error(`Server error ${proxyRes.status}`);
                  lastStatus = proxyRes.status;
                  continue;
                }

                if (proxyRes.status === 403) {
                  markProxyFailed(proxy);
                  lastError = new Error(`Forbidden (403)`);
                  lastStatus = 403;
                  continue;
                }

                markProxyOk(proxy);
                return proxyRes;
              } catch (fetchErr: any) {
                console.error(
                  `[YouTube Proxy] ${proxy} request failed:`,
                  fetchErr instanceof Error
                    ? fetchErr.message
                    : String(fetchErr),
                );
                markProxyFailed(proxy);
                lastError =
                  fetchErr instanceof Error
                    ? fetchErr
                    : new Error(String(fetchErr));
                continue;
              }
            }

            console.error("[YouTube Proxy] All proxies failed");
            if (lastStatus === 403) {
              // Don't invalidate Innertube here — a 403 on one video
              // doesn't mean the session is broken for other videos.
              last403Time = Date.now();
            }
            return new Response(lastError?.message || "All proxies failed", {
              status: lastStatus || 502,
              headers: { "Content-Type": "application/json" },
            });
          }
        } catch (parseErr) {
          if (process.env.YT_DEBUG === "1")
            console.debug(
              "[YouTube Proxy] URL parse failed, falling back to direct fetch",
              parseErr,
            );
        }
      }

      // Direct fetch (no proxy, or non-YouTube URL like thumbnails)
      const headers: Record<string, string> = {};
      const orig = init?.headers;
      if (orig) {
        if (typeof (orig as any).entries === "function") {
          for (const [k, v] of (orig as any).entries()) {
            try {
              headers[k.toLowerCase()] = String(v);
            } catch {}
          }
        } else if (typeof (orig as any).forEach === "function") {
          try {
            (orig as any).forEach((v: any, k: string) => {
              try {
                headers[k.toLowerCase()] = String(v);
              } catch {}
            });
          } catch {}
        } else if (typeof orig === "object") {
          for (const k of Object.keys(orig)) {
            try {
              headers[k.toLowerCase()] = String((orig as any)[k]);
            } catch {}
          }
        }
      }

      if ("x-goog-visitor-id" in headers) {
        if (!headers["x-goog-visitor-id"]?.trim())
          delete headers["x-goog-visitor-id"];
      }

      if (!headers["user-agent"] && baseUserAgent)
        headers["user-agent"] = baseUserAgent;
      if (!headers["referer"]) headers["referer"] = baseReferer;
      if (!headers["accept-language"])
        headers["accept-language"] = "en-US,en;q=0.9";

      if (process.env.YT_DEBUG === "1") {
        const keys = Object.keys(headers);
        console.debug(
          "[YouTube] direct fetch:",
          urlStr.slice(0, 100),
          keys.join(", "),
        );
      }

      const merged = { ...(init || {}), headers };
      const res = await fetch(input, merged);

      if (res.status === 403) {
        last403Time = Date.now();
        console.error("[YouTube] Direct fetch 403 — invalidating session.", {
          url: urlStr,
        });
        invalidateInnertube();
      } else if (res.status >= 400) {
        console.error("[YouTube] Direct fetch non-OK", {
          url: urlStr,
          status: res.status,
        });
      }

      return res;
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
  redirectUri: string,
  options: { clientSecret?: string; codeVerifier?: string } = {},
) {
  const { clientSecret, codeVerifier } = options;
  const params = new URLSearchParams({
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  // Confidential (web) clients send the secret; public (desktop) clients use
  // PKCE and must NOT send a secret.
  if (clientSecret) params.set("client_secret", clientSecret);
  if (codeVerifier) params.set("code_verifier", codeVerifier);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
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
    const message = raw.replace(/^Google API error:\s*/i, "");
    throw new Error(`Failed to get YouTube user: ${message}`);
  }

  if (!data.items || data.items.length === 0) {
    const err = new Error("No YouTube channel found for this user");
    err.name = "NoChannelError";
    throw err;
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
  clientSecret?: string,
) {
  const params = new URLSearchParams({
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  // Public (desktop PKCE) clients refresh without a client secret.
  if (clientSecret) params.set("client_secret", clientSecret);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
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
