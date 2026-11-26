import { FaAd, FaForward } from "react-icons/fa";
import "../../../styles/chat/BannerShell.css";
import "../../../styles/chat/AdBreakBanner.css";
import BannerShell from "./BannerShell";
import { useCountdownTimer } from "../../../hooks/ui/useCountdownTimer";
import type { AdBreakNotice } from "../../../hooks/chat/useAdBreakNotice";

interface AdBreakBannerProps {
  notice: AdBreakNotice;
  snoozing: boolean;
  onSnooze: () => void;
  onDismiss: () => void;
}

/**
 * Broadcaster-facing warning shown above chat shortly before an automatic
 * ad break, with Twitch Ads Manager's snooze action. Remounted via key when
 * the scheduled time changes so the countdown restarts.
 */
export default function AdBreakBanner({
  notice,
  snoozing,
  onSnooze,
  onDismiss,
}: AdBreakBannerProps) {
  const { timeDisplay, isExpired } = useCountdownTimer(notice.nextAdAt);

  const canSnooze = !snoozing && notice.snoozeCount > 0;

  return (
    <BannerShell
      tone="ads"
      ariaLive="polite"
      closeAriaLabel="Dismiss ad break notification"
      badge={<span className="ads-banner-badge">Ad break</span>}
      icon={<FaAd className="ads-banner-icon" size={14} />}
      title={
        <span className="ads-banner-title">
          {isExpired ? "An ad break is starting" : "An ad break will start in "}
          {!isExpired && <strong className="ads-banner-countdown">{timeDisplay}</strong>}
        </span>
      }
      onDismiss={onDismiss}
      footer={
        <>
          <span className="ads-banner-snoozes">
            Snoozes available: {notice.snoozeCount}
          </span>
          <button
            type="button"
            className="ads-banner-snooze"
            onClick={onSnooze}
            disabled={!canSnooze}
            title="Pushes back your next ad break by 5 minutes"
          >
            <FaForward size={10} />
            {snoozing ? "Snoozing..." : "Snooze"}
          </button>
        </>
      }
    >
      <span className="ads-banner-hint">
        Snoozing pushes your next ad break back by 5 minutes.
      </span>
    </BannerShell>
  );
}
