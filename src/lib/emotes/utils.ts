export const EMOTE_SIZE = "2";

/** URL prefix that marks a 7TV emote as zero-width (overlay). */
const ZW_EMOTE_PREFIX = "ZW:";
/** 7TV emote flag bit for zero-width/overlay emotes (1 << 8 = 256). */
export const ZERO_WIDTH_FLAG = 1 << 8;

/** Returns true if the stored emote URL carries the zero-width marker. */
export function isZeroWidthUrl(url: string): boolean {
  return url.startsWith(ZW_EMOTE_PREFIX);
}

/** Strips the zero-width prefix from a stored URL, returning the real CDN URL. */
export function getEmoteUrl(url: string): string {
  return url.startsWith(ZW_EMOTE_PREFIX)
    ? url.slice(ZW_EMOTE_PREFIX.length)
    : url;
}

/**
 * fetch() wrapper that aborts the request after `timeoutMs` so a hung upstream
 * (e.g. 7TV/BTTV/FFZ returning a delayed 5xx) cannot stall callers. On abort
 * the call rejects with a DOMException("aborted") which existing try/catch
 * blocks already treat as a normal failure.
 */
export async function fetchWithTimeout(
  url: string,
  timeoutMs: number = 8000,
  init?: RequestInit,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function replaceSize(url: string): string {
  const parts = url.split("/");
  // Replace the first number in the last part with '4'
  // This works for: 1x.webp -> 4x.webp, 1.0 -> 4.0, 2 -> 4, etc.

  if (url.includes("betterttv")) {
    parts[parts.length - 1] = parts[parts.length - 1].replace(/\d+/, "3");
  } else {
    parts[parts.length - 1] = parts[parts.length - 1].replace(/\d+/, "4");
  }
  return parts.join("/");
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Check if a word is a URL and convert to clickable link
 */
export function linkifyUrl(word: string): string {
  // Only match http(s) or www-prefixed URLs
  const urlPattern = /^(https?:\/\/|www\.)[^\s]+$/i;

  if (urlPattern.test(word)) {
    let url = word;
    if (word.toLowerCase().startsWith("www.")) {
      url = "https://" + word;
    }

    // Explicitly block dangerous schemes even if the regex above is ever relaxed.
    // URL objects normalise the protocol to lowercase, making detection reliable.
    try {
      const parsed = new URL(url);
      const scheme = parsed.protocol; // e.g. "javascript:", "data:", "https:"
      if (scheme !== "https:" && scheme !== "http:") {
        return escapeHtml(word); // render as plain text
      }
    } catch {
      return escapeHtml(word); // invalid URL — render as plain text
    }

    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="color: #6366f1; text-decoration: underline; cursor: pointer;">${escapeHtml(word)}</a>`;
  }

  return "";
}

/**
 * Create an optimized emote image HTML tag
 */
export function createEmoteImg(
  emoteUrl: string,
  emoteName: string,
  source: string = "Twitch",
  gigantified: boolean = false,
  author?: string,
): string {
  if (typeof emoteUrl !== "string") return escapeHtml(emoteName);
  // Convert any quality URL to 4x quality for tooltip (highest resolution)
  let highQualityUrl = emoteUrl;
  const splitedUrlSize = emoteUrl.split("/").pop();
  if (
    splitedUrlSize &&
    (splitedUrlSize.includes("2") || splitedUrlSize.includes("1"))
  ) {
    highQualityUrl = replaceSize(emoteUrl);
  }
  // For the Gigantify power-up, render the highest-resolution source so the
  // emote stays sharp at 7em; otherwise the 2x URL would look pixelated.
  const src = gigantified ? highQualityUrl : emoteUrl;
  const className = gigantified
    ? "chat-emote chat-emote--gigantified"
    : "chat-emote";
  const authorAttr = author ? ` data-emote-author="${escapeHtml(author)}"` : "";
  return `<img src="${src}" alt="${escapeHtml(emoteName)}" title="${escapeHtml(emoteName)}" data-tooltip-url="${highQualityUrl}" data-emote-name="${escapeHtml(emoteName)}" data-emote-source="${escapeHtml(source)}"${authorAttr} class="${className}" style="height: 2em; vertical-align: middle; margin: 0 2px; cursor: pointer;" />`;
}

/**
 * Create an overlay (zero-width) emote wrapped in a positioning span.
 * The span is absolutely centred over the base emote by CSS.
 */
export function createZeroWidthEmoteImg(
  emoteUrl: string,
  emoteName: string,
  source: string = "7TV",
  author?: string,
): string {
  if (typeof emoteUrl !== "string") return escapeHtml(emoteName);
  let highQualityUrl = emoteUrl;
  const splitedUrlSize = emoteUrl.split("/").pop();
  if (
    splitedUrlSize &&
    (splitedUrlSize.includes("2") || splitedUrlSize.includes("1"))
  ) {
    highQualityUrl = replaceSize(emoteUrl);
  }
  const authorAttr = author ? ` data-emote-author="${escapeHtml(author)}"` : "";
  return `<span class="emote-overlay"><img src="${emoteUrl}" alt="${escapeHtml(emoteName)}" title="${escapeHtml(emoteName)}" data-tooltip-url="${highQualityUrl}" data-emote-name="${escapeHtml(emoteName)}" data-emote-source="${escapeHtml(source)}"${authorAttr} class="chat-emote" style="height: 2em; cursor: pointer;" /></span>`;
}
