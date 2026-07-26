import { useState } from "react";
import { FaPlus, FaTrash, FaEye, FaInfoCircle } from "react-icons/fa";
import {
  getWatchedStreamers,
  addWatchedStreamer,
  removeWatchedStreamer,
  getSystemNotificationsEnabled,
  setSystemNotificationsEnabled,
} from "../lib/streamMonitor";
import type { TwitchChannel } from "../components/AppContainer";

interface WatchlistManagerProps {
  availableChannels: TwitchChannel[];
  onClose: () => void;
}

export default function WatchlistManager({
  availableChannels,
  onClose,
}: WatchlistManagerProps) {
  const [watchedStreamers, setWatchedStreamers] = useState(
    getWatchedStreamers(),
  );
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [systemNotifications, setSystemNotifications] = useState(
    getSystemNotificationsEnabled(),
  );

  const handleAddStreamer = () => {
    if (!selectedChannelId) return;

    const channel = availableChannels.find((c) => c.id === selectedChannelId);
    if (channel) {
      addWatchedStreamer({
        id: channel.id,
        name: channel.name,
        displayName: channel.displayName,
        profileImageUrl: channel.profileImageUrl,
      });
      setWatchedStreamers(getWatchedStreamers());
      setSelectedChannelId("");
      setSearchQuery("");
    }
  };

  const handleRemoveStreamer = (streamerId: string) => {
    removeWatchedStreamer(streamerId);
    setWatchedStreamers(getWatchedStreamers());
  };

  const isAlreadyWatched = (channelId: string) =>
    watchedStreamers.some((s) => s.id === channelId);

  const unwatchedChannels = availableChannels.filter(
    (c) => !isAlreadyWatched(c.id),
  );

  const filteredChannels =
    searchQuery.trim() === ""
      ? unwatchedChannels
      : unwatchedChannels.filter(
          (c) =>
            c.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.name.toLowerCase().includes(searchQuery.toLowerCase()),
        );

  return (
    <div className="watchlist-manager-overlay" onClick={onClose}>
      <div className="watchlist-manager" onClick={(e) => e.stopPropagation()}>
        <h2>Manage Notification Streams</h2>
        <p className="subtitle">
          Get notifications when these streamers go live
        </p>

        <div className="watchlist-add-section">
          <input
            type="text"
            placeholder="Search channels..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="channel-search"
          />
          <div className="channel-list-dropdown">
            {filteredChannels.length === 0 ? (
              <div className="no-channels-message">
                {searchQuery
                  ? "No channels match your search"
                  : "All followed channels are already being watched"}
              </div>
            ) : (
              filteredChannels.map((channel) => (
                <button type="button"
                  key={channel.id}
                  className="channel-list-item"
                  onClick={() => {
                    setSelectedChannelId(channel.id);
                    setSearchQuery("");
                  }}
                >
                  {channel.profileImageUrl && (
                    <img
                      src={channel.profileImageUrl}
                      alt=""
                      className="channel-thumb"
                    />
                  )}
                  <div className="channel-info">
                    <div className="channel-display-name">
                      {channel.displayName}
                    </div>
                    <div className="channel-username">@{channel.name}</div>
                  </div>
                </button>
              ))
            )}
          </div>
          {selectedChannelId && (
            <div className="selected-channel-display">
              {
                unwatchedChannels.find((c) => c.id === selectedChannelId)
                  ?.displayName
              }
            </div>
          )}
          <button type="button"
            className="add-button"
            onClick={handleAddStreamer}
            disabled={!selectedChannelId}
          >
            <FaPlus /> Add
          </button>
        </div>

        <div className="watchlist-settings">
          <label className="watchlist-toggle">
            <span className="watchlist-toggle-label">
              <FaEye style={{ marginRight: "6px", opacity: 0.7 }} />
              Browser notifications
              <span
                className="watchlist-info-icon"
                title="In-app notifications show a small popup on the page. Browser notifications are sent by your browser even when you're not actively using this tab."
              >
                <FaInfoCircle size={12} />
              </span>
            </span>
            <button type="button"
              className={`watchlist-toggle-switch${systemNotifications ? " active" : ""}`}
              onClick={() => {
                const next = !systemNotifications;
                setSystemNotifications(next);
                setSystemNotificationsEnabled(next);
              }}
              role="switch"
              aria-checked={systemNotifications}
            >
              <span className="watchlist-toggle-knob" />
            </button>
          </label>
        </div>

        <div className="watchlist-items">
          {watchedStreamers.length === 0 ? (
            <p className="empty-message">No streamers being watched yet</p>
          ) : (
            watchedStreamers.map((streamer) => (
              <div key={streamer.id} className="watchlist-item">
                <div className="item-info">
                  {streamer.profileImageUrl && (
                    <img
                      src={streamer.profileImageUrl}
                      alt={streamer.displayName}
                      className="item-avatar"
                    />
                  )}
                  <div className="item-details">
                    <div className="item-name">{streamer.displayName}</div>
                    <div className="item-username">@{streamer.name}</div>
                  </div>
                </div>
                <button type="button"
                  className="remove-button"
                  onClick={() => handleRemoveStreamer(streamer.id)}
                  title="Remove from watchlist"
                >
                  <FaTrash />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="watchlist-footer">
          <p className="info-text">
            <FaEye style={{ marginRight: "6px" }} />
            You'll be notified once per session when each streamer goes live
          </p>
          <button type="button" className="close-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
