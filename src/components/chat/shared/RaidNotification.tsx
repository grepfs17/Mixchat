import { useEffect, useState } from "react";
import { FaTimes } from "react-icons/fa";
import { FaTwitch } from "react-icons/fa";
import type { RaidOutEvent } from "../../../hooks/chat/eventSub/useRaidDetection";
import "../../../styles/chat/RaidNotification.css";

const RAID_TOTAL_SECONDS = 90;

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
  const [confirmClose, setConfirmClose] = useState(false);

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
        <div className="raid-notification-close-wrapper">
          {confirmClose && (
            <span className="raid-notification-close-tooltip">
              Press again to close
            </span>
          )}
          <button
            className="raid-notification-close"
            onClick={() => {
              if (confirmClose) {
                onDismiss();
              } else {
                setConfirmClose(true);
              }
            }}
            onBlur={() => setConfirmClose(false)}
            aria-label="Dismiss raid notification"
          >
            <FaTimes size={14} />
          </button>
        </div>
      </div>

      <p className="raid-notification-body">
        {isInitiator ? (
          <>
            Raid to <strong>{raid.targetDisplayName}</strong> is pending on
            Twitch. Viewers will transfer automatically when the countdown ends.
            If you want to launch the raid immediately, you must do it from
            Twitch, so please click "Open on Twitch".
          </>
        ) : (
          <>
            Raiding <strong>{raid.targetDisplayName}</strong> with{" "}
            <strong>{raid.viewerCount.toLocaleString()}</strong>{" "}
            {raid.viewerCount === 1 ? "viewer" : "viewers"}!
          </>
        )}
      </p>

      <div className="raid-notification-footer">
        {isInitiator ? (
          <div className="raid-initiator-controls">
            <div className="raid-initiator-buttons">
              <button className="raid-cancel-btn" onClick={onCancelRaid}>
                Cancel
              </button>
              {broadcasterChannel && (
                <a
                  href={`https://www.twitch.tv/${encodeURIComponent(broadcasterChannel)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="raid-open-twitch-btn"
                  title="Open your Twitch channel to see the raid popup"
                >
                  <FaTwitch size={12} />
                  Open on Twitch
                </a>
              )}
            </div>
            <div className="raid-initiator-meta">
              <span className="raid-countdown">
                Twitch auto-raids in {secondsLeft}s
              </span>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  onRaidNow?.();
                }}
                className="raid-open-channel-link"
                title="Go to target channel"
              >
                Go to channel →
              </a>
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
