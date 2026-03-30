import { defineMiddleware } from "astro:middleware";

/**
 * Security response headers applied to every server response.
 *
 * Notes:
 * - Content-Security-Policy is intentionally permissive on script-src because
 *   the OAuth callback pages use inline <script> blocks. Harden further with
 *   nonces if those pages are refactored.
 * - X-Frame-Options is set to SAMEORIGIN to allow the app's own iframe embeds
 *   (Twitch / YouTube players are loaded inside the app, not the app itself
 *   being framed by a third party). Change to DENY if embeds are removed.
 */
const SECURITY_HEADERS: Record<string, string> = {
  // Prevent browsers from MIME-sniffing the content-type
  "X-Content-Type-Options": "nosniff",
  // Allow the page to be framed only by the same origin
  "X-Frame-Options": "SAMEORIGIN",
  // Limit referrer information sent to third parties
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Disable browser features this app does not use
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  // Basic CSP — restricts where scripts, styles, and connections can go
  "Content-Security-Policy": [
    "default-src 'self'",
    // 'unsafe-inline' required for inline <script> in OAuth callback pages
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    // Images: self, Twitch CDN, YouTube/Google CDNs, and third-party emote CDNs
    "img-src 'self' data: blob:" +
      " https://static-cdn.jtvnw.net" + // Twitch emotes & badges
      " https://cdn.7tv.app" + // 7TV emotes
      " https://cdn.betterttv.net" + // BTTV emotes
      " https://cdn.frankerfacez.com" + // FFZ emotes
      " https://*.ggpht.com" + // YouTube avatars (yt1–ytN subdomains)
      " https://yt3.googleusercontent.com" + // YouTube avatars (alt)
      " https://i.ytimg.com" + // YouTube thumbnails
      " https://lh3.googleusercontent.com", // Google profile images
    // API / XHR calls the client makes directly
    "connect-src 'self'" +
      " https://api.twitch.tv" + // Twitch Helix API (Twurple)
      " https://id.twitch.tv" + // Twitch OAuth validate
      " https://www.googleapis.com" + // YouTube Data API
      " https://youtube.googleapis.com" + // YouTube API (alt)
      " https://recent-messages.robotty.de" + // Recent Twitch chat messages
      " https://7tv.io" + // 7TV emote API
      " https://api.betterttv.net" + // BTTV emote API
      " https://api.frankerfacez.com" + // FFZ emote API
      " wss://irc-ws.chat.twitch.tv", // Twitch chat WebSocket
    // Twitch and YouTube embedded players
    "frame-src https://player.twitch.tv https://embed.twitch.tv https://www.twitch.tv https://www.youtube.com https://www.youtube-nocookie.com",
    // Web workers (HLS.js may use one)
    "worker-src 'self' blob:",
    // Media (video/audio blobs from HLS.js)
    "media-src 'self' blob:",
    "font-src 'self'",
  ].join("; "),
};

export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    // Don't overwrite headers already set by a specific route handler
    if (!response.headers.has(key)) {
      response.headers.set(key, value);
    }
  }
  return response;
});
