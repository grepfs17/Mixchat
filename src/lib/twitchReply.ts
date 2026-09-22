import type { TwitchGif } from "./twitchGifs";

const MENTION_PREFIX_RE = /^@([^\s]+)\s*/;

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Twitch prepends `@login` to a reply's raw content. When that mention repeats
 * the user already named in the "response to" header, strip it from the quoted
 * preview so the username is not shown twice. Display names and logins can
 * differ only by case or separators, so the comparison is normalized.
 */
export function stripReplyMention(content: string, author: string): string {
  if (!content || !author) return content;
  const match = content.match(MENTION_PREFIX_RE);
  if (!match) return content;
  if (normalizeName(match[1]) !== normalizeName(author)) return content;
  return content.slice(match[0].length);
}

export interface StrippedReplyContent {
  content: string;
  emotes: Record<string, string[]>;
  gifs?: TwitchGif[];
}

/**
 * Strip Twitch's auto-prepended `@login` reply mention from a message body and
 * shift emote / GIF character offsets left so they still line up with the
 * shortened content.
 */
export function stripReplyMentionFromContent(
  content: string,
  author: string,
  emotes: Record<string, string[]>,
  gifs?: TwitchGif[],
): StrippedReplyContent {
  const stripped = stripReplyMention(content, author);
  if (stripped === content) return { content, emotes, gifs };

  const offset = content.length - stripped.length;

  const adjustedEmotes: Record<string, string[]> = {};
  for (const [id, positions] of Object.entries(emotes)) {
    const shifted = positions.flatMap((pos) => {
      const [start, end] = pos.split("-").map(Number);
      const newStart = start - offset;
      return newStart >= 0 ? [`${newStart}-${end - offset}`] : [];
    });
    if (shifted.length > 0) adjustedEmotes[id] = shifted;
  }

  const adjustedGifs = gifs
    ?.map((gif) => ({
      ...gif,
      start: gif.start - offset,
      end: gif.end - offset,
    }))
    .filter((gif) => gif.start >= 0);

  return {
    content: stripped,
    emotes: adjustedEmotes,
    gifs: adjustedGifs && adjustedGifs.length > 0 ? adjustedGifs : undefined,
  };
}
