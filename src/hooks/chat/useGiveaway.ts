import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  extractEntries,
  pickWinner,
  type GiveawayConfig,
  type GiveawayEligibility,
  type GiveawayEntry,
  type GiveawayMessage,
  type GiveawayOwner,
  type GiveawayScope,
} from "../../lib/streamerTools/giveaway";
import { appendGiveawayHistory } from "../../lib/streamerTools/history";

const DEFAULT_DURATION = 180;
const MIN_DURATION = 5;
const MAX_DURATION = 60 * 60;
/** `0` means "unlimited" (no countdown; streamer reveals manually). */
export const UNLIMITED_DURATION = 0;
export const DURATION_PRESETS_SECONDS: { label: string; value: number }[] = [
  { label: "5 min", value: 300 },
  { label: "10 min", value: 600 },
  { label: "15 min", value: 900 },
];

export type GiveawayPhase = "config" | "running" | "revealed";

export interface UseGiveawayOptions {
  messages: GiveawayMessage[];
  owner: GiveawayOwner;
  /** When false, internal ticking is suspended (used while not on own channel). */
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
  /** Time remaining in ms (Infinity when unlimited). */
  remainingMs: number;
  /** Time elapsed since the giveaway started. */
  elapsedMs: number;
  /** Current `now` value (updated by the internal tick). */
  now: number;
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

export function useGiveaway({
  messages,
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
  const [now, setNow] = useState<number>(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const tickRef = useRef<number | null>(null);
  const recordedRef = useRef<boolean>(false);

  const config: GiveawayConfig = useMemo(
    () => ({ keyword, durationSeconds: duration, scope, eligibility }),
    [keyword, duration, scope, eligibility],
  );

  const liveEntries = useMemo<GiveawayEntry[]>(() => {
    if (phase !== "running") return [];
    return extractEntries(messages, config, owner);
  }, [phase, messages, config, owner]);

  // Tick the clock while the giveaway is running, regardless of whether
  // the modal is open — this is what lets the giveaway keep running when
  // the streamer minimizes the tool.
  useEffect(() => {
    if (phase !== "running" || !enabled) return;
    setNow(Date.now());
    tickRef.current = window.setInterval(() => setNow(Date.now()), 250);
    return () => {
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [phase, enabled]);

  // Auto-reveal when the countdown reaches zero.
  useEffect(() => {
    if (phase !== "running" || endsAt === null) return;
    if (endsAt === Number.POSITIVE_INFINITY) return;
    if (now >= endsAt) {
      const finalEntries = extractEntries(messages, config, owner);
      setWinner(pickWinner(finalEntries));
      setPhase("revealed");
    }
  }, [phase, now, endsAt, messages, config, owner]);

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
  }, [phase, winner, keyword, liveEntries.length, duration, scope, eligibility]);

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
    setNow(startMs);
    setStartedAt(startMs);
    setEndsAt(
      duration === UNLIMITED_DURATION
        ? Number.POSITIVE_INFINITY
        : startMs + duration * 1000,
    );
    setPhase("running");
    recordedRef.current = false;
  }, [keyword, duration]);

  const cancel = useCallback(() => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    setEndsAt(null);
    setStartedAt(null);
    setWinner(null);
    setPhase("config");
    recordedRef.current = false;
  }, []);

  const startNew = useCallback(() => {
    setWinner(null);
    setEndsAt(null);
    setStartedAt(null);
    setPhase("config");
    recordedRef.current = false;
  }, []);

  const reveal = useCallback(() => {
    if (phase !== "running") return;
    const finalEntries = extractEntries(messages, config, owner);
    setWinner(pickWinner(finalEntries));
    setPhase("revealed");
  }, [phase, messages, config, owner]);

  const remainingMs = endsAt !== null ? Math.max(0, endsAt - now) : 0;
  const elapsedMs = startedAt !== null ? Math.max(0, now - startedAt) : 0;

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
    remainingMs,
    elapsedMs,
    now,
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
  };
}
