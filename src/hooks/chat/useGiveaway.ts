import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  messageMatchesKeyword,
  normalizeKeyword,
  pickWinner,
  type GiveawayConfig,
  type GiveawayEligibility,
  type GiveawayEntry,
  type GiveawayMessage,
  type GiveawayOwner,
  type GiveawayScope,
} from "../../lib/streamerTools/giveaway";
import {
  isEligibleForSubscribers,
  isOwnerMessage as isOwnerMessageShared,
  isSkippableMessage,
  messageContent as messageContentShared,
  stableUserId,
} from "../../lib/streamerTools/chatHelpers";
import { appendGiveawayHistory } from "../../lib/streamerTools/history";

const DEFAULT_DURATION = 180;
const MIN_DURATION = 5;
const MAX_DURATION = 2 * 60 * 60;
/** `0` means "unlimited" (no countdown; streamer reveals manually). */
export const UNLIMITED_DURATION = 0;
export const DURATION_PRESETS_SECONDS: { label: string; value: number }[] = [
  { label: "3 min", value: DEFAULT_DURATION },
  { label: "5 min", value: 300 },
  { label: "10 min", value: 600 },
  { label: "15 min", value: 900 },
  { label: "30 min", value: 1800 },
  { label: "1 h", value: 3600 },
  { label: "2 h", value: 7200 },
];

/**
 * Allow a small grace window so a message whose timestamp is up to this
 * many ms behind `Date.now()` still counts (chat timestamps can lag
 * slightly behind the client clock when they're batched).
 */
const STARTED_AT_GRACE_MS = 2_000;

export type GiveawayPhase = "config" | "running" | "revealed";

export interface UseGiveawayOptions {
  owner: GiveawayOwner;
  /** When false, internal ticking and ingestion are suspended. */
  enabled?: boolean;
}

export interface UseGiveawayResult {
  phase: GiveawayPhase;
  keyword: string;
  duration: number;
  scope: GiveawayScope;
  eligibility: GiveawayEligibility;
  endsAt: number | null;
  startedAt: number | null;
  winner: GiveawayEntry | null;
  liveEntries: GiveawayEntry[];
  error: string | null;
  setKeyword: (v: string) => void;
  setDuration: (v: number) => void;
  setScope: (v: GiveawayScope) => void;
  setEligibility: (v: GiveawayEligibility) => void;
  setError: (v: string | null) => void;
  start: () => void;
  cancel: () => void;
  startNew: () => void;
  reveal: () => void;
  /**
   * Add a single message to the running giveaway's entry buffer. No-op
   * unless the giveaway is in the `running` phase. Caller is expected to
   * pass each new chat message exactly once; the hook dedupes by message id.
   */
  ingestMessage: (item: GiveawayMessage) => void;
}

function validateDuration(duration: number): string | null {
  if (!Number.isFinite(duration)) {
    return `Duration must be 0 (unlimited) or between ${MIN_DURATION} and ${MAX_DURATION} seconds.`;
  }
  if (duration === UNLIMITED_DURATION) return null;
  if (duration < MIN_DURATION || duration > MAX_DURATION) {
    return `Duration must be 0 (unlimited) or between ${MIN_DURATION} and ${MAX_DURATION} seconds.`;
  }
  return null;
}

function messageContent(item: GiveawayMessage): string {
  return messageContentShared(item);
}

function isSkippableItem(item: GiveawayMessage): boolean {
  return isSkippableMessage(item.msg);
}

function isOwnerItem(item: GiveawayMessage, owner: GiveawayOwner): boolean {
  return isOwnerMessageShared(item, owner);
}

function isEligibleItem(
  item: GiveawayMessage,
  eligibility: GiveawayEligibility,
): boolean {
  if (eligibility === "everyone") return true;
  return isEligibleForSubscribers(item);
}

function inScope(
  platform: "twitch" | "youtube",
  scope: GiveawayScope,
): boolean {
  if (scope === "both") return true;
  return scope === platform;
}

function toEntry(item: GiveawayMessage): GiveawayEntry | null {
  const id = stableUserId(item);
  if (!id) return null;
  const author = item.msg.author;
  if (item.platform === "twitch") {
    return {
      userId: id,
      author,
      authorAvatar: item.msg.authorAvatar,
      platform: "twitch",
    };
  }
  return {
    userId: id,
    author,
    authorAvatar: item.msg.authorAvatar,
    platform: "youtube",
  };
}

export function useGiveaway({
  owner,
  enabled = true,
}: UseGiveawayOptions): UseGiveawayResult {
  const [phase, setPhase] = useState<GiveawayPhase>("config");
  const [keyword, setKeyword] = useState("");
  const [duration, setDuration] = useState<number>(DEFAULT_DURATION);
  const [scope, setScope] = useState<GiveawayScope>("both");
  const [eligibility, setEligibility] =
    useState<GiveawayEligibility>("everyone");
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [winner, setWinner] = useState<GiveawayEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Bumped on every buffer mutation so consumers re-render. */
  const [entriesVersion, setEntriesVersion] = useState(0);
  const tickRef = useRef<number | null>(null);
  const recordedRef = useRef<boolean>(false);
  const bufferRef = useRef<Map<string, GiveawayEntry>>(new Map());
  const ingestedIdsRef = useRef<Set<string>>(new Set());

  const config: GiveawayConfig = { keyword, durationSeconds: duration, scope, eligibility };

  const liveEntries = useMemo<GiveawayEntry[]>(() => {
    if (phase !== "running" && phase !== "revealed") return [];
    return Array.from(bufferRef.current.values());
    // entriesVersion is the trigger; bufferRef is a stable ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, entriesVersion]);

  const resetBuffer = useCallback(() => {
    bufferRef.current = new Map();
    ingestedIdsRef.current = new Set();
    setEntriesVersion((v) => v + 1);
  }, []);

  // Auto-reveal when the countdown reaches zero. Uses a single setTimeout
  // instead of a polling interval so ChatApp never re-renders for the tick.
  useEffect(() => {
    if (phase !== "running" || !enabled) return;
    if (endsAt === null || endsAt === Number.POSITIVE_INFINITY) return;
    const delay = Math.max(0, endsAt - Date.now());
    tickRef.current = window.setTimeout(() => {
      setWinner(pickWinner(Array.from(bufferRef.current.values())));
      setPhase("revealed");
    }, delay);
    return () => {
      if (tickRef.current !== null) {
        window.clearTimeout(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [phase, endsAt, enabled]);

  // Record the result once when entering the revealed phase with a winner.
  useEffect(() => {
    if (phase !== "revealed" || !winner || recordedRef.current) return;
    appendGiveawayHistory({
      keyword: keyword.trim(),
      winner,
      entryCount: liveEntries.length,
      durationSeconds: duration,
      scope,
      eligibility,
    });
    recordedRef.current = true;
  }, [
    phase,
    winner,
    keyword,
    liveEntries.length,
    duration,
    scope,
    eligibility,
  ]);

  const ingestMessage = useCallback(
    (item: GiveawayMessage) => {
      if (phase !== "running" || !enabled) return;
      if (!item.msg.id) return;
      if (ingestedIdsRef.current.has(item.msg.id)) return;
      ingestedIdsRef.current.add(item.msg.id);
      if (!inScope(item.platform, scope)) return;
      if (isSkippableItem(item)) return;
      if (isOwnerItem(item, owner)) return;
      const keywordNorm = normalizeKeyword(keyword);
      if (!keywordNorm) return;
      if (!messageMatchesKeyword(messageContent(item), keywordNorm)) return;
      if (!isEligibleItem(item, eligibility)) return;
      const entry = toEntry(item);
      if (!entry) return;
      const key = `${entry.platform}:${entry.userId}`;
      if (bufferRef.current.has(key)) return;
      bufferRef.current.set(key, entry);
      setEntriesVersion((v) => v + 1);
    },
    [phase, enabled, scope, owner, keyword, eligibility],
  );

  const start = useCallback(() => {
    setError(null);
    const trimmed = keyword.trim();
    if (!trimmed) {
      setError("Please enter a keyword.");
      return;
    }
    if (trimmed.length > 32) {
      setError("Keyword must be 32 characters or fewer.");
      return;
    }
    const durationError = validateDuration(duration);
    if (durationError) {
      setError(durationError);
      return;
    }
    setWinner(null);
    const startMs = Date.now();
    setStartedAt(startMs);
    setEndsAt(
      duration === UNLIMITED_DURATION
        ? Number.POSITIVE_INFINITY
        : startMs + duration * 1000,
    );
    resetBuffer();
    setPhase("running");
    recordedRef.current = false;
  }, [keyword, duration, resetBuffer]);

  const cancel = useCallback(() => {
    if (tickRef.current !== null) {
      window.clearTimeout(tickRef.current);
      tickRef.current = null;
    }
    setEndsAt(null);
    setStartedAt(null);
    setWinner(null);
    resetBuffer();
    setPhase("config");
    recordedRef.current = false;
  }, [resetBuffer]);

  const startNew = useCallback(() => {
    setWinner(null);
    setEndsAt(null);
    setStartedAt(null);
    resetBuffer();
    setPhase("config");
    recordedRef.current = false;
  }, [resetBuffer]);

  const reveal = useCallback(() => {
    if (phase !== "running") return;
    setWinner(pickWinner(Array.from(bufferRef.current.values())));
    setPhase("revealed");
  }, [phase]);

  return {
    phase,
    keyword,
    duration,
    scope,
    eligibility,
    endsAt,
    startedAt,
    winner,
    liveEntries,
    error,
    setKeyword,
    setDuration,
    setScope,
    setEligibility,
    setError,
    start,
    cancel,
    startNew,
    reveal,
    ingestMessage,
  };
}


