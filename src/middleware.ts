import { defineMiddleware } from "astro:middleware";
import { randomBytes } from "node:crypto";

/** Generate a cryptographically random base64 nonce for CSP. */
function generateNonce(): string {
  return randomBytes(16).toString("base64");
}

/**
 * Static security headers applied to every server response.
 *
 * Notes:
 * - X-Frame-Options is set to SAMEORIGIN to allow the app's own iframe embeds
 *   (Twitch / YouTube players are loaded inside the app, not the app itself
 *   being framed by a third party). Change to DENY if embeds are removed.
 */
const STATIC_HEADERS: Record<string, string> = {
  // Prevent browsers from MIME-sniffing the content-type
  "X-Content-Type-Options": "nosniff",
  // Allow the page to be framed only by the same origin
  "X-Frame-Options": "SAMEORIGIN",
  // Send no referrer at all. Google's image CDN (ggpht/googleusercontent)
  // returns HTTP 429 for requests carrying an insecure `http://localhost`
  // referer, which Chromium then blocks as ERR_BLOCKED_BY_ORB (the 429 body is
  // HTML, not an image). omitting the referer keeps YouTube avatars/emotes
  // loading on localhost and in the desktop app.
  "Referrer-Policy": "no-referrer",
  // Disable browser features this app does not use
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  // Enforce HTTPS for 2 years (production only, dev runs over plain HTTP)
  ...(import.meta.env.MODE !== "development"
    ? { "Strict-Transport-Security": "max-age=63072000; includeSubDomains" }
    : {}),
};

/**
 * Build the Content-Security-Policy header value.
 *
 * @param nonce - When provided (auth callback pages), only scripts carrying
 *   this nonce value may execute. No 'unsafe-inline'.  When omitted (all
 *   other pages), 'unsafe-inline' is included so that Astro's own framework
 *   hydration bootstrapping scripts (injected by client:load islands) are not
 *   blocked. Those scripts are static framework code, not user-controlled, so
 *   'unsafe-inline' is an acceptable trade-off on those routes.
 */
function buildCSP(nonce?: string): string {
  const scriptSrc = nonce
    ? `script-src 'self' 'nonce-${nonce}' https://embed.twitch.tv https://www.youtube.com`
    : "script-src 'self' 'unsafe-inline' https://embed.twitch.tv https://www.youtube.com";
  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    // Images: self, Twitch CDN, YouTube/Google CDNs, and third-party emote CDNs
    "img-src 'self' data: blob:" +
      " https://static-cdn.jtvnw.net" + // Twitch emotes & badges
      " https://*.jtvnw.net" + // Twitch profile pictures & clip thumbs (clips-media, vod-secure etc.)
      " https://twitch-static.net" + // channel offline-image placeholders / stream thumbnails
      " https://cdn.7tv.app" + // 7TV emotes
      " https://cdn.betterttv.net" + // BTTV emotes
      " https://cdn.frankerfacez.com" + // FFZ emotes
      " https://*.ggpht.com" + // YouTube avatars (yt1-yt4 subdomains)
      " https://*.googleusercontent.com" + // YouTube avatars & Google profile images (yt3/yt4, lh3-lh6, …)
      " https://*.ytimg.com" + // YouTube thumbnails (i, img, … subdomains)
      " https://fonts.gstatic.com" + // Google Noto Emoji images (YouTube chat standard emoji)
      " https://cdnjs.cloudflare.com" + // Twemoji SVG images for Unicode emoji rendering
      " https://cdn.prod.website-files.com" + // Ko-fi badge images
      " https://*.giphy.com", // Giphy GIF media CDN (media, media0-media4 subdomains)

    // API / XHR calls the client makes directly
    "connect-src 'self'" +
      " https://api.twitch.tv" + // Twitch Helix API
      " https://gql.twitch.tv" + // Twitch GQL (HLS token)
      " https://usher.ttvnw.net" + // Twitch HLS master playlist
      " https://*.ttvnw.net" + // Twitch HLS CDN segment subdomains
      " https://video.twitch.tv" + // Twitch video CDN
      " https://www.googleapis.com" + // YouTube Data API
      " https://youtube.googleapis.com" + // YouTube API (alt)
      " https://www.youtube.com" + // YouTube oEmbed (for Song Queue metadata)
      " https://recent-messages.robotty.de" + // Recent Twitch chat messages
      " https://7tv.io" + // 7TV emote API
      " https://api.betterttv.net" + // BTTV emote API
      " https://api.frankerfacez.com" + // FFZ emote API
      " https://events.7tv.io" + // 7TV EventAPI
      " wss://events.7tv.io" + // 7TV EventAPI (WebSocket alternate)
      " wss://eventsub.wss.twitch.tv" + // Twitch EventSub WebSocket
      " wss://pubsub-edge.twitch.tv" + // Twitch PubSub (channel points redemptions)
      " wss://irc-ws.chat.twitch.tv", // Twitch chat IRC WebSocket
    // Twitch and YouTube embedded players
    "frame-src https://player.twitch.tv https://embed.twitch.tv https://www.twitch.tv https://www.youtube.com https://www.youtube-nocookie.com",
    // Web workers (HLS.js may use one)
    "worker-src 'self' blob:",
    // Media (video/audio blobs from HLS.js)
    "media-src 'self' blob: data:",
    "font-src 'self' https://fonts.gstatic.com",
  ].join("; ");
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // Dev-only routes (e.g. the chat styling preview) must not be reachable in
  // production builds. `import.meta.env.DEV` is statically false there.
  if (
    (pathname === "/dev" || pathname.startsWith("/dev/")) &&
    !import.meta.env.DEV
  ) {
    return new Response("Not Found", { status: 404 });
  }

  // Generate a nonce only for auth callback pages. Those are plain API route
  // handlers where we write the entire HTML output and can stamp every <script>
  // with the nonce ourselves.  All other pages are rendered by Astro and include
  // framework-injected hydration scripts that we cannot add nonces to. They fall
  // back to 'unsafe-inline' which is acceptable because those scripts are static
  // framework code (not user-controlled data).
  const isAuthRoute = pathname.startsWith("/auth/");
  const nonce = isAuthRoute ? generateNonce() : undefined;
  context.locals.nonce = nonce ?? "";

  const response = await next();

  // Skip security headers on SSE streams. They are unnecessary for event-stream
  // responses and long CSP values can cause HTTP/2 framing issues on some proxies.
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    const allHeaders: Record<string, string> = {
      ...STATIC_HEADERS,
      "Content-Security-Policy": buildCSP(nonce),
    };

    for (const [key, value] of Object.entries(allHeaders)) {
      // Don't overwrite headers already set by a specific route handler
      if (!response.headers.has(key)) {
        response.headers.set(key, value);
      }
    }
  }
  return response;
});
