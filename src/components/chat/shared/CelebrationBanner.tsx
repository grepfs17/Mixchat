import { FaStar } from "react-icons/fa";
import "../../../styles/chat/CelebrationBanner.css";
import "../../../styles/chat/BannerShell.css";
import BannerShell from "./BannerShell";
import { useCountdownTimer } from "../../../hooks/ui/useCountdownTimer";
import type { CelebrationState } from "./bannerTypes";

export type { CelebrationState };

interface CelebrationBannerProps {
  celebration: CelebrationState;
  onDismiss: () => void;
}

/**
 * Display-mode celebration banner. Renders when a viewer cheers enough
 * bits to trigger a Twitch celebration. Self-dismisses when the timer
 * expires, or after a double-click on the close button.
 */
export default function CelebrationBanner({
  celebration,
  onDismiss,
}: CelebrationBannerProps) {
  const { timeLeft } = useCountdownTimer(celebration.endsAt, {
    onExpire: onDismiss,
  });

  return (
    <BannerShell
      tone="celebration"
      ariaLive="assertive"
      closeAriaLabel="Dismiss celebration notification"
      beforeChildren={
        <div className="celebration-confetti" aria-hidden="true" />
      }
      badge={<span className="celebration-badge">CELEBRATION</span>}
      icon={<FaStar className="celebration-icon" size={16} />}
      title={
        <span className="celebration-user">
          {celebration.userDisplayName}
        </span>
      }
      onDismiss={onDismiss}
      footer={<span className="celebration-timer">{timeLeft}s</span>}
    >
      <div className="celebration-body">
        <span className="celebration-bits">
          {celebration.bitsUsed.toLocaleString()} bits
        </span>
      </div>
    </BannerShell>
  );
}
