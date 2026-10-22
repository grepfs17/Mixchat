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
  applyEmoteEffects,
  createEmoteImg,
  createZeroWidthEmoteImg,
  escapeHtml,
  getEmoteUrl,
  isZeroWidthUrl,
  linkifyUrl,
  renderUnicodeEmojis,
} from "./utils";
import {
  FFZ_EFFECTS,
  normalizeEffects,
  parseBttvPrefixes,
  type EmoteEffect,
} from "./modifiers";

/**
 * DOMPurify configuration: only the elements and attributes our emote
 * renderer ever emits are permitted. Everything else is stripped.
 */
const DOMPURIFY_CONFIG: DOMPurifyConfig = {
  ALLOWED_TAGS: ["img", "a", "strong", "span"],
  ALLOWED_ATTR: [
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
 * Apply each mentioned user's chat colour to the inline `@mention` markup.
 * Runs on already-sanitised HTML, so the colour is strictly validated before
 * being injected into a `style` attribute.
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
 * Parse message text, replacing emote codes with HTML image tags.
 * @param twitchEmotes - Twitch emote data from message tags (emoteId -> positions array)
 * @param opts - `gigantified` renders every emote at the Gigantify power-up
 *   size (Twitch, 100 bits). `mentionColors` maps lowercased usernames to
 *   the colour they should render with when mentioned.
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

  // Final sanitization pass: strip anything outside the known-safe allowlist.
  // Last line of defence against XSS from malformed emote names or CDN data.
  const result = DOMPurify.sanitize(raw, DOMPURIFY_CONFIG) as unknown as string;
  if (parseCache.size >= MAX_PARSE_CACHE) {
    const firstKey = parseCache.keys().next().value;
    if (firstKey !== undefined) parseCache.delete(firstKey);
  }
  parseCache.set(cacheKey, result);
  return applyMentionColors(result, opts?.mentionColors);
}

/**
 * Look up a word across providers in priority order (7TV > BTTV > FFZ >
 * Twitch), returning the URL and provider, or null.
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
 * Gigantify (Twitch, 100 bits) only applies to Twitch emotes resolved through
 * the IRC `emotes` tag. 7TV / BTTV / FFZ and typed Twitch names render at 2em.
 */
function parseThirdPartyEmotes(text: string): string {
  // Split on <img> tags (capture group keeps them in the result) so emote
  // image tags aren't broken by word processing.
  const parts = text.split(/(<img[^>]*>)/);

  const parsedParts: string[] = [];

  // BTTV prefixes are carried across a text → <img> boundary so a bare prefix
  // written before an IRC-rendered Twitch emote (`w! <img>`) still applies.
  let pendingEffects: EmoteEffect[] = [];
  let pendingZeroWidth = false;
  let pendingRaw: string[] = [];

  const flushPending = () => {
    if (pendingRaw.length === 0) return;
    const raw = renderUnicodeEmojis(escapeHtml(pendingRaw.join(" ")));
    // Preserve the separating space when there is preceding output.
    if (raw !== "" && parsedParts.length > 0 && parsedParts[parsedParts.length - 1] !== "") {
      parsedParts.push(" ", raw);
    } else {
      parsedParts.push(raw);
    }
    pendingRaw = [];
    pendingEffects = [];
    pendingZeroWidth = false;
  };

  // Overlay `overlayHtml` (a `.emote-overlay` span) onto the most recently
  // emitted base in `parsedParts`.
  const overlayOntoPrevious = (overlayHtml: string) => {
    const prevIdx = parsedParts.length - 1;
    if (prevIdx < 0) {
      parsedParts.push(overlayHtml);
      return;
    }
    const prev = parsedParts[prevIdx];
    if (prev.endsWith("</span>") && prev.includes("emote-overlay-container")) {
      parsedParts[prevIdx] = prev.replace(
        /<\/span>\s*$/,
        `${overlayHtml}</span>`,
      );
      return;
    }
    const imgStart = prev.lastIndexOf("<img");
    if (imgStart >= 0) {
      const imgEnd = prev.indexOf(">", imgStart) + 1;
      parsedParts[prevIdx] =
        prev.slice(0, imgStart) +
        `<span class="emote-overlay-container">${prev.slice(imgStart, imgEnd)}${overlayHtml}</span>` +
        prev.slice(imgEnd);
      return;
    }
    parsedParts.push(overlayHtml);
  };

  let i = 0;
  while (i < parts.length) {
    const part = parts[i];

    // Already-rendered <img> (e.g. an IRC Twitch emote). It can absorb BTTV
    // prefixes carried from the preceding text segment, plus FFZ effect words
    // and 7TV zero-width overlays from the following text segment.
    if (part.startsWith("<img")) {
      const inheritedEffects = pendingEffects;
      const inheritedZw = pendingZeroWidth;
      pendingEffects = [];
      pendingZeroWidth = false;
      pendingRaw = [];

      const overlays: string[] = [];
      const trailingEffects: EmoteEffect[] = [];

      if (i + 1 < parts.length && !parts[i + 1].startsWith("<img")) {
        const words = parts[i + 1].split(" ");
        const hadLeadingSpace = words[0] === "";
        let j = 0;
        // Skip leading empty word if text starts with space
        if (words[j] === "") j++;

        while (j < words.length) {
          const word = words[j];
          if (word === "") break;

          const ffz = FFZ_EFFECTS[word];
          if (ffz && !lookupEmote(word)) {
            trailingEffects.push(ffz);
            j++;
            continue;
          }

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
            continue;
          }
          break;
        }

        if (overlays.length > 0 || trailingEffects.length > 0) {
          // Remove consumed words from the next text segment, keeping the
          // separating space when text remains.
          const remaining = words.slice(j).join(" ");
          parts[i + 1] =
            remaining && hadLeadingSpace ? ` ${remaining}` : remaining;
        }
      }

      const base = applyEmoteEffects(
        part,
        normalizeEffects([...inheritedEffects, ...trailingEffects]),
      );

      if (inheritedZw) {
        overlayOntoPrevious(`<span class="emote-overlay">${base}</span>`);
      } else if (overlays.length > 0) {
        parsedParts.push(
          `<span class="emote-overlay-container">${base}${overlays.join("")}</span>`,
        );
      } else {
        parsedParts.push(base);
      }
      i++;
      continue;
    }

    // Process words with a while-loop so we can look ahead for BTTV prefixes,
    // FFZ effect words and 7TV zero-width (overlay) emotes.
    const words = part.split(" ");
    const output: string[] = [];
    // Index in `output` of the most recently emitted base emote, so `z!` can
    // retroactively overlay onto it.
    let lastBaseIndex = -1;
    let wi = 0;

    const flushToOutput = () => {
      if (pendingRaw.length === 0) return;
      output.push(renderUnicodeEmojis(escapeHtml(pendingRaw.join(" "))));
      pendingRaw = [];
      pendingEffects = [];
      pendingZeroWidth = false;
      lastBaseIndex = -1;
    };

    while (wi < words.length) {
      const word = words[wi];

      // Preserve whitespace-only tokens so joins keep the original spacing.
      if (word === "") {
        output.push("");
        wi++;
        continue;
      }

      const {
        effects: prefixEffects,
        zeroWidth: prefixZw,
        rest,
      } = parseBttvPrefixes(word);

      // A word made entirely of modifier prefixes applies to the next word.
      if (rest === "") {
        pendingEffects.push(...prefixEffects);
        pendingZeroWidth = pendingZeroWidth || prefixZw;
        pendingRaw.push(word);
        wi++;
        continue;
      }

      // Unified emote lookup across all providers
      const match = lookupEmote(rest);
      if (!match) {
        // Modifiers that never found an emote are shown verbatim.
        flushToOutput();
        const linkified = linkifyUrl(word);
        if (linkified) {
          output.push(linkified);
        } else if (word.startsWith("@")) {
          output.push(`<strong>${escapeHtml(word)}</strong>`);
        } else {
          output.push(renderUnicodeEmojis(escapeHtml(word)));
        }
        lastBaseIndex = -1;
        wi++;
        continue;
      }

      // Any emote can be a base. Look ahead for FFZ effect words and 7TV
      // zero-width overlays attached to it (adjacent, with no intervening text).
      const overlays: string[] = [];
      const ffzEffects: EmoteEffect[] = [];
      let j = wi + 1;
      while (j < words.length) {
        const nextWord = words[j];
        const ffz = FFZ_EFFECTS[nextWord];
        if (ffz && !lookupEmote(nextWord)) {
          ffzEffects.push(ffz);
          j++;
          continue;
        }
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
          continue;
        }
        break;
      }

      const effects = normalizeEffects([
        ...pendingEffects,
        ...prefixEffects,
        ...ffzEffects,
      ]);
      const zeroWidth = pendingZeroWidth || prefixZw;
      pendingEffects = [];
      pendingZeroWidth = false;
      pendingRaw = [];

      if (zeroWidth) {
        // `z!` turns this emote into a zero-width overlay on the previous one.
        const overlayImg = createZeroWidthEmoteImg(
          isZeroWidthUrl(match.url) ? getEmoteUrl(match.url) : match.url,
          rest,
          match.provider,
          match.author,
        );
        const overlayHtml = applyEmoteEffects(overlayImg, effects);
        if (lastBaseIndex >= 0) {
          output[lastBaseIndex] =
            `<span class="emote-overlay-container">${output[lastBaseIndex]}${overlayHtml}</span>`;
        } else {
          // No preceding base, render as a normal (orphan) emote.
          output.push(overlayHtml);
          lastBaseIndex = output.length - 1;
        }
        wi = j;
        continue;
      }

      const baseHtml = applyEmoteEffects(
        createEmoteImg(
          isZeroWidthUrl(match.url) ? getEmoteUrl(match.url) : match.url,
          rest,
          match.provider,
          false,
          match.author,
        ),
        effects,
      );

      if (overlays.length > 0) {
        output.push(
          `<span class="emote-overlay-container">${baseHtml}${overlays.join("")}</span>`,
        );
      } else {
        output.push(baseHtml);
      }
      lastBaseIndex = output.length - 1;
      wi = j;
    }

    // Do NOT flush here: leftover BTTV prefixes may still apply to an
    // IRC-rendered Twitch emote in the next part. The outer flushPending()
    // handles the end of the message.
    parsedParts.push(output.join(" "));
    i++;
  }

  flushPending();
  return parsedParts.join("");
}

/**
 * Look up a word in the third-party providers only: 7TV, then BTTV, then FFZ.
 * Twitch is excluded: it's irrelevant on YouTube chat and would false-match
 * channel-specific sub emotes.
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
  name?: string;
  provider?: "7TV" | "BTTV" | "FFZ";
  author?: string;
  /** BTTV / FFZ modifier effects to render on this emote. */
  effects?: EmoteEffect[];
  /**
   * 7TV zero-width overlays that follow the base emote and should be stacked
   * on top of it. Empty for non-base tokens. Each entry contains the overlay
   * name and resolved CDN URL (no ZW: prefix).
   */
  overlays?: { name: string; url: string; effects?: EmoteEffect[] }[];
}

/**
 * Tokenize a YouTube text part into text and emote tokens, applying BTTV /
 * FFZ effects and 7TV zero-width overlay grouping using the currently loaded
 * emote maps. Disabled emotes pass through as plain text. Pure, no DOM deps.
 */
export function tokenizeThirdPartyEmotesForYoutube(
  text: string,
  disabledSet?: Set<string>,
): YoutubeEmoteToken[] {
  if (!text) return [];
  const tokens: YoutubeEmoteToken[] = [];
  const words = text.split(" ");
  let pendingEffects: EmoteEffect[] = [];
  let pendingZeroWidth = false;
  let pendingRaw: string[] = [];
  let wi = 0;

  const flushPending = () => {
    if (pendingRaw.length === 0) return;
    tokens.push({ type: "text", text: pendingRaw.join(" ") });
    pendingRaw = [];
    pendingEffects = [];
    pendingZeroWidth = false;
  };

  while (wi < words.length) {
    const word = words[wi];
    if (word === "") {
      wi++;
      continue;
    }

    if (disabledSet?.has(word)) {
      flushPending();
      tokens.push({ type: "text", text: word });
      wi++;
      continue;
    }

    const {
      effects: prefixEffects,
      zeroWidth: prefixZw,
      rest,
    } = parseBttvPrefixes(word);

    if (rest === "") {
      pendingEffects.push(...prefixEffects);
      pendingZeroWidth = pendingZeroWidth || prefixZw;
      pendingRaw.push(word);
      wi++;
      continue;
    }

    const match = lookupThirdPartyEmote(rest);
    if (!match) {
      flushPending();
      tokens.push({ type: "text", text: word });
      wi++;
      continue;
    }

    // Look ahead for FFZ effect words and 7TV zero-width overlays.
    const overlays: { name: string; url: string }[] = [];
    const ffzEffects: EmoteEffect[] = [];
    let j = wi + 1;
    while (j < words.length) {
      const nextWord = words[j];
      if (disabledSet?.has(nextWord)) break;
      const ffz = FFZ_EFFECTS[nextWord];
      if (ffz && !lookupThirdPartyEmote(nextWord)) {
        ffzEffects.push(ffz);
        j++;
        continue;
      }
      const nextUrl = emotes7tv[nextWord];
      if (nextUrl && isZeroWidthUrl(nextUrl)) {
        overlays.push({ name: nextWord, url: getEmoteUrl(nextUrl) });
        j++;
        continue;
      }
      break;
    }

    const effects = normalizeEffects([
      ...pendingEffects,
      ...prefixEffects,
      ...ffzEffects,
    ]);
    const zeroWidth = pendingZeroWidth || prefixZw;
    pendingEffects = [];
    pendingZeroWidth = false;
    pendingRaw = [];

    const token: YoutubeEmoteToken = {
      type: "emote",
      url: getEmoteUrl(match.url),
      name: rest,
      provider: match.provider,
      author: match.author,
      effects: effects.length > 0 ? effects : undefined,
      overlays: overlays.length > 0 ? overlays : undefined,
    };

    if (zeroWidth) {
      // `z!` overlays this emote onto the immediately-preceding emote token.
      const prev = tokens[tokens.length - 1];
      if (prev && prev.type === "emote") {
        prev.overlays = [
          ...(prev.overlays ?? []),
          {
            name: rest,
            url: token.url ?? "",
            effects: effects.length > 0 ? effects : undefined,
          },
        ];
      } else {
        tokens.push(token);
      }
      wi = j;
      continue;
    }

    tokens.push(token);
    wi = j;
  }

  flushPending();
  return tokens;
}
