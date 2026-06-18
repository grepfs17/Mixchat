import { useEffect, useState } from "react";
import { FaTimes, FaStar } from "react-icons/fa";
import "../../../styles/chat/CelebrationBanner.css";

export interface CelebrationState {
  id: string;
  userName: string;
  userDisplayName: string;
  bitsUsed: number;
  totalBitsUsed: number;
  messageEffectId: string | null;
  endsAt: Date;
}

interface CelebrationBannerProps {
  celebration: CelebrationState;
  onDismiss: () => void;
}

export default function CelebrationBanner({
  celebration,
  onDismiss,
}: CelebrationBannerProps) {
  const [timeLeft, setTimeLeft] = useState<number>(() => {
    const diff = celebration.endsAt.getTime() - Date.now();
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

  return (
    <div className="celebration-banner" role="alert" aria-live="assertive">
      <div className="celebration-confetti" aria-hidden="true" />

      <div className="celebration-header">
        <div className="celebration-title">
          <span className="celebration-badge">CELEBRATION</span>
          <FaStar className="celebration-icon" size={16} />
          <span className="celebration-user">
            {celebration.userDisplayName}
          </span>
        </div>
        <div className="celebration-close-wrapper">
          {confirmClose && (
            <span className="celebration-close-tooltip">
              Press again to close
            </span>
          )}
          <button
            className="celebration-close"
            onClick={() => {
              if (confirmClose) {
                onDismiss();
              } else {
                setConfirmClose(true);
              }
            }}
            onBlur={() => setConfirmClose(false)}
            aria-label="Dismiss celebration notification"
          >
            <FaTimes size={14} />
          </button>
        </div>
      </div>

      <div className="celebration-body">
        <span className="celebration-bits">
          {celebration.bitsUsed.toLocaleString()} bits
        </span>
      </div>

      <div className="celebration-footer">
        <span className="celebration-timer">{timeLeft}s</span>
      </div>
    </div>
  );
}
