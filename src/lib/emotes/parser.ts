import DOMPurify, { type Config as DOMPurifyConfig } from "dompurify";
import {
  emotes7tv,
  emotesBttv,
  emotesFfz,
  emotesTwitch,
  emoteAuthors,
  emoteMapVersion,
  parseCache,
  MAX_PARSE_CACHE,
} from "./state";
import {
  createEmoteImg,
  createZeroWidthEmoteImg,
  escapeHtml,
  getEmoteUrl,
  isZeroWidthUrl,
  linkifyUrl,
  renderUnicodeEmojis,
} from "./utils";

/**
 * DOMPurify configuration — only the elements and attributes our emote
 * renderer ever emits are permitted. Everything else is stripped.
 */
const DOMPURIFY_CONFIG: DOMPurifyConfig = {
  ALLOWED_TAGS: ["img", "a", "strong", "span"],
  ALLOWED_ATTR: [
    // <img>
    "src",
    "alt",
    "title",
    "class",
    "style",
    "loading",
    "draggable",
    "data-emote-name",
    "data-emote-source",
    "data-emote-author",
    "data-tooltip-url",
    // <a>
    "href",
    "target",
    "rel",
  ],
  ALLOW_DATA_ATTR: false,
  FORCE_BODY: false,
};

const MENTION_STRONG_RE = /<strong>@([^<]*)<\/strong>/g;
const SAFE_CSS_COLOR_RE =
  /^(#[0-9a-fA-F]{3,8}|(?:rgb|hsl)a?\([^)"';]*\))$/;

function isSafeCssColor(color: string): boolean {
  return SAFE_CSS_COLOR_RE.test(color.trim());
}

/**
 * Apply each mentioned user's chat colour to the inline `@mention` markup
 * emitted by the emote parser. Runs on already-sanitised HTML, so the colour
 * is strictly validated before being injected into a `style` attribute.
 */
export function applyMentionColors(
  html: string,
  mentionColors?: Map<string, string>,
): string {
  if (!mentionColors || mentionColors.size === 0 || !html.includes("@")) {
    return html;
  }
  return html.replace(MENTION_STRONG_RE, (match, rawName: string) => {
    const name = rawName.replace(/[^\w]+$/, "").toLowerCase();
    if (!name) return match;
    const color = mentionColors.get(name);
    if (!color || !isSafeCssColor(color)) return match;
    return `<strong style="color:${color}">@${rawName}</strong>`;
  });
}

/**
 * Parse message text and replace emote codes with HTML image tags
 * @param text - The message text
 * @param twitchEmotes - Twitch emote data from message tags (emoteId -> positions array)
 * @param opts - Render hints. `gigantified` true renders every emote in the
 *   message at the "Gigantify an Emote" power-up size (Twitch, 100 bits).
 *   `mentionColors` maps a lowercased username to the colour it should be
 *   rendered with when mentioned via `@username`.
 */
export function parseMessageWithEmotes(
  text: string,
  twitchEmotes?: Record<string, string[]>,
  opts?: { gigantified?: boolean; mentionColors?: Map<string, string> },
): string {
  const gigantified = Boolean(opts?.gigantified);
  const cacheKey =
    twitchEmotes && Object.keys(twitchEmotes).length > 0
      ? `v${emoteMapVersion}|g${gigantified ? 1 : 0}|${text}|${JSON.stringify(twitchEmotes)}`
      : `v${emoteMapVersion}|g${gigantified ? 1 : 0}|${text}`;

  const cached = parseCache.get(cacheKey);
  if (cached !== undefined) {
    return applyMentionColors(cached, opts?.mentionColors);
  }
  let raw: string;

  if (twitchEmotes && Object.keys(twitchEmotes).length > 0) {
    const replacements: Array<{ start: number; end: number; html: string }> =
      [];

    Object.entries(twitchEmotes).forEach(([emoteId, positions]) => {
      positions.forEach((pos) => {
        const [start, end] = pos.split("-").map(Number);
        const emoteName = text.substring(start, end + 1);
        const emoteUrl = `https://static-cdn.jtvnw.net/emoticons/v2/${emoteId}/default/dark/2.0`;
        replacements.push({
          start,
          end: end + 1,
          html: createEmoteImg(
            emoteUrl,
            emoteName,
            "Twitch",
            gigantified,
            emoteAuthors[emoteName],
          ),
        });
      });
    });

    replacements.sort((a, b) => b.start - a.start);

    let result = text;
    replacements.forEach(({ start, end, html }) => {
      result = result.substring(0, start) + html + result.substring(end);
    });

    raw = parseThirdPartyEmotes(result);
  } else {
    raw = parseThirdPartyEmotes(text);
  }

  // Final sanitization pass — strip anything outside the known-safe allowlist.
  // This is the last line of defence against XSS from malformed emote names,
  // crafted CDN responses, or future changes to the HTML-building helpers.
  const result = DOMPurify.sanitize(raw, DOMPURIFY_CONFIG) as unknown as string;
  if (parseCache.size >= MAX_PARSE_CACHE) {
    const firstKey = parseCache.keys().next().value;
    if (firstKey !== undefined) parseCache.delete(firstKey);
  }
  parseCache.set(cacheKey, result);
  return applyMentionColors(result, opts?.mentionColors);
}

/**
 * Look up a word across all emote providers (7TV > BTTV > FFZ > Twitch).
 * Returns the emote URL and provider name, or null if not found.
 */
function lookupEmote(
  word: string,
): { url: string; provider: string; author?: string } | null {
  if (emotes7tv[word])
    return {
      url: emotes7tv[word],
      provider: "7TV",
      author: emoteAuthors[word],
    };
  if (emotesBttv[word])
    return {
      url: emotesBttv[word],
      provider: "BTTV",
      author: emoteAuthors[word],
    };
  if (emotesFfz[word])
    return {
      url: emotesFfz[word],
      provider: "FFZ",
      author: emoteAuthors[word],
    };
  if (emotesTwitch[word])
    return {
      url: emotesTwitch[word],
      provider: "Twitch",
      author: emoteAuthors[word],
    };
  return null;
}

/**
 * Parse third-party emotes and @mentions in text.
 *
 * NOTE: The Twitch "Gigantify an Emote" power-up only applies to Twitch
 * emotes (those resolved through the IRC `emotes` tag in
 * parseMessageWithEmotes). 7TV / BTTV / FFZ emotes and manually-typed
 * Twitch emote names are always rendered at the standard 2em size here.
 */
function parseThirdPartyEmotes(text: string): string {
  // Split by HTML tags to avoid breaking emote img tags
  // We use a capture group so the delimiter (img tag) is included in the result array
  const parts = text.split(/(<img[^>]*>)/);

  const parsedParts: string[] = [];
  let i = 0;

  while (i < parts.length) {
    const part = parts[i];

    // Skip if it's already an HTML tag (our emote)
    if (part.startsWith("<img")) {
      // Look ahead for 7TV zero-width overlays in the next text segment
      const overlays: string[] = [];
      if (i + 1 < parts.length && !parts[i + 1].startsWith("<img")) {
        const nextText = parts[i + 1];
        const words = nextText.split(" ");
        let j = 0;
        // Skip leading empty word if text starts with space
        if (words[j] === "") j++;

        while (j < words.length) {
          const word = words[j];
          if (word === "") break;
          const nextUrl = emotes7tv[word];
          if (nextUrl && isZeroWidthUrl(nextUrl)) {
            overlays.push(
              createZeroWidthEmoteImg(
                getEmoteUrl(nextUrl),
                word,
                "7TV",
                emoteAuthors[word],
              ),
            );
            j++;
          } else {
            break;
          }
        }

        if (overlays.length > 0) {
          // Wrap the <img> with overlays
          parsedParts.push(
            `<span class="emote-overlay-container">${part}${overlays.join("")}</span>`,
          );
          // Remove consumed overlay words from the next text segment
          const remainingWords = words.slice(j);
          parts[i + 1] = remainingWords.join(" ");
        } else {
          parsedParts.push(part);
        }
      } else {
        parsedParts.push(part);
      }
      i++;
      continue;
    }

    // Process words with a while-loop so we can do lookahead for 7TV zero-width
    // (overlay) emotes that must be grouped with the preceding base emote.
    const words = part.split(" ");
    const output: string[] = [];
    let wi = 0;
    while (wi < words.length) {
      const word = words[wi];

      // Check for URLs first
      const linkified = linkifyUrl(word);
      if (linkified) {
        output.push(linkified);
        wi++;
        continue;
      }

      // Check for @mention
      if (word.startsWith("@")) {
        output.push(`<strong>${escapeHtml(word)}</strong>`);
        wi++;
        continue;
      }

      // Unified emote lookup across all providers
      const match = lookupEmote(word);
      if (match) {
        if (isZeroWidthUrl(match.url)) {
          // Orphan zero-width emote (no preceding base) — render as normal emote
          output.push(
            createEmoteImg(
              getEmoteUrl(match.url),
              word,
              match.provider,
              false,
              match.author,
            ),
          );
          wi++;
        } else {
          // Any emote from any provider can be a base.
          // Look ahead for 7TV zero-width overlays only.
          const baseHtml = createEmoteImg(
            match.url,
            word,
            match.provider,
            false,
            match.author,
          );
          const overlays: string[] = [];
          let j = wi + 1;
          while (j < words.length) {
            const nextWord = words[j];
            const nextUrl = emotes7tv[nextWord];
            if (nextUrl && isZeroWidthUrl(nextUrl)) {
              overlays.push(
                createZeroWidthEmoteImg(
                  getEmoteUrl(nextUrl),
                  nextWord,
                  "7TV",
                  emoteAuthors[nextWord],
                ),
              );
              j++;
            } else {
              break;
            }
          }
          if (overlays.length > 0) {
            output.push(
              `<span class="emote-overlay-container">${baseHtml}${overlays.join("")}</span>`,
            );
            wi = j; // skip consumed zero-width words
          } else {
            output.push(baseHtml);
            wi++;
          }
        }
        continue;
      }

      // Plain text — escape HTML then replace Unicode emoji with Twemoji images
      output.push(renderUnicodeEmojis(escapeHtml(word)));
      wi++;
    }

    parsedParts.push(output.join(" "));
    i++;
  }

  return parsedParts.join("");
}

/**
 * Look up a word in the third-party (non-Twitch) emote providers only:
 * 7TV, then BTTV, then FFZ. Returns the emote URL and provider name, or
 * null if the word is not a known third-party emote name.
 *
 * Twitch emotes are intentionally excluded — they're irrelevant on YouTube
 * chat and would cause false matches against any channel-specific sub emote.
 */
function lookupThirdPartyEmote(
  word: string,
):
  | { url: string; provider: "7TV" | "BTTV" | "FFZ"; author?: string }
  | null {
  if (emotes7tv[word])
    return {
      url: emotes7tv[word],
      provider: "7TV",
      author: emoteAuthors[word],
    };
  if (emotesBttv[word])
    return {
      url: emotesBttv[word],
      provider: "BTTV",
      author: emoteAuthors[word],
    };
  if (emotesFfz[word])
    return {
      url: emotesFfz[word],
      provider: "FFZ",
      author: emoteAuthors[word],
    };
  return null;
}

export interface YoutubeEmoteToken {
  type: "text" | "emote";
  text?: string;
  /** Emote URL (without the ZW: prefix) for `type === "emote"`. */
  url?: string;
  /** Emote name. */
  name?: string;
  /** Provider name ("7TV" | "BTTV" | "FFZ"). */
  provider?: "7TV" | "BTTV" | "FFZ";
  /** Emote author, if known. */
  author?: string;
  /**
   * 7TV zero-width overlays that follow the base emote and should be stacked
   * on top of it. Empty for non-base tokens. Each entry contains the overlay
   * name and resolved CDN URL (no ZW: prefix).
   */
  overlays?: { name: string; url: string }[];
}

/**
 * Tokenize a YouTube message text part into a flat list of text and emote
 * tokens, applying 7TV zero-width overlay grouping. The same scope as the
 * Twitch emote set is used (whatever is currently loaded in
 * `emotes7tv` / `emotesBttv` / `emotesFfz`), matching how Twitch chat resolves
 * third-party emotes. Disabled emotes are passed through as plain text.
 *
 * Pure function with no React/DOM dependencies so it can be tested in Node.
 */
export function tokenizeThirdPartyEmotesForYoutube(
  text: string,
  disabledSet?: Set<string>,
): YoutubeEmoteToken[] {
  if (!text) return [];
  const tokens: YoutubeEmoteToken[] = [];
  const words = text.split(" ");
  let wi = 0;
  while (wi < words.length) {
    const word = words[wi];
    if (word === "") {
      wi++;
      continue;
    }

    if (disabledSet?.has(word)) {
      tokens.push({ type: "text", text: word });
      wi++;
      continue;
    }

    const match = lookupThirdPartyEmote(word);
    if (match) {
      if (isZeroWidthUrl(match.url)) {
        tokens.push({
          type: "emote",
          url: getEmoteUrl(match.url),
          name: word,
          provider: match.provider,
          author: match.author,
        });
        wi++;
        continue;
      }
      const overlays: { name: string; url: string }[] = [];
      let j = wi + 1;
      while (j < words.length) {
        const nextWord = words[j];
        if (disabledSet?.has(nextWord)) break;
        const nextUrl = emotes7tv[nextWord];
        if (nextUrl && isZeroWidthUrl(nextUrl)) {
          overlays.push({ name: nextWord, url: getEmoteUrl(nextUrl) });
          j++;
        } else {
          break;
        }
      }
      tokens.push({
        type: "emote",
        url: getEmoteUrl(match.url),
        name: word,
        provider: match.provider,
        author: match.author,
        overlays: overlays.length ? overlays : undefined,
      });
      wi = j;
      continue;
    }

    tokens.push({ type: "text", text: word });
    wi++;
  }
  return tokens;
}
