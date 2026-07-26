import { FaTrain } from "react-icons/fa";
import "../../../styles/chat/HypeTrainBanner.css";
import "../../../styles/chat/BannerShell.css";
import BannerShell from "./BannerShell";
import { useCountdownTimer } from "../../../hooks/ui/useCountdownTimer";
import type { HypeTrainState } from "./bannerTypes";

export type { HypeTrainState };

interface HypeTrainBannerProps {
  hypeTrain: HypeTrainState;
  onDismiss: () => void;
}

/**
 * Display-mode Hype Train banner. Renders the progress bar and top
 * contributors while the train is active. Self-dismisses when the
 * timer expires, or after a double-click on the close button.
 */
export default function HypeTrainBanner({
  hypeTrain,
  onDismiss,
}: HypeTrainBannerProps) {
  const { timeDisplay } = useCountdownTimer(hypeTrain.endsAt, {
    onExpire: onDismiss,
  });

  const progressPct = Math.min(
    100,
    (hypeTrain.progress / hypeTrain.goal) * 100,
  );

  return (
    <BannerShell
      tone="hype-train"
      ariaLive="assertive"
      closeAriaLabel="Dismiss hype train notification"
      beforeChildren={
        <div
          className="hype-train-progress"
          style={{ width: `${progressPct}%` }}
          aria-hidden="true"
        />
      }
      badge={<span className="hype-train-badge">HYPE TRAIN</span>}
      icon={<FaTrain className="hype-train-icon" size={16} />}
      title={
        <>
          <span className="hype-train-level">Level {hypeTrain.level}</span>
          <span className="hype-train-points">
            {hypeTrain.totalPoints.toLocaleString()} points
          </span>
        </>
      }
      onDismiss={onDismiss}
      footer={
        <span className="hype-train-timer">Ends in {timeDisplay}</span>
      }
    >
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
            {hypeTrain.topContributors.slice(0, 3).map((contributor) => (
              <span key={contributor.displayName} className="hype-train-contributor">
                {contributor.displayName} ({contributor.points.toLocaleString()}
                )
              </span>
            ))}
          </div>
        )}
      </div>
    </BannerShell>
  );
}
