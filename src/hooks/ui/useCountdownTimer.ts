import { useEffect, useRef, useState } from "react";

/**
 * Ticking seconds-based countdown to `endsAt`.
 *
 * `onExpire` fires once at zero. For the "linger after expiry" case
 * (Poll/Prediction), `autoDismissAfter` delays `onAutoDismiss`. Bumping
 * `endsAt` above zero cancels the pending dismiss via effect cleanup.
 *
 * Callbacks are read through refs so inline callbacks don't re-fire effects.
 */
export interface UseCountdownTimerOptions {
  /** Fired once when the countdown reaches zero. */
  onExpire?: () => void;
  /** Milliseconds to wait after expiry before calling `onAutoDismiss`. */
  autoDismissAfter?: number;
  /** Fired `autoDismissAfter` ms after the countdown reaches zero. */
  onAutoDismiss?: () => void;
}

export interface CountdownTimer {
  timeLeft: number;
  minutesLeft: number;
  secondsLeft: number;
  timeDisplay: string;
  isExpired: boolean;
}

function formatTimeLeft(timeLeft: number): string {
  if (timeLeft <= 0) return "0s";
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export function useCountdownTimer(
  endsAt: Date | null | undefined,
  options: UseCountdownTimerOptions = {},
): CountdownTimer {
  const { onExpire, autoDismissAfter, onAutoDismiss } = options;

  const onExpireRef = useRef(onExpire);
  const onAutoDismissRef = useRef(onAutoDismiss);
  useEffect(() => {
    onExpireRef.current = onExpire;
    onAutoDismissRef.current = onAutoDismiss;
  }, [onExpire, onAutoDismiss]);

  // One-shot guard: ensures `onExpire` only fires on the transition
  // from timeLeft > 0 to timeLeft <= 0, not on every render that
  // happens to observe timeLeft === 0.
  const expiredRef = useRef(false);

  const [timeLeft, setTimeLeft] = useState<number>(() => {
    if (!endsAt) return 0;
    const diff = endsAt.getTime() - Date.now();
    return Math.max(0, Math.floor(diff / 1000));
  });

  useEffect(() => {
    if (timeLeft > 0) {
      // Reset the one-shot guard whenever the timer is bumped back
      // above zero (e.g. parent passes a new endsAt).
      expiredRef.current = false;
      return;
    }
    if (expiredRef.current) return;
    expiredRef.current = true;
    onExpireRef.current?.();
  }, [timeLeft]);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setTimeout(
      () => setTimeLeft((t) => Math.max(0, t - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [timeLeft]);

  useEffect(() => {
    if (timeLeft > 0 || !autoDismissAfter) return;
    const timer = setTimeout(
      () => onAutoDismissRef.current?.(),
      autoDismissAfter,
    );
    return () => clearTimeout(timer);
  }, [timeLeft, autoDismissAfter]);

  const minutesLeft = Math.floor(timeLeft / 60);
  const secondsLeft = timeLeft % 60;

  return {
    timeLeft,
    minutesLeft,
    secondsLeft,
    timeDisplay: formatTimeLeft(timeLeft),
    isExpired: timeLeft <= 0,
  };
}
