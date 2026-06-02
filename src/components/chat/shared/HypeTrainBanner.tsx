import { useEffect, useState } from "react";
import { FaTimes, FaTrain } from "react-icons/fa";
import "../../../styles/chat/HypeTrainBanner.css";

export interface HypeTrainState {
  level: number;
  progress: number;
  goal: number;
  totalPoints: number;
  topContributors: Array<{ displayName: string; points: number }>;
  endsAt: Date;
}

interface HypeTrainBannerProps {
  hypeTrain: HypeTrainState;
  onDismiss: () => void;
}

export default function HypeTrainBanner({
  hypeTrain,
  onDismiss,
}: HypeTrainBannerProps) {
  const [timeLeft, setTimeLeft] = useState<number>(() => {
    const diff = hypeTrain.endsAt.getTime() - Date.now();
    return Math.max(0, Math.floor(diff / 1000));
  });

  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    if (timeLeft <= 0) {
      onDismiss();
      return;
    }
    const timer = setTimeout(
      () => setTimeLeft((t) => Math.max(0, t - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [timeLeft, onDismiss]);

  const progressPct = Math.min(
    100,
    (hypeTrain.progress / hypeTrain.goal) * 100,
  );
  const minutesLeft = Math.floor(timeLeft / 60);
  const secondsLeft = timeLeft % 60;
  const timeDisplay =
    minutesLeft > 0 ? `${minutesLeft}m ${secondsLeft}s` : `${secondsLeft}s`;

  const formatTime = (date: Date) => {
    const now = Date.now();
    const diff = date.getTime() - now;
    if (diff <= 0) return "ended";
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m`;
  };

  return (
    <div className="hype-train-banner" role="alert" aria-live="assertive">
      <div
        className="hype-train-progress"
        style={{ width: `${progressPct}%` }}
        aria-hidden="true"
      />

      <div className="hype-train-header">
        <div className="hype-train-title">
          <span className="hype-train-badge">HYPE TRAIN</span>
          <FaTrain className="hype-train-icon" size={16} />
          <span className="hype-train-level">Level {hypeTrain.level}</span>
          <span className="hype-train-points">
            {hypeTrain.totalPoints.toLocaleString()} points
          </span>
        </div>
        <div className="hype-train-close-wrapper">
          {confirmClose && (
            <span className="hype-train-close-tooltip">
              Press again to close
            </span>
          )}
          <button
            className="hype-train-close"
            onClick={() => {
              if (confirmClose) {
                onDismiss();
              } else {
                setConfirmClose(true);
              }
            }}
            onBlur={() => setConfirmClose(false)}
            aria-label="Dismiss hype train notification"
          >
            <FaTimes size={14} />
          </button>
        </div>
      </div>

      <div className="hype-train-body">
        <div className="hype-train-progress-bar">
          <div
            className="hype-train-progress-fill"
            style={{ width: `${progressPct}%` }}
          />
          <span className="hype-train-progress-text">
            {hypeTrain.progress} / {hypeTrain.goal}
          </span>
        </div>
        {hypeTrain.topContributors.length > 0 && (
          <div className="hype-train-contributors">
            <span className="hype-train-contributors-label">Top:</span>
            {hypeTrain.topContributors.slice(0, 3).map((contributor, idx) => (
              <span key={idx} className="hype-train-contributor">
                {contributor.displayName} ({contributor.points.toLocaleString()}
                )
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="hype-train-footer">
        <span className="hype-train-timer">Ends in {timeDisplay}</span>
      </div>
    </div>
  );
}
