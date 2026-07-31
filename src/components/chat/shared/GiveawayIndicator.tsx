import { useEffect, useState } from "react";
import { FaTwitch, FaWrench, FaYoutube } from "react-icons/fa";
import type { UseGiveawayResult } from "../../../hooks/chat/useGiveaway";

interface GiveawayIndicatorProps {
  giveaway: UseGiveawayResult;
  onOpen: () => void;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSeconds = Math.ceil(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function GiveawayIndicator({
  giveaway,
  onOpen,
}: GiveawayIndicatorProps) {
  const { phase, keyword, endsAt, startedAt, liveEntries } =
    giveaway;

  // Local 1s tick for the countdown display — scoped to this small component
  // so ChatApp never re-renders for the giveaway clock.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (phase !== "running") return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  const remainingMs = endsAt !== null ? Math.max(0, endsAt - now) : 0;
  const elapsedMs = startedAt !== null ? Math.max(0, now - startedAt) : 0;

  if (phase === "config") return null;

  const isUnlimited = endsAt === Number.POSITIVE_INFINITY;
  const time = isUnlimited ? elapsedMs : remainingMs;
  const timeLabel = isUnlimited ? "elapsed" : "left";
  const platformIcon =
    giveaway.winner?.platform === "twitch" ? (
      <FaTwitch size={11} />
    ) : giveaway.winner?.platform === "youtube" ? (
      <FaYoutube size={11} />
    ) : null;

  return (
    <button type="button"
      className={`giveaway-indicator giveaway-indicator--${phase}`}
      onClick={onOpen}
      title="Click to open giveaway tool"
    >
      <span className="giveaway-indicator-icon">
        <FaWrench size={13} />
      </span>
      <span className="giveaway-indicator-meta">
        <span className="giveaway-indicator-title">
          {phase === "running" ? "Giveaway running" : "Giveaway ready"}
        </span>
        <span className="giveaway-indicator-sub">
          <strong>{keyword.trim()}</strong> · {liveEntries.length} entr
          {liveEntries.length === 1 ? "y" : "ies"}
          {phase === "revealed" && platformIcon && (
            <span className="giveaway-indicator-platform">{platformIcon}</span>
          )}
        </span>
      </span>
      <span className="giveaway-indicator-time">
        {formatCountdown(time)}
        <span className="giveaway-indicator-time-label">{timeLabel}</span>
      </span>
    </button>
  );
}
