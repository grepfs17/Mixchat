import { createPortal } from "react-dom";
import { useState } from "react";
import {
  YOUTUBE_TIMEOUT_PRESETS,
  YOUTUBE_MAX_TIMEOUT_SECONDS,
  YOUTUBE_MIN_TIMEOUT_SECONDS,
  formatTimeoutDuration,
} from "../../../lib/youTubeTimeoutPresets";

interface YouTubeTimeoutMenuProps {
  channelId: string;
  username: string;
  x: number;
  y: number;
  onTimeout: (channelId: string, seconds: number, username: string) => void;
  onClose: () => void;
}

export default function YouTubeTimeoutMenu({
  channelId,
  username,
  x,
  y,
  onTimeout,
  onClose,
}: YouTubeTimeoutMenuProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [customUnit, setCustomUnit] = useState<"s" | "m" | "h" | "d">("m");

  const handleCustomSubmit = () => {
    const n = parseInt(customValue, 10);
    if (!Number.isFinite(n) || n <= 0) return;
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400 } as const;
    const seconds = Math.max(
      YOUTUBE_MIN_TIMEOUT_SECONDS,
      Math.min(n * multipliers[customUnit], YOUTUBE_MAX_TIMEOUT_SECONDS),
    );
    onTimeout(channelId, seconds, username);
    onClose();
  };

  return createPortal(
    <div
      className="mod-context-menu"
      onContextMenu={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        top: y,
        right: window.innerWidth - x,
        left: "auto",
        zIndex: 9999,
      }}
    >
      <div className="mod-context-menu-header">
        Timeout {username} (this chat)
      </div>
      {YOUTUBE_TIMEOUT_PRESETS.map((opt) => (
        <button
          key={opt.seconds}
          onClick={() => {
            onTimeout(channelId, opt.seconds, username);
            onClose();
          }}
        >
          {opt.label}
        </button>
      ))}
      {!showCustom ? (
        <button
          onClick={() => setShowCustom(true)}
          title={`Custom (1s – ${formatTimeoutDuration(YOUTUBE_MAX_TIMEOUT_SECONDS)})`}
        >
          Custom…
        </button>
      ) : (
        <div className="mod-context-menu-custom">
          <input
            type="number"
            min={1}
            value={customValue}
            placeholder="Duration"
            onChange={(e) => setCustomValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCustomSubmit();
              if (e.key === "Escape") onClose();
            }}
            autoFocus
            style={{ width: "60px" }}
          />
          <select
            value={customUnit}
            onChange={(e) =>
              setCustomUnit(e.target.value as "s" | "m" | "h" | "d")
            }
          >
            <option value="s">sec</option>
            <option value="m">min</option>
            <option value="h">hr</option>
            <option value="d">day</option>
          </select>
          <button onClick={handleCustomSubmit} title="Apply">
            ✓
          </button>
          <button
            onClick={() => {
              setShowCustom(false);
              setCustomValue("");
            }}
            title="Cancel"
          >
            ×
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}
