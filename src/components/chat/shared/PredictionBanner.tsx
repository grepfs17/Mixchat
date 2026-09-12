import { useEffect, useMemo } from "react";
import { FaMagic } from "react-icons/fa";
import "../../../styles/chat/PredictionBanner.css";
import "../../../styles/chat/BannerShell.css";
import BannerShell from "./BannerShell";
import { useCountdownTimer } from "../../../hooks/ui/useCountdownTimer";
import type { PredictionOutcome, PredictionState } from "./bannerTypes";

export type { PredictionState };

interface PredictionBannerProps {
  prediction: PredictionState;
  onDismiss: () => void;
}

const outcomeBarColor = (color: string, isWinner: boolean): string => {
  if (isWinner) return "var(--color-green)";
  if (color === "blue") return "var(--color-twitch)";
  return "var(--color-accent)";
};

/**
 * Display-mode prediction banner. Renders outcomes with channel-points
 * bars; once the prediction is resolved, the winning outcome gets a
 * green ring and "Winner" badge. Self-dismisses 8s after the prediction
 * ends.
 */
export default function PredictionBanner({
  prediction,
  onDismiss,
}: PredictionBannerProps) {
  const isActive = prediction.status === "active";
  const isLocked = prediction.status === "locked";
  const isEnded =
    prediction.status === "resolved" || prediction.status === "canceled";

  const { timeDisplay } = useCountdownTimer(prediction.endsAt);

  // Independent 8s auto-dismiss once the prediction ends.
  useEffect(() => {
    if (!isEnded) return;
    const timer = setTimeout(onDismiss, 8000);
    return () => clearTimeout(timer);
  }, [isEnded, onDismiss]);

  const totalPoints = useMemo(
    () => prediction.outcomes.reduce((sum, o) => sum + o.channelPoints, 0) || 1,
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

  return (
    <BannerShell
      tone="prediction"
      ariaLive="polite"
      closeAriaLabel="Dismiss prediction notification"
      badge={
        <span
          className={`prediction-banner-badge${isEnded ? " prediction-banner-badge--ended" : ""}${isLocked ? " prediction-banner-badge--locked" : ""}`}
        >
          {statusLabel}
        </span>
      }
      icon={<FaMagic className="prediction-banner-icon" size={14} />}
      title={
        <span className="prediction-banner-question">{prediction.title}</span>
      }
      onDismiss={onDismiss}
      footer={
        <>
          <span className="prediction-banner-total">
            {totalUsers.toLocaleString()} predictors ·{" "}
            {prediction.outcomes
              .reduce((s, o) => s + o.channelPoints, 0)
              .toLocaleString()}{" "}
            points
          </span>
          {isActive && prediction.endsAt && (
            <span className="prediction-banner-timer">
              Ends in {timeDisplay}
            </span>
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
        </>
      }
    >
      <div className="prediction-banner-outcomes">
        {prediction.outcomes.map((outcome) => {
          const pct =
            totalPoints > 1
              ? Math.round((outcome.channelPoints / totalPoints) * 100)
              : 50;
          const barWidth = Math.max(
            4,
            (outcome.channelPoints / maxPoints) * 100,
          );
          const isWinner = prediction.winningOutcomeId === outcome.id;

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
    </BannerShell>
  );
}
