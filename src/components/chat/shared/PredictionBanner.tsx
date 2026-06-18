import { useEffect, useState, useMemo } from "react";
import { FaTimes, FaMagic } from "react-icons/fa";
import "../../../styles/chat/PredictionBanner.css";

export interface PredictionOutcome {
  id: string;
  title: string;
  color: string;
  users: number;
  channelPoints: number;
}

export interface PredictionState {
  id: string;
  title: string;
  outcomes: PredictionOutcome[];
  totalPoints: number;
  totalUsers: number;
  status: "active" | "locked" | "resolved" | "canceled";
  winningOutcomeId?: string;
  endsAt?: Date;
  lockedAt?: Date;
}

interface PredictionBannerProps {
  prediction: PredictionState;
  onDismiss: () => void;
}

export default function PredictionBanner({
  prediction,
  onDismiss,
}: PredictionBannerProps) {
  const [timeLeft, setTimeLeft] = useState<number>(() => {
    if (!prediction.endsAt) return 0;
    const diff = prediction.endsAt.getTime() - Date.now();
    return Math.max(0, Math.floor(diff / 1000));
  });

  const [confirmClose, setConfirmClose] = useState(false);

  const isActive = prediction.status === "active";
  const isLocked = prediction.status === "locked";
  const isEnded =
    prediction.status === "resolved" || prediction.status === "canceled";

  useEffect(() => {
    if (isEnded) {
      const timer = setTimeout(() => onDismiss(), 8000);
      return () => clearTimeout(timer);
    }
    if (timeLeft <= 0) return;
    const timer = setTimeout(
      () => setTimeLeft((t) => Math.max(0, t - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [timeLeft, isEnded, onDismiss]);

  const minutesLeft = Math.floor(timeLeft / 60);
  const secondsLeft = timeLeft % 60;
  const timeDisplay =
    minutesLeft > 0 ? `${minutesLeft}m ${secondsLeft}s` : `${secondsLeft}s`;

  const totalPoints = useMemo(
    () =>
      prediction.outcomes.reduce((sum, o) => sum + o.channelPoints, 0) || 1,
    [prediction.outcomes],
  );

  const maxPoints = useMemo(
    () => Math.max(1, ...prediction.outcomes.map((o) => o.channelPoints)),
    [prediction.outcomes],
  );

  const totalUsers = useMemo(
    () => prediction.outcomes.reduce((sum, o) => sum + o.users, 0),
    [prediction.outcomes],
  );

  const statusLabel = isActive
    ? "Live Prediction"
    : isLocked
      ? "Locked"
      : prediction.status === "canceled"
        ? "Canceled"
        : prediction.status === "resolved"
          ? "Result"
          : "Prediction";

  const outcomeColor = (color: string, isWinner: boolean) => {
    if (isWinner) return "var(--color-green)";
    if (color === "blue") return "var(--color-twitch)";
    return "var(--color-accent)";
  };

  const outcomeBarColor = (color: string, isWinner: boolean) => {
    if (isWinner)
      return "linear-gradient(90deg, #22c55e 0%, #4ade80 100%)";
    if (color === "blue")
      return "linear-gradient(90deg, var(--color-twitch) 0%, var(--color-indigo) 100%)";
    return "linear-gradient(90deg, var(--color-accent) 0%, #d946ef 100%)";
  };

  return (
    <div className="prediction-banner" role="alert" aria-live="polite">
      <div className="prediction-banner-header">
        <div className="prediction-banner-title">
          <span
            className={`prediction-banner-badge${isEnded ? " prediction-banner-badge--ended" : ""}${isLocked ? " prediction-banner-badge--locked" : ""}`}
          >
            {statusLabel}
          </span>
          <FaMagic className="prediction-banner-icon" size={14} />
          <span className="prediction-banner-question">{prediction.title}</span>
        </div>
        <div className="prediction-banner-close-wrapper">
          {confirmClose && (
            <span className="prediction-banner-close-tooltip">
              Press again to close
            </span>
          )}
          <button
            className="prediction-banner-close"
            onClick={() => {
              if (confirmClose) {
                onDismiss();
              } else {
                setConfirmClose(true);
              }
            }}
            onBlur={() => setConfirmClose(false)}
            aria-label="Dismiss prediction notification"
          >
            <FaTimes size={14} />
          </button>
        </div>
      </div>

      <div className="prediction-banner-outcomes">
        {prediction.outcomes.map((outcome) => {
          const pct =
            totalPoints > 1
              ? Math.round((outcome.channelPoints / totalPoints) * 100)
              : 50;
          const barWidth = Math.max(4, (outcome.channelPoints / maxPoints) * 100);
          const isWinner =
            prediction.winningOutcomeId === outcome.id;

          return (
            <div
              key={outcome.id}
              className={`prediction-banner-outcome${isWinner ? " prediction-banner-outcome--winner" : ""}`}
            >
              <div className="prediction-banner-outcome-bar-bg">
                <div
                  className="prediction-banner-outcome-bar-fill"
                  style={{
                    width: `${barWidth}%`,
                    background: outcomeBarColor(outcome.color, isWinner),
                  }}
                />
              </div>
              <div className="prediction-banner-outcome-content">
                <span
                  className="prediction-banner-outcome-title"
                  style={{ color: isWinner ? "var(--color-green)" : undefined }}
                >
                  {outcome.title}
                </span>
                <span className="prediction-banner-outcome-meta">
                  {outcome.channelPoints.toLocaleString()} pts · {pct}%
                  {outcome.users > 0 && ` · ${outcome.users}`}
                </span>
              </div>
              {isWinner && (
                <span className="prediction-banner-winner-badge">Winner</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="prediction-banner-footer">
        <span className="prediction-banner-total">
          {totalUsers.toLocaleString()} predictors ·{" "}
          {prediction.outcomes.reduce((s, o) => s + o.channelPoints, 0).toLocaleString()} points
        </span>
        {isActive && prediction.endsAt && (
          <span className="prediction-banner-timer">Ends in {timeDisplay}</span>
        )}
        {isLocked && (
          <span className="prediction-banner-timer prediction-banner-timer--locked">
            Locked — waiting for result
          </span>
        )}
        {isEnded && (
          <span className="prediction-banner-timer prediction-banner-timer--ended">
            Final result
          </span>
        )}
      </div>
    </div>
  );
}