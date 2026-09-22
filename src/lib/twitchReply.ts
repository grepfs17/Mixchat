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
