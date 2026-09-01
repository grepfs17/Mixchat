import { useEffect, useRef, useState } from "react";
import { FaTimes } from "react-icons/fa";
import type { LiveStreamer } from "../lib/streamMonitor";

const AUTO_DISMISS_SECONDS = 10;

interface LiveNotificationProps {
  streamer: LiveStreamer;
  onViewNow: () => void;
  onClose: () => void;
}

export default function LiveNotification({
  streamer,
  onViewNow,
  onClose,
}: LiveNotificationProps) {
  // Keep the latest onClose in a ref so the auto-dismiss timer below is
  // created once, regardless of how often the parent re-renders (otherwise
  // the countdown would keep resetting and the popup would never close).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Count down from 10s; when it hits zero, auto-dismiss. Reuses onClose,
  // which marks the streamer as seen so the popup won't reappear.
  const [secondsLeft, setSecondsLeft] = useState(AUTO_DISMISS_SECONDS);
  useEffect(() => {
    if (secondsLeft <= 0) {
      onCloseRef.current();
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  return (
    <div className="live-notification">
      <div className="live-notification-header">
        <div className="live-notification-title">
          <span className="live-badge">LIVE</span>
          {streamer.profileImageUrl && (
            <img
              src={streamer.profileImageUrl}
              alt={streamer.displayName}
              className="streamer-avatar-inline"
            />
          )}
          <span className="streamer-name">{streamer.displayName}</span>
        </div>
        <span className="live-notification-countdown">{secondsLeft}s</span>
        <button type="button"
          className="live-notification-close"
          onClick={onClose}
          aria-label="Close"
        >
          <FaTimes />
        </button>
      </div>

      {streamer.gameName && (
        <div className="stream-game">{streamer.gameName}</div>
      )}

      {streamer.title && <div className="stream-title">{streamer.title}</div>}

      <button type="button" className="view-now-button" onClick={onViewNow}>
        View Now
      </button>
    </div>
  );
}
