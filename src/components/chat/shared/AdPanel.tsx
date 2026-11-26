import { useCallback, useEffect, useRef, useState } from "react";
import { FaAd, FaForward } from "react-icons/fa";
import {
  getTwitchAdSchedule,
  snoozeTwitchNextAd,
  startTwitchCommercial,
  type TwitchAdSchedule,
} from "../../../lib/twitch";
import { useCountdownTimer } from "../../../hooks/ui/useCountdownTimer";

interface AdPanelProps {
  /** Broadcaster ID of the channel being watched. Empty when not own channel. */
  broadcasterId: string;
  /**
   * Dev-preview mode: renders with fabricated schedule data and simulates
   * snooze/run actions without calling the API.
   */
  preview?: boolean;
}

const COMMERCIAL_LENGTHS: Array<{
  value: 30 | 60 | 90 | 120 | 150 | 180;
  label: string;
}> = [
  { value: 30, label: "30s" },
  { value: 60, label: "60s" },
  { value: 90, label: "90s" },
  { value: 120, label: "120s" },
  { value: 150, label: "150s" },
  { value: 180, label: "180s" },
];

const SCHEDULE_POLL_MS = 20_000;

/** Fabricated schedule for the dev preview page (no network calls). */
function makePreviewSchedule(): TwitchAdSchedule {
  return {
    snoozeCount: 2,
    snoozeRefreshAt: null,
    nextAdAt: new Date(Date.now() + 7 * 60_000 + 32_000).toISOString(),
    lastAdAt: new Date(Date.now() - 23 * 60_000).toISOString(),
    prerollFreeTimeSeconds: 322,
  };
}

function formatClock(iso: string | null): string {
  if (!iso) return "never";
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = Math.floor(total % 60);
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

/** Live countdown to the next scheduled ad break. Remounted via key when the schedule changes. */
function NextAdCountdown({
  nextAdAt,
  onExpire,
}: {
  nextAdAt: string | null;
  onExpire: () => void;
}) {
  const { timeDisplay, isExpired } = useCountdownTimer(
    nextAdAt ? new Date(nextAdAt) : null,
    { onExpire },
  );
  if (!nextAdAt) return <span>No ad break scheduled</span>;
  return (
    <span>
      {isExpired ? "Ad break due" : `Next ad break in ${timeDisplay}`}
    </span>
  );
}

/**
 * Broadcaster ad controls, mirroring Twitch's Ads Manager: the next
 * scheduled ad break, snoozes, and running a manual ad break.
 * Only the broadcaster's token can call these endpoints, so this panel
 * is only reachable on own channel.
 */
export default function AdPanel({ broadcasterId, preview = false }: AdPanelProps) {
  const [schedule, setSchedule] = useState<TwitchAdSchedule | null>(
    preview ? makePreviewSchedule() : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [snoozing, setSnoozing] = useState(false);
  const [runningLength, setRunningLength] = useState<number | null>(null);
  const [selectedLength, setSelectedLength] = useState<30 | 60 | 90 | 120 | 150 | 180>(90);
  const [notice, setNotice] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (preview || !broadcasterId) return;
    try {
      const next = await getTwitchAdSchedule(broadcasterId);
      setSchedule(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ad schedule");
    }
  }, [preview, broadcasterId]);

  useEffect(() => {
    if (preview) return;
    void load();
    pollTimer.current = setInterval(() => void load(), SCHEDULE_POLL_MS);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [load, preview, broadcasterId]);

  const handleSnooze = async () => {
    if (snoozing) return;
    setSnoozing(true);
    setError(null);
    try {
      if (preview) {
        // Simulate: next break pushed back 5 minutes, one snooze consumed.
        setSchedule((prev) =>
          prev
            ? {
                ...prev,
                snoozeCount: Math.max(0, prev.snoozeCount - 1),
                nextAdAt: new Date(
                  (prev.nextAdAt ? new Date(prev.nextAdAt).getTime() : Date.now()) +
                    5 * 60_000,
                ).toISOString(),
              }
            : prev,
        );
        setNotice("Snoozed. Next ad break pushed back by 5 minutes.");
      } else {
        const next = await snoozeTwitchNextAd(broadcasterId, schedule ?? undefined);
        setSchedule(next);
        setNotice("Snoozed. Next ad break pushed back by 5 minutes.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to snooze ad");
    } finally {
      setSnoozing(false);
    }
  };

  const handleRun = async () => {
    if (runningLength !== null) return;
    setRunningLength(selectedLength);
    setError(null);
    setNotice(null);
    try {
      if (preview) {
        // Simulate: ad runs now, pre-roll-free time granted, next break reset.
        setSchedule((prev) =>
          prev
            ? {
                ...prev,
                lastAdAt: new Date().toISOString(),
                nextAdAt: null,
                prerollFreeTimeSeconds: selectedLength * 10,
              }
            : prev,
        );
        setNotice(`Running a ${selectedLength} second ad break.`);
      } else {
        const result = await startTwitchCommercial(broadcasterId, selectedLength);
        setNotice(result.message || `Running a ${selectedLength} second ad break.`);
        // Refresh the schedule so the countdown reflects the reset.
        setTimeout(() => void load(), 2_000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run ad break");
    } finally {
      setRunningLength(null);
    }
  };

  const noSnoozes = !schedule || schedule.snoozeCount <= 0;

  return (
    <div className="poll-panel">
      {error && <p className="poll-error">{error}</p>}
      {!broadcasterId && (
        <p className="poll-hint">
          Connect to Twitch as the broadcaster to manage ads.
        </p>
      )}
      {!error && broadcasterId && !schedule && (
        <p className="poll-hint">Loading ad schedule...</p>
      )}

      {schedule && (
        <div className="poll-form">
          <div className="poll-field">
            <span className="poll-field-label">Ad break</span>
            <NextAdCountdown
              key={schedule.nextAdAt ?? "none"}
              nextAdAt={schedule.nextAdAt}
              onExpire={() => void load()}
            />
          </div>

          {schedule.prerollFreeTimeSeconds > 0 && (
            <p className="poll-hint">
              Pre-roll free for {formatSeconds(schedule.prerollFreeTimeSeconds)}
            </p>
          )}

          <div className="poll-field">
            <span className="poll-field-label">
              Snoozes available: {schedule.snoozeCount}
            </span>
            <button
              type="button"
              className="poll-btn poll-btn--primary"
              onClick={() => void handleSnooze()}
              disabled={snoozing || noSnoozes}
              title="Pushes back your next ad break by 5 minutes"
            >
              <FaForward size={12} />
              {snoozing ? "Snoozing..." : "Snooze"}
            </button>
            <span className="poll-field-hint">
              Snoozing pushes your next ad break back by 5 minutes.
            </span>
          </div>

          <div className="poll-field">
            <span className="poll-field-label">Ad length</span>
            <div className="poll-duration-presets">
              {COMMERCIAL_LENGTHS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  className={`poll-preset${selectedLength === preset.value ? " poll-preset--active" : ""}`}
                  onClick={() => setSelectedLength(preset.value)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="poll-btn poll-btn--primary"
              onClick={() => void handleRun()}
              disabled={runningLength !== null}
            >
              <FaAd size={12} />
              {runningLength !== null ? "Running..." : "Run Ad Break"}
            </button>
            <span className="poll-field-hint">
              Last ad break at {formatClock(schedule.lastAdAt)}. Twitch allows a
              new ad break 8 minutes after the previous one.
            </span>
          </div>

          {notice && <p className="poll-hint">{notice}</p>}
        </div>
      )}
    </div>
  );
}
