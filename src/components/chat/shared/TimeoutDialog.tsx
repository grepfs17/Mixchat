import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface TimeoutDialogConfig {
  /** Preset durations shown as radio chips. */
  presets: ReadonlyArray<{ seconds: number; label: string }>;
  /** Inclusive lower bound for the custom-duration input. */
  minSeconds: number;
  /** Inclusive upper bound for the custom-duration input. */
  maxSeconds: number;
  /** Format a seconds value for the OK button label. */
  formatDuration: (seconds: number) => string;
  /** Subtitle shown under the title (e.g. "Applies to this channel."). */
  subtitle: string;
  /** Index of the preset to preselect. */
  defaultPresetIndex: number;
}

interface TimeoutDialogProps {
  userId: string;
  username: string;
  onConfirm: (userId: string, seconds: number, username: string) => void;
  onClose: () => void;
  config: TimeoutDialogConfig;
}

const MULTIPLIERS = { s: 1, m: 60, h: 3600, d: 86400 } as const;
type TimeUnit = keyof typeof MULTIPLIERS;

function clampToRange(seconds: number, config: TimeoutDialogConfig): number {
  return Math.max(
    config.minSeconds,
    Math.min(seconds, config.maxSeconds),
  );
}

/**
 * Unified timeout dialog used by both Twitch and YouTube moderation
 * flows. The platform-specific wrappers (`TwitchTimeoutDialog` and
 * `YouTubeTimeoutDialog`) inject a `TimeoutDialogConfig` so the markup,
 * keyboard handling, and visual design stay single-sourced here.
 */
export default function TimeoutDialog({
  userId,
  username,
  onConfirm,
  onClose,
  config,
}: TimeoutDialogProps) {
  const [selectedIndex, setSelectedIndex] = useState(
    config.defaultPresetIndex,
  );
  const [showCustom, setShowCustom] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [customUnit, setCustomUnit] = useState<TimeUnit>("m");
  const dialogRef = useRef<HTMLDivElement>(null);
  const okButtonRef = useRef<HTMLButtonElement>(null);

  const presets = config.presets;

  const currentSeconds = (() => {
    if (selectedIndex < 0) {
      const n = parseInt(customValue, 10);
      if (!Number.isFinite(n) || n <= 0) return 0;
      return clampToRange(n * MULTIPLIERS[customUnit], config);
    }
    return presets[selectedIndex]?.seconds ?? 0;
  })();

  // Mount-only: focus the OK button when the dialog opens. Keeping this
  // out of the keydown effect's dep list prevents focus from being
  // re-acquired (and stolen from the custom input) on every keystroke.
  useEffect(() => {
    okButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (currentSeconds > 0) onConfirm(userId, currentSeconds, username);
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        setShowCustom(false);
        setSelectedIndex((i) => (i + 1) % presets.length);
        return;
      }
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        setShowCustom(false);
        setSelectedIndex((i) => (i - 1 + presets.length) % presets.length);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [userId, currentSeconds, onConfirm, onClose, presets.length, username]);

  const handleCustomSubmit = () => {
    const n = parseInt(customValue, 10);
    if (!Number.isFinite(n) || n <= 0) return;
    const seconds = clampToRange(n * MULTIPLIERS[customUnit], config);
    onConfirm(userId, seconds, username);
  };

  return createPortal(
    <div
      role="presentation"
      className="yt-timeout-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="yt-timeout-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Timeout ${username}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="yt-timeout-title">Timeout {username}?</div>
        <div className="yt-timeout-subtitle">{config.subtitle}</div>

        <div
          className="yt-timeout-presets"
          role="radiogroup"
          aria-label="Duration"
        >
          {presets.map((opt, i) => {
            const selected = !showCustom && i === selectedIndex;
            return (
              <button
                key={opt.seconds}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`yt-timeout-preset${selected ? " is-selected" : ""}`}
                onClick={() => {
                  setShowCustom(false);
                  setSelectedIndex(i);
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="yt-timeout-custom">
          {!showCustom ? (
            <button
              type="button"
              className="yt-timeout-link"
              onClick={() => {
                setShowCustom(true);
                setSelectedIndex(-1);
              }}
            >
              Custom…
            </button>
          ) : (
            <div className="yt-timeout-custom-row">
              <input
                type="number"
                min={1}
                value={customValue}
                placeholder="Duration"
                aria-label="Timeout duration"
                onChange={(e) => setCustomValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCustomSubmit();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    onClose();
                  }
                }}
                autoFocus
                className="yt-timeout-input"
              />
  <select
    value={customUnit}
    onChange={(e) => setCustomUnit(e.target.value as TimeUnit)}
    className="yt-timeout-unit"
    aria-label="Timeout unit"
              >
                <option value="s">sec</option>
                <option value="m">min</option>
                <option value="h">hr</option>
                <option value="d">day</option>
              </select>
            </div>
          )}
        </div>

        <div className="yt-timeout-actions">
          <button
            type="button"
            className="yt-timeout-btn yt-timeout-btn--cancel"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            ref={okButtonRef}
            className="yt-timeout-btn yt-timeout-btn--ok"
            disabled={currentSeconds <= 0}
            onClick={() => onConfirm(userId, currentSeconds, username)}
          >
            {currentSeconds > 0
              ? `Timeout ${config.formatDuration(currentSeconds)}`
              : "Timeout"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
