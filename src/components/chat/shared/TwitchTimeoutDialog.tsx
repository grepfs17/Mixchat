import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  TWITCH_TIMEOUT_PRESETS,
  TWITCH_MAX_TIMEOUT_SECONDS,
  TWITCH_MIN_TIMEOUT_SECONDS,
  formatTwitchTimeoutDuration,
} from "../../../lib/twitchTimeoutPresets";

interface TwitchTimeoutDialogProps {
  userId: string;
  username: string;
  onConfirm: (userId: string, seconds: number, username: string) => void;
  onClose: () => void;
}

const DEFAULT_PRESET_INDEX = 3; // 5 minutes

export default function TwitchTimeoutDialog({
  userId,
  username,
  onConfirm,
  onClose,
}: TwitchTimeoutDialogProps) {
  const [selectedIndex, setSelectedIndex] = useState(DEFAULT_PRESET_INDEX);
  const [showCustom, setShowCustom] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [customUnit, setCustomUnit] = useState<"s" | "m" | "h" | "d">("m");
  const dialogRef = useRef<HTMLDivElement>(null);
  const okButtonRef = useRef<HTMLButtonElement>(null);

  const presets = TWITCH_TIMEOUT_PRESETS;

  const currentSeconds = (() => {
    if (selectedIndex < 0) {
      const n = parseInt(customValue, 10);
      if (!Number.isFinite(n) || n <= 0) return 0;
      const multipliers = { s: 1, m: 60, h: 3600, d: 86400 } as const;
      return Math.max(
        TWITCH_MIN_TIMEOUT_SECONDS,
        Math.min(n * multipliers[customUnit], TWITCH_MAX_TIMEOUT_SECONDS),
      );
    }
    return presets[selectedIndex]?.seconds ?? 0;
  })();

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
    okButtonRef.current?.focus();
    return () => window.removeEventListener("keydown", handleKey);
  }, [userId, currentSeconds, onConfirm, onClose, presets.length, username]);

  const handleCustomSubmit = () => {
    const n = parseInt(customValue, 10);
    if (!Number.isFinite(n) || n <= 0) return;
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400 } as const;
    const seconds = Math.max(
      TWITCH_MIN_TIMEOUT_SECONDS,
      Math.min(n * multipliers[customUnit], TWITCH_MAX_TIMEOUT_SECONDS),
    );
    onConfirm(userId, seconds, username);
  };

  return createPortal(
    <div
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
        <div className="yt-timeout-subtitle">
          Applies to this channel. Max 14 days.
        </div>

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
                onChange={(e) =>
                  setCustomUnit(e.target.value as "s" | "m" | "h" | "d")
                }
                className="yt-timeout-unit"
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
              ? `Timeout ${formatTwitchTimeoutDuration(currentSeconds)}`
              : "Timeout"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
