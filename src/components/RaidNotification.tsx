import { useEffect, useState } from 'react';
import { FaTimes } from 'react-icons/fa';
import { FaTwitch } from 'react-icons/fa';
import type { RaidOutEvent } from '../hooks/useRaidDetection';
import '../styles/RaidNotification.css';

const AUTO_DISMISS_SECONDS = 90;

interface RaidNotificationProps {
  raid: RaidOutEvent;
  onFollowRaid: () => void;
  onDismiss: () => void;
}

export default function RaidNotification({
  raid,
  onFollowRaid,
  onDismiss,
}: RaidNotificationProps) {
  const [secondsLeft, setSecondsLeft] = useState(AUTO_DISMISS_SECONDS);

  
  useEffect(() => {
    if (secondsLeft <= 0) {
      onDismiss();
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft, onDismiss]);

  const progressPct = (secondsLeft / AUTO_DISMISS_SECONDS) * 100;

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
        <button
          className="raid-notification-close"
          onClick={onDismiss}
          aria-label="Dismiss raid notification"
        >
          <FaTimes size={14} />
        </button>
      </div>

      <p className="raid-notification-body">
        Raiding <strong>{raid.targetDisplayName}</strong> with{' '}
        <strong>{raid.viewerCount.toLocaleString()}</strong>{' '}
        {raid.viewerCount === 1 ? 'viewer' : 'viewers'}!
      </p>

      <div className="raid-notification-footer">
        <button className="raid-follow-btn" onClick={onFollowRaid}>
          Follow Raid →
        </button>
        <span className="raid-countdown">Closes in {secondsLeft}s</span>
      </div>
    </div>
  );
}
