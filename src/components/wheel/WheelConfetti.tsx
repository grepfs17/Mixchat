import { useMemo, type CSSProperties } from "react";

/**
 * Falling confetti shown behind the winner box.
 *
 * Pure CSS animation: each piece is a single element with a delay, a duration
 * and a horizontal drift baked in as a custom property, so the whole effect
 * costs no timers and no per-frame JS.
 */

/** Slices the wheel draws plus a little gold for the celebration. */
const CONFETTI_COLORS = [
  "#9e4073",
  "#6366f1",
  "#9146ff",
  "#a855f7",
  "#ec4899",
  "#7c3aed",
  "#3b82f6",
  "#ffd93d",
];

export interface ConfettiPiece {
  id: number;
  /** Horizontal start, in % of the overlay width. */
  left: number;
  /** Seconds to wait before falling. */
  delay: number;
  /** Seconds to cross the screen. */
  duration: number;
  /** Horizontal travel in px, so pieces do not fall in straight lines. */
  drift: number;
  color: string;
  /** Width in px; height is derived. */
  size: number;
  round: boolean;
}

/**
 * Build the piece list. `random` is injectable so tests can be deterministic.
 */
export function buildConfetti(
  count: number,
  random: () => number = Math.random,
): ConfettiPiece[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    left: random() * 100,
    delay: random() * 1.2,
    duration: 2.2 + random() * 1.8,
    drift: (random() - 0.5) * 160,
    color: CONFETTI_COLORS[Math.floor(random() * CONFETTI_COLORS.length)],
    size: 6 + Math.floor(random() * 5),
    round: random() > 0.7,
  }));
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export default function WheelConfetti({ count = 70 }: { count?: number }) {
  const pieces = useMemo(
    () => (prefersReducedMotion() ? [] : buildConfetti(count)),
    [count],
  );

  if (pieces.length === 0) return null;

  return (
    <div className="wheel-confetti" aria-hidden="true">
      {pieces.map((piece) => (
        <span
          key={piece.id}
          className={`wheel-confetti__piece${
            piece.round ? " wheel-confetti__piece--round" : ""
          }`}
          style={
            {
              left: `${piece.left}%`,
              width: `${piece.size}px`,
              height: `${piece.round ? piece.size : piece.size + 6}px`,
              background: piece.color,
              animationDelay: `${piece.delay}s`,
              animationDuration: `${piece.duration}s`,
              "--confetti-drift": `${piece.drift}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
