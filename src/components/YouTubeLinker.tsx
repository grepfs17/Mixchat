import { useState } from "react";
import { FaPlus, FaTrash, FaYoutube, FaPencilAlt } from "react-icons/fa";
import {
  getYoutubeLinks,
  addYoutubeLink,
  removeYoutubeLink,
  toggleYoutubeLinkActive,
  updateYoutubeLink,
} from "../lib/youtubeLinks";
import type { YouTubeLink } from "../lib/youtubeLinks";
import type { TwitchChannel } from "../components/AppContainer";

interface YouTubeLinkerProps {
  availableChannels: TwitchChannel[];
  onClose: () => void;
  onLinksChanged?: () => void;
}

export default function YouTubeLinker({
  availableChannels,
  onClose,
  onLinksChanged,
}: YouTubeLinkerProps) {
  const [youtubeLinks, setYoutubeLinks] =
    useState<YouTubeLink[]>(getYoutubeLinks());
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [youtubeUrl, setYoutubeUrl] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState<string>("");
  const [editError, setEditError] = useState<string>("");

  const handleAddLink = () => {
    if (!selectedChannelId || !youtubeUrl.trim()) return;

    // Validate URL format
    const trimmed = youtubeUrl.trim();
    if (
      !trimmed.startsWith("https://www.youtube.com/") &&
      !trimmed.startsWith("https://youtube.com/") &&
      !trimmed.startsWith("http://www.youtube.com/") &&
      !trimmed.startsWith("http://youtube.com/")
    ) {
      setError(
        "Please enter a valid YouTube channel URL (e.g. https://www.youtube.com/@channelname)",
      );
      return;
    }

    const channel = availableChannels.find((c) => c.id === selectedChannelId);
    if (channel) {
      addYoutubeLink({
        twitchChannelId: channel.id,
        twitchDisplayName: channel.displayName,
        youtubeUrl: trimmed,
      });
      setYoutubeLinks(getYoutubeLinks());
      setSelectedChannelId("");
      setSearchQuery("");
      setYoutubeUrl("");
      setError("");
      onLinksChanged?.();
    }
  };

  const handleRemoveLink = (twitchChannelId: string) => {
    removeYoutubeLink(twitchChannelId);
    setYoutubeLinks(getYoutubeLinks());
    onLinksChanged?.();
  };

  const handleToggleActive = (twitchChannelId: string) => {
    toggleYoutubeLinkActive(twitchChannelId);
    setYoutubeLinks(getYoutubeLinks());
    onLinksChanged?.();
  };

  const handleEditStart = (twitchChannelId: string, currentUrl: string) => {
    setEditingId(twitchChannelId);
    setEditUrl(currentUrl);
    setEditError("");
  };

  const handleEditSave = () => {
    if (!editingId) return;

    const trimmed = editUrl.trim();
    if (
      !trimmed.startsWith("https://www.youtube.com/") &&
      !trimmed.startsWith("https://youtube.com/") &&
      !trimmed.startsWith("http://www.youtube.com/") &&
      !trimmed.startsWith("http://youtube.com/")
    ) {
      setEditError(
        "Please enter a valid YouTube channel URL (e.g. https://www.youtube.com/@channelname)",
      );
      return;
    }

    updateYoutubeLink(editingId, trimmed);
    setYoutubeLinks(getYoutubeLinks());
    setEditingId(null);
    setEditUrl("");
    setEditError("");
    onLinksChanged?.();
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditUrl("");
    setEditError("");
  };

  const isAlreadyLinked = (channelId: string) =>
    youtubeLinks.some((l) => l.twitchChannelId === channelId);

  const unlinkedChannels = availableChannels.filter(
    (c) => !isAlreadyLinked(c.id),
  );

  const filteredChannels =
    searchQuery.trim() === ""
      ? unlinkedChannels
      : unlinkedChannels.filter(
          (c) =>
            c.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.name.toLowerCase().includes(searchQuery.toLowerCase()),
        );

  return (
    <div className="ytlinker-overlay" onClick={onClose}>
      <div className="ytlinker-manager" onClick={(e) => e.stopPropagation()}>
        <h2>
          <FaYoutube
            style={{
              color: "#FF0000",
              marginRight: "8px",
              verticalAlign: "middle",
            }}
          />
          Link YouTube Channels
        </h2>
        <p className="ytlinker-subtitle">
          Link a YouTube channel to a followed streamer to see their YouTube
          live chat
        </p>

        <div className="ytlinker-add-section">
          <div className="ytlinker-inputs">
            <div className="ytlinker-channel-select">
              <label className="ytlinker-label">Twitch Channel</label>
              <input
                type="text"
                placeholder="Search followed channels..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedChannelId("");
                }}
                className="ytlinker-search"
              />
              <div className="ytlinker-dropdown">
                {filteredChannels.length === 0 ? (
                  <div className="ytlinker-no-channels">
                    {searchQuery
                      ? "No channels match your search"
                      : "All followed channels already have a YouTube link"}
                  </div>
                ) : (
                  filteredChannels.map((channel) => (
                    <button
                      key={channel.id}
                      className="ytlinker-channel-item"
                      onClick={() => {
                        setSelectedChannelId(channel.id);
                        setSearchQuery(channel.displayName);
                      }}
                    >
                      {channel.profileImageUrl && (
                        <img
                          src={channel.profileImageUrl}
                          alt=""
                          className="item-avatar"
                        />
                      )}
                      <div className="ytlinker-channel-info">
                        <div className="ytlinker-channel-display-name">
                          {channel.displayName}
                        </div>
                        <div className="ytlinker-channel-username">
                          @{channel.name}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
              {selectedChannelId && (
                <div className="ytlinker-selected-display">
                  ✓{" "}
                  {unlinkedChannels.find((c) => c.id === selectedChannelId)
                    ?.displayName || searchQuery}
                </div>
              )}
            </div>

            <div className="ytlinker-url-input">
              <label className="ytlinker-label">YouTube Channel URL</label>
              <input
                type="text"
                placeholder="https://www.youtube.com/@channelname"
                value={youtubeUrl}
                onChange={(e) => {
                  setYoutubeUrl(e.target.value);
                  setError("");
                }}
                className="ytlinker-search"
              />
            </div>
          </div>

          {error && <div className="ytlinker-error">{error}</div>}

          <button
            className="ytlinker-add-button"
            onClick={handleAddLink}
            disabled={!selectedChannelId || !youtubeUrl.trim()}
          >
            <FaPlus /> Link
          </button>
        </div>

        <div className="ytlinker-items">
          {youtubeLinks.length === 0 ? (
            <p className="ytlinker-empty">No YouTube channels linked yet</p>
          ) : (
            youtubeLinks.map((link) => {
              const channel = availableChannels.find(
                (c) => c.id === link.twitchChannelId,
              );
              const isActive = link.active !== false;
              const isEditing = editingId === link.twitchChannelId;
              return (
                <div
                  key={link.twitchChannelId}
                  className={`ytlinker-item${!isActive ? " ytlinker-item--inactive" : ""}${isEditing ? " ytlinker-item--editing" : ""}`}
                >
                  <div className="ytlinker-item-info">
                    {channel?.profileImageUrl && (
                      <img
                        src={channel.profileImageUrl}
                        alt=""
                        className="item-avatar"
                      />
                    )}
                    <div className="ytlinker-item-details">
                      <div className="ytlinker-item-name">
                        {link.twitchDisplayName}
                      </div>
                      {isEditing ? (
                        <div className="ytlinker-edit-row">
                          <input
                            type="text"
                            value={editUrl}
                            onChange={(e) => {
                              setEditUrl(e.target.value);
                              setEditError("");
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleEditSave();
                              if (e.key === "Escape") handleEditCancel();
                            }}
                            className="ytlinker-edit-input"
                            autoFocus
                          />
                          {editError && (
                            <div className="ytlinker-error">{editError}</div>
                          )}
                        </div>
                      ) : (
                        <a
                          href={link.youtubeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ytlinker-item-url"
                        >
                          {link.youtubeUrl}
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="ytlinker-item-actions">
                    {isEditing ? (
                      <>
                        <button
                          className="ytlinker-edit-save"
                          onClick={handleEditSave}
                          title="Save changes"
                        >
                          ✓
                        </button>
                        <button
                          className="ytlinker-edit-cancel"
                          onClick={handleEditCancel}
                          title="Cancel edit"
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="ytlinker-edit-button"
                          onClick={() =>
                            handleEditStart(
                              link.twitchChannelId,
                              link.youtubeUrl,
                            )
                          }
                          title="Edit YouTube URL"
                        >
                          <FaPencilAlt />
                        </button>
                        <button
                          className={`ytlinker-toggle${isActive ? " ytlinker-toggle--active" : ""}`}
                          onClick={() =>
                            handleToggleActive(link.twitchChannelId)
                          }
                          title={isActive ? "Deactivate link" : "Activate link"}
                          aria-label={
                            isActive
                              ? "Deactivate YouTube link"
                              : "Activate YouTube link"
                          }
                        >
                          <span className="ytlinker-toggle-track">
                            <span className="ytlinker-toggle-thumb" />
                          </span>
                        </button>
                        <button
                          className="ytlinker-remove-button"
                          onClick={() => handleRemoveLink(link.twitchChannelId)}
                          title="Remove YouTube link"
                        >
                          <FaTrash />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="ytlinker-footer">
          <p className="ytlinker-info-text">
            <FaYoutube style={{ marginRight: "6px", color: "#FF0000" }} />
            When viewing a linked channel, YouTube live chat will appear above
            the Twitch chat
          </p>
          <button className="ytlinker-close-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
