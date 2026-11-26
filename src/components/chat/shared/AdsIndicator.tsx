import { useEffect, useState } from "react";
import { FaAd } from "react-icons/fa";
import type { CommercialLength, TwitchAdSchedule } from "../../../lib/twitch";

interface AdsIndicatorProps {
  schedule: TwitchAdSchedule;
  snoozing: boolean;
  runningLength: CommercialLength | null;
  onSnooze: () => void;
  onRun: (length: CommercialLength) => void;
  onOpen: () => void;
}

const COMMERCIAL_LENGTHS: CommercialLength[] = [
  30, 60, 90, 120, 150, 180,
];

function formatCountdown(nextAdAt: string, now: number): string {
  const ms = new Date(nextAdAt).getTime() - now;
  if (ms <= 0) return "now";
  const totalSeconds = Math.ceil(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Minimized Ads Manager pill (giveaway-indicator style): stays in the chat
 * corner after the streamer minimizes the Ads tool, with a live countdown
 * to the next ad break plus snooze and run-ad-break shortcuts.
 */
export default function AdsIndicator({
  schedule,
  snoozing,
  runningLength,
  onSnooze,
  onRun,
  onOpen,
}: AdsIndicatorProps) {
  // Local 1s tick for the countdown display, scoped to this small component
  // so ChatAppChrome never re-renders for the ad clock.
  const [now, setNow] = useState<number>(() => Date.now());
  const [length, setLength] = useState<CommercialLength>(90);
  useEffect(() => {
    if (!schedule.nextAdAt) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [schedule.nextAdAt]);

  const noSnoozes = schedule.snoozeCount <= 0;
  const running = runningLength !== null;

  return (
    <div className="giveaway-indicator ads-indicator" role="group">
      <button
        type="button"
        className="ads-indicator-main"
        onClick={onOpen}
        title="Click to open Ads Manager"
      >
        <span className="giveaway-indicator-icon">
          <FaAd size={13} />
        </span>
        <span className="giveaway-indicator-meta">
          <span className="giveaway-indicator-title">Ads Manager</span>
          <span className="giveaway-indicator-sub">
            Snoozes left: <strong>{schedule.snoozeCount}</strong>
          </span>
        </span>
        {schedule.nextAdAt ? (
          <span className="giveaway-indicator-time">
            {formatCountdown(schedule.nextAdAt, now)}
            <span className="giveaway-indicator-time-label">to break</span>
          </span>
        ) : null}
      </button>
      <label className="ads-indicator-length">
        <select
          value={length}
          onChange={(e) => setLength(Number(e.target.value) as CommercialLength)}
          disabled={running}
          aria-label="Ad break length"
        >
          {COMMERCIAL_LENGTHS.map((value) => (
            <option key={value} value={value}>
              {value}s
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="ads-indicator-run"
        onClick={() => onRun(length)}
        disabled={running}
        title={`Run a ${length} second ad break now`}
      >
        {running ? `${runningLength}s...` : "Run"}
      </button>
      <button
        type="button"
        className="ads-indicator-snooze"
        onClick={onSnooze}
        disabled={snoozing || noSnoozes}
        title="Pushes back your next ad break by 5 minutes"
        aria-label="Snooze next ad break"
      >
        {snoozing ? "..." : "Snooze"}
      </button>
    </div>
  );
}
