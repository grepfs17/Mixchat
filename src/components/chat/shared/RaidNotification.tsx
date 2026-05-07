import { useEffect, useState } from 'react';
import { FaTimes } from 'react-icons/fa';
import { FaTwitch } from 'react-icons/fa';
import type { RaidOutEvent } from '../../../hooks/useRaidDetection';
import '../../../styles/chat/RaidNotification.css';

const RAID_TOTAL_SECONDS = 90;
const RAID_COOLDOWN_SECONDS = 10;

interface RaidNotificationProps {
  raid: RaidOutEvent;
  isInitiator?: boolean;
  broadcasterChannel?: string;
  onFollowRaid?: () => void;
  onRaidNow?: () => void;
  onCancelRaid?: () => void;
  onDismiss: () => void;
}

export default function RaidNotification({
  raid,
  isInitiator = false,
  broadcasterChannel,
  onFollowRaid,
  onRaidNow,
  onCancelRaid,
  onDismiss,
}: RaidNotificationProps) {
  const [secondsLeft, setSecondsLeft] = useState(RAID_TOTAL_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) {
      if (isInitiator) {
        onRaidNow?.();
      } else {
        onDismiss();
      }
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft, isInitiator, onRaidNow, onDismiss]);

  const isCooldown = isInitiator && secondsLeft > RAID_TOTAL_SECONDS - RAID_COOLDOWN_SECONDS;
  const cooldownLeft = isCooldown ? secondsLeft - (RAID_TOTAL_SECONDS - RAID_COOLDOWN_SECONDS) : 0;
  const progressPct = (secondsLeft / RAID_TOTAL_SECONDS) * 100;

  return (
    <div className="raid-notification" role="alert" aria-live="assertive">
      <div
        className="raid-progress"
        style={{ width: `${progressPct}%` }}
        aria-hidden="true"
      />

      <div className="raid-notification-header">
        <div className="raid-notification-title">
          <span className="raid-badge">RAID</span>
          <FaTwitch className="raid-twitch-icon" size={13} />
          <span className="raid-channel-name">{raid.targetDisplayName}</span>
        </div>
        {!isInitiator && (
          <button
            className="raid-notification-close"
            onClick={onDismiss}
            aria-label="Dismiss raid notification"
          >
            <FaTimes size={14} />
          </button>
        )}
      </div>

      <p className="raid-notification-body">
        {isInitiator ? (
          <>
            Raid to <strong>{raid.targetDisplayName}</strong> is pending on Twitch.
            Viewers will transfer automatically when the countdown ends.
          </>
        ) : (
          <>
            Raiding <strong>{raid.targetDisplayName}</strong> with{' '}
            <strong>{raid.viewerCount.toLocaleString()}</strong>{' '}
            {raid.viewerCount === 1 ? 'viewer' : 'viewers'}!
          </>
        )}
      </p>

      <div className="raid-notification-footer">
        {isInitiator ? (
          <div className="raid-initiator-controls">
            <div className="raid-initiator-buttons">
              <button
                className="raid-now-btn"
                onClick={onRaidNow}
                disabled={isCooldown}
                title={
                  isCooldown
                    ? `Available in ${cooldownLeft}s`
                    : 'Go to target channel'
                }
              >
                {isCooldown ? `Go to Channel (${cooldownLeft}s)` : 'Go to Channel →'}
              </button>
              <button className="raid-cancel-btn" onClick={onCancelRaid}>
                Cancel
              </button>
            </div>
            <div className="raid-initiator-meta">
              <span className="raid-countdown">
                {isCooldown
                  ? `Preparing… ${cooldownLeft}s`
                  : `Twitch auto-raids in ${secondsLeft}s`}
              </span>
              {broadcasterChannel && (
                <a
                  href={`https://www.twitch.tv/${encodeURIComponent(broadcasterChannel)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="raid-open-twitch-link"
                  title="Open your Twitch channel to see the raid popup"
                >
                  <FaTwitch size={12} />
                  Open on Twitch
                </a>
              )}
            </div>
          </div>
        ) : (
          <>
            <button className="raid-follow-btn" onClick={onFollowRaid}>
              Follow Raid →
            </button>
            <span className="raid-countdown">Closes in {secondsLeft}s</span>
          </>
        )}
      </div>
    </div>
  );
}
