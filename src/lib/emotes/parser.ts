import DOMPurify, { type Config as DOMPurifyConfig } from "dompurify";
import {
  emotes7tv,
  emotesBttv,
  emotesFfz,
  emotesTwitch,
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
    "data-emote-name",
    "data-emote-source",
    "data-tooltip-url",
    // <a>
    "href",
    "target",
    "rel",
  ],
  ALLOW_DATA_ATTR: false,
  FORCE_BODY: false,
};

/**
 * Parse message text and replace emote codes with HTML image tags
 * @param text - The message text
 * @param twitchEmotes - Twitch emote data from message tags (emoteId -> positions array)
 * @param opts - Render hints. `gigantified` true renders every emote in the
 *   message at the "Gigantify an Emote" power-up size (Twitch, 100 bits).
 */
export function parseMessageWithEmotes(
  text: string,
  twitchEmotes?: Record<string, string[]>,
  opts?: { gigantified?: boolean },
): string {
  const gigantified = Boolean(opts?.gigantified);
  const cacheKey =
    twitchEmotes && Object.keys(twitchEmotes).length > 0
      ? `v${emoteMapVersion}|g${gigantified ? 1 : 0}|${text}|${JSON.stringify(twitchEmotes)}`
      : `v${emoteMapVersion}|g${gigantified ? 1 : 0}|${text}`;

  const cached = parseCache.get(cacheKey);
  if (cached !== undefined) return cached;
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
          html: createEmoteImg(emoteUrl, emoteName, "Twitch", gigantified),
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
  return result;
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

  const parsedParts = parts.map((part) => {
    // Skip if it's already an HTML tag (our emote)
    if (part.startsWith("<img")) {
      return part;
    }

    // Process words with a while-loop so we can do lookahead for 7TV zero-width
    // (overlay) emotes that must be grouped with the preceding base emote.
    const words = part.split(" ");
    const output: string[] = [];
    let i = 0;
    while (i < words.length) {
      const word = words[i];

      // Check for URLs first
      const linkified = linkifyUrl(word);
      if (linkified) {
        output.push(linkified);
        i++;
        continue;
      }

      // Check for @mention
      if (word.startsWith("@")) {
        output.push(`<strong>${escapeHtml(word)}</strong>`);
        i++;
        continue;
      }

      // Check Twitch native emotes (from cache map, manually typed)
      if (emotesTwitch[word]) {
        output.push(createEmoteImg(emotesTwitch[word], word, "Twitch"));
        i++;
        continue;
      }

      // Check 7TV — with zero-width overlay support
      if (emotes7tv[word]) {
        const url = emotes7tv[word];
        if (isZeroWidthUrl(url)) {
          // Orphan zero-width emote (no preceding base) — render normally
          output.push(createEmoteImg(getEmoteUrl(url), word, "7TV"));
          i++;
        } else {
          // Regular 7TV emote: look ahead for consecutive zero-width emotes
          const baseHtml = createEmoteImg(url, word, "7TV");
          const overlays: string[] = [];
          let j = i + 1;
          while (j < words.length) {
            const nextWord = words[j];
            const nextUrl = emotes7tv[nextWord];
            if (nextUrl && isZeroWidthUrl(nextUrl)) {
              overlays.push(
                createZeroWidthEmoteImg(getEmoteUrl(nextUrl), nextWord),
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
            i = j; // skip consumed zero-width words
          } else {
            output.push(baseHtml);
            i++;
          }
        }
        continue;
      }

      // Check BTTV
      if (emotesBttv[word]) {
        output.push(createEmoteImg(emotesBttv[word], word, "BTTV"));
        i++;
        continue;
      }

      // Check FFZ
      if (emotesFfz[word]) {
        output.push(createEmoteImg(emotesFfz[word], word, "FFZ"));
        i++;
        continue;
      }

      // Plain text
      output.push(escapeHtml(word));
      i++;
    }

    return output.join(" ");
  });

  return parsedParts.join("");
}
