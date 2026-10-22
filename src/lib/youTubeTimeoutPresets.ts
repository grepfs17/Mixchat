export const YOUTUBE_TIMEOUT_PRESETS: ReadonlyArray<{
  label: string;
  seconds: number;
}> = [
  { label: "1 minute", seconds: 60 },
  { label: "5 minutes", seconds: 300 },
  { label: "10 minutes", seconds: 600 },
  { label: "1 hour", seconds: 3600 },
  { label: "24 hours", seconds: 86400 },
];

/** Maximum duration accepted by YouTube Data API `banDurationSeconds`. */
export const YOUTUBE_MAX_TIMEOUT_SECONDS = 86400;

/** Minimum duration accepted by YouTube Data API `banDurationSeconds`. */
export const YOUTUBE_MIN_TIMEOUT_SECONDS = 1;

/** Formats a duration in seconds as a human-readable label (e.g. 90 → "1.5m"). */
export function formatTimeoutDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${Math.round(seconds / 86400)}d`;
}
