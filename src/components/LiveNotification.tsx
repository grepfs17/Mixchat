import { FaTimes } from 'react-icons/fa';
import type { LiveStreamer } from '../lib/streamMonitor';


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
  return (
    <div className="live-notification">
      <div className="live-notification-header">
        <div className="live-notification-title">
          <span className="live-badge">LIVE</span>
          <span className="streamer-name">{streamer.displayName}</span>
        </div>
        <button className="live-notification-close" onClick={onClose} aria-label="Close">
          <FaTimes />
        </button>
      </div>

      {streamer.profileImageUrl && (
        <img
          src={streamer.profileImageUrl}
          alt={streamer.displayName}
          className="streamer-avatar"
        />
      )}

      {streamer.gameName && <div className="stream-game">{streamer.gameName}</div>}

      {streamer.title && <div className="stream-title">{streamer.title}</div>}

      {streamer.viewerCount && (
        <div className="viewer-count">👥 {streamer.viewerCount.toLocaleString()} watching</div>
      )}

      <button className="view-now-button" onClick={onViewNow}>
        View Now
      </button>
    </div>
  );
}
