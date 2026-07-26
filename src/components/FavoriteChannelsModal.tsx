import { useState, useMemo } from "react";
import { FaStar, FaRegStar, FaTimes, FaSearch } from "react-icons/fa";
import type { TwitchChannel } from "./AppContainer";

interface FavoriteChannelsModalProps {
  allChannels: TwitchChannel[];
  favoriteChannels: string[];
  onToggleFavorite: (channelId: string) => void;
  onChannelSelect: (channelId: string) => void;
  onClose: () => void;
}

export default function FavoriteChannelsModal({
  allChannels,
  favoriteChannels,
  onToggleFavorite,
  onChannelSelect,
  onClose,
}: FavoriteChannelsModalProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const { favoritesList, otherChannels } = useMemo(() => {
    const favs: TwitchChannel[] = [];
    const others: TwitchChannel[] = [];
    for (const ch of allChannels) {
      if (new Set(favoriteChannels).has(ch.id)) {
        favs.push(ch);
      } else {
        others.push(ch);
      }
    }
    return { favoritesList: favs, otherChannels: others };
  }, [allChannels, favoriteChannels]);

  const filteredFavorites = useMemo(() => {
    if (!searchQuery.trim()) return favoritesList;
    const q = searchQuery.toLowerCase();
    return favoritesList.filter(
      (c) =>
        c.displayName.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q),
    );
  }, [searchQuery, favoritesList]);

  const filteredOthers = useMemo(() => {
    if (!searchQuery.trim()) return otherChannels;
    const q = searchQuery.toLowerCase();
    return otherChannels.filter(
      (c) =>
        c.displayName.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q),
    );
  }, [searchQuery, otherChannels]);

  const handleSelect = (channelId: string) => {
    onChannelSelect(channelId);
    onClose();
  };

  return (
    <div className="favorites-modal-overlay" onClick={onClose}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); } }}>
      <div className="favorites-modal" onClick={(e) => e.stopPropagation()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); } }}>
        <div className="favorites-modal-header">
          <h2>
            <FaStar size={18} style={{ color: "var(--color-favorite)" }} />
            Favorite Channels
          </h2>
          <button type="button"
            className="favorites-modal-close"
            onClick={onClose}
            title="Close"
          >
            <FaTimes size={16} />
          </button>
        </div>
        <p className="favorites-modal-subtitle">
          Manage your favorite channels. They appear first in the stream grid.
        </p>

        <div className="favorites-search-wrapper">
          <FaSearch size={14} className="favorites-search-icon" />
          <input
            type="text"
            placeholder="Search all followed channels..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="favorites-search-input"
            aria-label="Search all followed channels"
          />
          {searchQuery && (
            <button type="button"
              className="favorites-search-clear"
              onClick={() => setSearchQuery("")}
              title="Clear search"
            >
              <FaTimes size={12} />
            </button>
          )}
        </div>

        <div className="favorites-list-container">
          {filteredFavorites.length > 0 && (
            <div className="favorites-section">
              <div className="favorites-section-label">
                <FaStar size={12} style={{ color: "var(--color-favorite)" }} />
                Favorites ({filteredFavorites.length})
              </div>
              {filteredFavorites.map((channel) => (
                <div key={channel.id} className="favorites-channel-item favorites-channel-item--active">
        <div
          role="button"
          tabIndex={0}
          className="favorites-channel-info"
          onClick={() => handleSelect(channel.id)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSelect(channel.id); } }}
                  >
                    {channel.profileImageUrl && (
                      <img
                        src={channel.profileImageUrl}
                        alt=""
                        className="favorites-channel-avatar"
                      />
                    )}
                    <div className="favorites-channel-details">
                      <span className="favorites-channel-name">
                        {channel.displayName}
                      </span>
                      <span className="favorites-channel-login">
                        @{channel.name}
                      </span>
                    </div>
                  </div>
                  <button type="button"
                    className="favorites-star-btn favorites-star-btn--active"
                    onClick={() => onToggleFavorite(channel.id)}
                    title="Remove from favorites"
                  >
                    <FaStar size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {filteredOthers.length > 0 && (
            <div className="favorites-section">
              <div className="favorites-section-label">
                All Channels ({filteredOthers.length})
              </div>
              {filteredOthers.map((channel) => (
                <div key={channel.id} className="favorites-channel-item">
        <div
          role="button"
          tabIndex={0}
          className="favorites-channel-info"
          onClick={() => handleSelect(channel.id)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSelect(channel.id); } }}
                  >
                    {channel.profileImageUrl && (
                      <img
                        src={channel.profileImageUrl}
                        alt=""
                        className="favorites-channel-avatar"
                      />
                    )}
                    <div className="favorites-channel-details">
                      <span className="favorites-channel-name">
                        {channel.displayName}
                      </span>
                      <span className="favorites-channel-login">
                        @{channel.name}
                      </span>
                    </div>
                  </div>
                  <button type="button"
                    className="favorites-star-btn"
                    onClick={() => onToggleFavorite(channel.id)}
                    title="Add to favorites"
                  >
                    <FaRegStar size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {filteredFavorites.length === 0 && filteredOthers.length === 0 && (
            <div className="favorites-empty">
              {searchQuery
                ? "No channels match your search"
                : "No followed channels found"}
            </div>
          )}
        </div>

        <div className="favorites-modal-footer">
          <span className="favorites-footer-hint">
            {favoritesList.length} favorite{favoritesList.length !== 1 ? "s" : ""}
            {" \u00b7 "}
            {allChannels.length} followed channel{allChannels.length !== 1 ? "s" : ""}
          </span>
          <button type="button" className="favorites-close-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
