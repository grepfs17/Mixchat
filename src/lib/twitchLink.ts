/**
 * Twitch URL detection helpers shared by the Twitch and YouTube chat
 * renderers. Pure functions (no React / DOM dependencies) so they're trivial
 * to unit-test in Node.
 *
 * The goal is to recognise any of these URL shapes so the chat can swap the
 * raw link for a rich preview card:
 *
 *   https://twitch.tv/<channel>            → channel (live or offline)
 *   https://www.twitch.tv/<channel>        → channel
 *   https://m.twitch.tv/<channel>          → channel
 *   https://twitch.tv/videos/<videoId>     → VOD
 *   https://twitch.tv/<channel>/clip/<slug>→ clip
 *   https://clips.twitch.tv/<slug>         → clip (short form)
 *
 * Anything else is `null` (non-Twitch, handled by the generic link renderer
 * inside parseMessageWithEmotes).
 */

export type TwitchLinkKind = "channel" | "video" | "clip";

export interface TwitchLinkParts {
  kind: TwitchLinkKind;
  /** Lowercase channel login. Always populated for `channel`/`clip` paths. Absent for `clips.twitch.tv` short clips until the API call resolves it. */
  channel?: string;
  /** Numeric VOD id (`twitch.tv/videos/<id>` style). */
  videoId?: string;
  /** Clip slug: `<channel>/clip/<slug>` style OR `clips.twitch.tv/<slug>` short form. */
  clipSlug?: string;
  /** Original URL as the user typed it (after light normalisation). */
  url: string;
  /** Canonical display href to use on the preview card anchor. */
  href: string;
}

/**
 * Twitch URL regex (case-insensitive).
 * - Optional scheme (http:// https://)
 * - Optional www. / m. / clips. subdomain
 * - twitch.tv host
 * - Path of `/<segment>(/<segment>)*` characters: letters, digits, `_`, `-`, `.`
 *
 * The regex stops at common sentence terminators so a URL followed by a
 * period or comma isn't matched with the punctuation attached. Trailing
 * punctuation is trimmed separately in `parseTwitchUrl`.
 */
const TWITCH_HOST = "(?:www\\.|m\\.|clips\\.)?twitch\\.tv";
const TWITCH_PATH = "(?:\\/[\\w.-]+)+";
export const TWITCH_URL_REGEX = new RegExp(
  `\\b(?:https?:\\/\\/)?${TWITCH_HOST}${TWITCH_PATH}`,
  "gi",
);

const RESERVED_TWITCH_PATHS = new Set([
  "settings",
  "directory",
  "p",
  "downloads",
  "turbo",
  "about",
  "jobs",
  "press",
  "security",
  "legal",
  "parentalcontrols",
  "accessibility",
  "store",
  "blog",
  "home",
  "login",
  "signup",
]);

/**
 * Classify a Twitch URL into { kind, channel, videoId, clipSlug }.
 * Returns null for non-Twitch URLs, URLs missing required segments, or
 * reserved-path URLs we shouldn't try to preview (settings, directory…).
 */
export function parseTwitchUrl(input: string): TwitchLinkParts | null {
  if (!input) return null;
  // Trim trailing punctuation that often trails URLs in sentences
  let trimmed = input.trim().replace(/[)\].,;:!?]*$/, "");

  const hadScheme = /^https?:\/\//i.test(trimmed);
  const fullUrl = hadScheme ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(fullUrl);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (
    host !== "twitch.tv" &&
    host !== "clips.twitch.tv" &&
    host !== "m.twitch.tv"
  ) {
    return null;
  }

  const pathSegments = parsed.pathname
    .split("/")
    .map((p) => decodeURIComponent(p))
    .filter((p) => p.length > 0);

  if (host === "clips.twitch.tv") {
    const slug = pathSegments[0];
    if (!slug) return null;
    return {
      kind: "clip",
      clipSlug: slug,
      url: input,
      href: `https://clips.twitch.tv/${encodeURIComponent(slug)}`,
    };
  }

  if (pathSegments.length === 0) {
    return null;
  }

  const isVodPath = pathSegments[0].toLowerCase() === "videos";
  const isClipPath = pathSegments[1]?.toLowerCase() === "clip";

  if (isVodPath && pathSegments.length >= 2) {
    const videoId = pathSegments[1];
    if (!/^\d+$/.test(videoId)) return null;
    return {
      kind: "video",
      videoId,
      url: input,
      href: `https://www.twitch.tv/videos/${videoId}`,
    };
  }

  if (isClipPath && pathSegments.length >= 3) {
    const channel = pathSegments[0].toLowerCase();
    const slug = pathSegments.slice(2).join("/");
    if (RESERVED_TWITCH_PATHS.has(channel) || !/^[\w-]+/.test(channel)) {
      return null;
    }
    return {
      kind: "clip",
      channel,
      clipSlug: slug,
      url: input,
      href: `https://www.twitch.tv/${encodeURIComponent(
        channel,
      )}/clip/${encodeURIComponent(slug)}`,
    };
  }

  if (pathSegments.length === 1) {
    const channel = pathSegments[0].toLowerCase();
    if (RESERVED_TWITCH_PATHS.has(channel)) return null;
    if (!/^[a-z0-9_][a-z0-9_]*$/i.test(channel)) return null;
    return {
      kind: "channel",
      channel,
      url: input,
      href: `https://www.twitch.tv/${encodeURIComponent(channel)}`,
    };
  }

  return null;
}

export function isTwitchUrl(input: string): boolean {
  return parseTwitchUrl(input) !== null;
}

export interface TwitchTextSegment {
  type: "text";
  /** Plain text with Twitch URLs removed, safe for HTML innerText use. */
  text: string;
  /** Start offset of this segment within the original input (inclusive). */
  start: number;
  /** End offset of this segment within the original input (exclusive). */
  end: number;
}

export interface TwitchLinkSegment {
  type: "twitch-link";
  url: string;
  parts: TwitchLinkParts;
  /** Start offset of this URL within the original input (inclusive). */
  start: number;
  /** End offset of this URL within the original input (exclusive). */
  end: number;
}

export type TwitchSplitSegment = TwitchTextSegment | TwitchLinkSegment;

/**
 * Walk `text` linearly and split it into alternating text/link segments
 * wherever a Twitch URL is detected. Used by the chat renderers to mount a
 * preview card inline where a URL would otherwise render as a tiny `<a>`.
 *
 * Non-Twitch URLs are preserved verbatim inside `text` segments. Those
 * still go through the generic link renderer (linkifyUrl) for clickable
 * styling.
 */
export function splitByTwitchLinks(text: string): TwitchSplitSegment[] {
  if (!text) return [{ type: "text", text: "", start: 0, end: 0 }];

  const segments: TwitchSplitSegment[] = [];
  const regex = new RegExp(TWITCH_URL_REGEX.source, TWITCH_URL_REGEX.flags);
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    const parts = parseTwitchUrl(match[0]);
    if (!parts) {
      // Skip: not actually a parseable Twitch URL (e.g. reserved path).
      continue;
    }

    if (start > cursor) {
      segments.push({
        type: "text",
        text: text.slice(cursor, start),
        start: cursor,
        end: start,
      });
    }
    segments.push({ type: "twitch-link", url: match[0], parts, start, end });
    cursor = end;
  }

  if (cursor < text.length) {
    segments.push({
      type: "text",
      text: text.slice(cursor),
      start: cursor,
      end: text.length,
    });
  }

  // Always emit at least one segment so callers don't need a special case.
  if (segments.length === 0) {
    segments.push({ type: "text", text, start: 0, end: text.length });
  }
  return segments;
}

/**
 * Filter a Twitch IRC emote-offset map (`emoteId -> ["start-end", ...]`)
 * down to emotes that are *entirely* contained within the absolute range
 * `[segStart, segEnd)`, and re-base each surviving position so it lines up
 * with the substring `text.slice(segStart, segEnd)` (which is what the
 * chat renderer feeds back into `parseMessageWithEmotes`).
 *
 * `emotes` may be undefined, in which case this returns undefined. Empty
 * filtered results also return undefined so `parseMessageWithEmotes`
 * skips the per-emote branch entirely.
 */
export function rebaseEmotesForSegment(
  emotes: Record<string, string[]> | undefined,
  segStart: number,
  segEnd: number,
): Record<string, string[]> | undefined {
  if (!emotes) return undefined;
  const result: Record<string, string[]> = {};
  for (const [emoteId, positions] of Object.entries(emotes)) {
    const kept: string[] = [];
    for (const pos of positions || []) {
      const [s, e] = pos.split("-").map(Number);
      if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
      if (s >= segStart && e < segEnd) {
        kept.push(`${s - segStart}-${e - segStart}`);
      }
    }
    if (kept.length) result[emoteId] = kept;
  }
  return Object.keys(result).length ? result : undefined;
}
