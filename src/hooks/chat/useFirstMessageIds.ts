import { useEffect, useRef, useState } from "react";

export interface FirstMessageScanItem {
  /** Unique message key, e.g. "twitch:abc123". */
  key: string;
  /** Platform-scoped author identity, e.g. "twitch:someuser". */
  authorKey: string;
  /** Message timestamp in milliseconds. */
  timeMs: number;
  /** True when the message was preloaded from the recent-messages API. */
  isPreloaded?: boolean;
}

/**
 * Tracks the first message each author sends within a stream scope so chat
 * surfaces can highlight them. The scope (channel + stream start) resets all
 * tracking; messages older than the stream start are ignored when a start
 * time is known, otherwise preloaded messages are ignored (session fallback,
 * same rule as chat stats). Once an author's earliest message is recorded it
 * is kept even if that message later leaves the rendered window, so marks do
 * not drift onto a later message. A later-arriving message that is earlier
 * (lazy history) replaces the recorded one.
 */
export function useFirstMessageIds(
  items: FirstMessageScanItem[],
  scopeKey: string,
  streamStartMs: number | undefined,
): ReadonlySet<string> {
  const firstByAuthorRef = useRef<
    Map<string, { id: string; timeMs: number }>
  >(new Map());
  const processedRef = useRef<Set<string>>(new Set());
  const scopeRef = useRef(scopeKey);
  const [firstIds, setFirstIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  useEffect(() => {
    if (scopeRef.current === scopeKey) return;
    scopeRef.current = scopeKey;
    firstByAuthorRef.current = new Map();
    processedRef.current = new Set();
    setFirstIds(new Set());
  }, [scopeKey]);

  useEffect(() => {
    const firstByAuthor = firstByAuthorRef.current;
    const processed = processedRef.current;
    let dirty = false;
    for (const item of items) {
      if (processed.has(item.key)) continue;
      processed.add(item.key);
      if (streamStartMs !== undefined) {
        if (item.timeMs < streamStartMs) continue;
      } else if (item.isPreloaded) {
        continue;
      }
      const existing = firstByAuthor.get(item.authorKey);
      if (existing === undefined || item.timeMs < existing.timeMs) {
        firstByAuthor.set(item.authorKey, {
          id: item.key,
          timeMs: item.timeMs,
        });
        dirty = true;
      }
    }
    if (dirty) {
      setFirstIds(
        new Set(Array.from(firstByAuthor.values(), (entry) => entry.id)),
      );
    }
  }, [items, scopeKey, streamStartMs]);

  return firstIds;
}
