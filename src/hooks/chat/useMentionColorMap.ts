import { useMemo, useRef } from "react";
import { buildMentionColorMap } from "../../lib/chatColors";

interface ColorSource {
  author: string;
  userName?: string;
  authorColor?: string;
}

function mapsEqual(a: Map<string, string>, b: Map<string, string>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [key, value] of b) {
    if (a.get(key) !== value) return false;
  }
  return true;
}

/**
 * Builds the lowercased username → chat colour map used to render `@mentions`
 * in the mentioned user's colour. The map keeps a stable identity while its
 * contents are unchanged so memoised message rows are not forced to re-render
 * on every incoming message.
 */
export function useMentionColorMap(
  messages: ReadonlyArray<ColorSource>,
): Map<string, string> {
  const ref = useRef<Map<string, string>>(new Map());
  return useMemo(() => {
    const next = buildMentionColorMap(messages);
    if (mapsEqual(ref.current, next)) return ref.current;
    ref.current = next;
    return next;
  }, [messages]);
}
