export const TWITCH_TIMEOUT_PRESETS: ReadonlyArray<{
  label: string;
  seconds: number;
}> = [
  { label: "10 seconds", seconds: 10 },
  { label: "30 seconds", seconds: 30 },
  { label: "1 minute", seconds: 60 },
  { label: "5 minutes", seconds: 300 },
  { label: "10 minutes", seconds: 600 },
  { label: "1 hour", seconds: 3600 },
  { label: "24 hours", seconds: 86400 },
];

/** Maximum duration accepted by Twitch Helix ban endpoint for timeouts. */
export const TWITCH_MAX_TIMEOUT_SECONDS = 1209600; // 14 days

/** Minimum duration accepted by Twitch Helix ban endpoint. */
export const TWITCH_MIN_TIMEOUT_SECONDS = 1;

/** Formats a duration in seconds as a human-readable label (e.g. 90 → "1.5m"). */
export function formatTwitchTimeoutDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${Math.round(seconds / 86400)}d`;
}
