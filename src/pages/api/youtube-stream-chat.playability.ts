/**
 * Substrings that indicate a terminal playability error — the video is
 * not playable for a structural reason (unavailable, private, removed,
 * region-locked, age-restricted, etc.). These won't recover on retry
 * within a short window, so we cache them server-side and return early.
 */
export const PLAYABILITY_ERROR_PATTERNS: readonly string[] = [
  "This video is unavailable",
  "video is unavailable",
  "is not available",
  "not available",
  "private video",
  "this video is private",
  "this video has been removed",
  "video has been removed",
  "account has been terminated",
  "Sign in to confirm your age",
  "age-restricted",
  "This live stream recording is not available",
];

export function isPlayabilityError(message: string): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return PLAYABILITY_ERROR_PATTERNS.some((p) =>
    lower.includes(p.toLowerCase()),
  );
}
