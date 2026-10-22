import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getChannelHistory } from "../../lib/chatHistoryStorage";
import type { Platform, TwitchMessage } from "../../lib/types";
import {
  CHAT_HISTORY_MAX_AGE_HOURS,
  MAX_DISPLAYED_MESSAGES,
} from "../../lib/types";

const DEFAULT_PAGE_SIZE = 100;
const SCROLL_TRIGGER_PX = 120;
const LOAD_THROTTLE_MS = 300;

export interface UseLazyChatHistoryOptions<T> {
  /** Channel key messages are stored under in IndexedDB. */
  channel?: string;
  /** When false, no history is fetched (e.g. panel hidden / disconnected). */
  enabled: boolean;
  /** The current in-memory (live) window for this surface. */
  live: T[];
  /** Restrict history to these platforms. Omitted = all platforms. */
  platforms?: Platform[];
  /** Scroll container whose top triggers the next page. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  keyOf: (item: T) => string;
  timestampOf: (item: T) => number;
  isOptimistic?: (item: T) => boolean;
  /**
   * Ephemeral items (e.g. AutoMod holds) are transient UI state that is never
   * persisted. They must never be absorbed into history, or resolving them
   * would leave a stale copy rendering from the history window.
   */
  isEphemeral?: (item: T) => boolean;
  /** Adapts a persisted message into the surface's item shape. */
  mapStored: (message: TwitchMessage) => T;
  pageSize?: number;
  /**
   * Maximum number of messages retained in the loaded-history window. Older
   * loaded messages are dropped once the cap is reached (they remain in
   * IndexedDB and can be re-fetched).
   */
  maxHistory?: number;
  /**
   * Cap applied to `live` by the message hooks. Messages are only absorbed
   * into history when the live window is actually full. A message leaving a
   * not-yet-full window is a deletion, not a cap eviction, and must not be
   * resurrected from history.
   */
  liveCap?: number;
}

export interface UseLazyChatHistoryResult<T> {
  /** Loaded messages older than the live window, deduped against `live`. */
  history: T[];
  isLoadingOlder: boolean;
}

interface PrevLive<T> {
  channel?: string;
  items: T[];
}

/**
 * Keeps a bounded window of older messages loaded from IndexedDB, absorbing
 * messages that roll off the front of `live` so the timeline stays contiguous.
 * Total DOM stays bounded by `maxHistory` + the live cap, and page loads are
 * scroll-anchored so the viewport does not jump.
 */
export function useLazyChatHistory<T>({
  channel,
  enabled,
  live,
  platforms,
  containerRef,
  keyOf,
  timestampOf,
  isOptimistic,
  isEphemeral,
  mapStored,
  pageSize = DEFAULT_PAGE_SIZE,
  maxHistory,
  liveCap = MAX_DISPLAYED_MESSAGES,
}: UseLazyChatHistoryOptions<T>): UseLazyChatHistoryResult<T> {
  const [history, setHistory] = useState<T[]>([]);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

  const historyRef = useRef<T[]>([]);
  const liveRef = useRef<T[]>(live);
  const prevLiveRef = useRef<PrevLive<T>>({ channel, items: [] });
  const channelRef = useRef(channel);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const lastLoadAtRef = useRef(0);
  const anchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(
    null,
  );

  // Latest callback/dep values, read by effects and async loaders without
  // forcing them to re-subscribe on every render.
  const keyOfRef = useRef(keyOf);
  const timestampOfRef = useRef(timestampOf);
  const isOptimisticRef = useRef(isOptimistic);
  const isEphemeralRef = useRef(isEphemeral);
  const mapStoredRef = useRef(mapStored);
  const platformsRef = useRef(platforms);
  useEffect(() => {
    keyOfRef.current = keyOf;
    timestampOfRef.current = timestampOf;
    isOptimisticRef.current = isOptimistic;
    isEphemeralRef.current = isEphemeral;
    mapStoredRef.current = mapStored;
    platformsRef.current = platforms;
  });

  const sortByTimestamp = useCallback((items: T[]) => {
    return [...items].sort(
      (a, b) => timestampOfRef.current(a) - timestampOfRef.current(b),
    );
  }, []);

  const capHistory = useCallback(
    (items: T[]) => {
      if (!maxHistory || items.length <= maxHistory) return items;
      return items.slice(-maxHistory);
    },
    [maxHistory],
  );

  const commitHistory = useCallback(
    (items: T[]) => {
      const next = capHistory(sortByTimestamp(items));
      historyRef.current = next;
      setHistory(next);
    },
    [capHistory, sortByTimestamp],
  );

  // Reset the loaded-history window when the channel changes. Do NOT touch
  // prevLiveRef here: the live array still holds the previous channel's
  // messages for one render, and the eviction effect relies on seeing the old
  // channel marker to discard them instead of absorbing them into the new
  // channel's history.
  useEffect(() => {
    channelRef.current = channel;
    historyRef.current = [];
    setHistory([]);
    hasMoreRef.current = true;
  }, [channel]);

  // Keep the live ref current (read by the async loader).
  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  // Absorb messages that roll off the front of the live window into history so
  // the rendered timeline stays contiguous with live.
  useEffect(() => {
    const prev = prevLiveRef.current;
    if (prev.channel !== channel) {
      prevLiveRef.current = { channel, items: [] };
      return;
    }
    const prevItems = prev.items;
    prevLiveRef.current = { channel, items: live };
    if (!enabled) return;
    if (prevItems.length === 0) return;
    // Only cap evictions can be absorbed. A message leaving a not-yet-full
    // live window is a deletion and must not be resurrected from history.
    if (prevItems.length < liveCap) return;
    // Evictions only happen while appending to a full window, so the window
    // stays full. If it shrank, items left because they were removed (message
    // deletion, resolved automod hold). Absorbing them would resurrect them.
    if (live.length < liveCap) return;

    const liveKeys = new Set(live.map((item) => keyOfRef.current(item)));
    const historyKeys = new Set(
      historyRef.current.map((item) => keyOfRef.current(item)),
    );
    const evicted = prevItems.filter((item) => {
      if (isOptimisticRef.current?.(item)) return false;
      if (isEphemeralRef.current?.(item)) return false;
      const key = keyOfRef.current(item);
      return !liveKeys.has(key) && !historyKeys.has(key);
    });
    if (evicted.length === 0) return;
    commitHistory([...historyRef.current, ...evicted]);
  }, [live, channel, commitHistory, liveCap, enabled]);

  const oldestRenderedTimestamp = useCallback((): number | null => {
    const items = historyRef.current;
    if (items.length > 0) return timestampOfRef.current(items[0]);
    const candidates = liveRef.current.filter(
      (item) => !isOptimisticRef.current?.(item),
    );
    if (candidates.length === 0) return null;
    return Math.min(...candidates.map((item) => timestampOfRef.current(item)));
  }, []);

  const loadOlder = useCallback(async () => {
    const currentChannel = channelRef.current;
    if (!currentChannel || loadingRef.current || !hasMoreRef.current) return;
    const before = oldestRenderedTimestamp();
    if (before == null) return;

    loadingRef.current = true;
    setIsLoadingOlder(true);
    const el = containerRef.current;
    anchorRef.current = el
      ? { scrollHeight: el.scrollHeight, scrollTop: el.scrollTop }
      : null;

    try {
      const stored = await getChannelHistory(currentChannel, {
        before,
        limit: pageSize,
        platforms: platformsRef.current,
        maxAgeHours: CHAT_HISTORY_MAX_AGE_HOURS,
      });
      const historyKeys = new Set(
        historyRef.current.map((item) => keyOfRef.current(item)),
      );
      const mapped = stored
        .map((message) => mapStoredRef.current(message))
        // Never resurrect ephemeral items (e.g. AutoMod holds) from history.
        .filter((item) => !isEphemeralRef.current?.(item))
        .filter((item) => !historyKeys.has(keyOfRef.current(item)));
      if (stored.length < pageSize) hasMoreRef.current = false;
      if (mapped.length === 0) {
        anchorRef.current = null;
        return;
      }
      commitHistory([...mapped, ...historyRef.current]);
    } catch (err) {
      console.error("Failed to load older chat messages:", err);
      anchorRef.current = null;
    } finally {
      loadingRef.current = false;
      setIsLoadingOlder(false);
    }
  }, [containerRef, pageSize, oldestRenderedTimestamp, commitHistory]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled || !channel) return;
    const onScroll = () => {
      if (el.scrollTop > SCROLL_TRIGGER_PX) return;
      const now = Date.now();
      if (now - lastLoadAtRef.current < LOAD_THROTTLE_MS) return;
      lastLoadAtRef.current = now;
      void loadOlder();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [enabled, channel, containerRef, loadOlder]);

  // Restore scroll position after prepending an older page.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    anchorRef.current = null;
    if (!anchor) return;
    const el = containerRef.current;
    if (!el) return;
    const delta = el.scrollHeight - anchor.scrollHeight;
    if (delta > 0) el.scrollTop = anchor.scrollTop + delta;
  }, [history, containerRef]);

  const visibleHistory = useMemo(() => {
    if (history.length === 0) return history;
    const liveKeys = new Set(live.map((item) => keyOf(item)));
    const filtered = history.filter((item) => !liveKeys.has(keyOf(item)));
    return filtered.length === history.length ? history : filtered;
  }, [history, live, keyOf]);

  return { history: visibleHistory, isLoadingOlder };
}
