import React, { memo } from "react";

import {
  FaStar,
  FaRegStar,
  FaUsers,
  FaEye,
  FaYoutube,
  FaCog,
  FaTwitch,
} from "react-icons/fa";
import EmbedConfigModal from "./EmbedConfigModal";
import { IS_TWITCH_ONLY } from "../lib/constants";

interface TwitchChannel {
  id: string;
  name: string;
  displayName: string;
  title: string;
  profileImageUrl?: string;
  viewerCount?: number;
  gameName?: string;
}

const EMPTY_STRING_ARRAY: string[] = [];

interface LoginPanelProps {
  twitchConnected: boolean;
  twitchUser?: string;
  twitchProfileImage?: string;
  twitchUserName?: string;
  twitchUserId?: string;
  twitchChannels?: TwitchChannel[];
  selectedTwitchChannel?: string;
  favoriteChannels?: string[];
  onChannelChange?: (channelId: string) => void;
  onToggleFavorite?: (channelId: string) => void;
  onTwitchLogin: () => void;
  onTwitchLogout: () => void;
  youtubeConnected?: boolean;
  youtubeUser?: string;
  onYoutubeLogin?: () => void;
  onYoutubeLogout?: () => void;
  onManageWatchlist?: () => void;
  onManageYoutubeLinks?: () => void;
  linkedYoutubeChannelIds?: string[];
  onGoHome?: () => void;
  onRequestClose?: () => void;
  hasYoutubeSession: boolean;
  hasDriveScope: boolean;
  onReauthYoutube: () => void;
  onYoutubeDriveLogin: () => void;
}

interface ChannelListItemProps {
  channel: TwitchChannel;
  isSelected: boolean;
  isYoutubeLinked: boolean;
  isFavorite: boolean;
  onChannelChange?: (channelId: string) => void;
  onToggleFavorite?: (channelId: string) => void;
  onRequestClose?: () => void;
}

function ChannelListItem({
  channel,
  isSelected,
  isYoutubeLinked,
  isFavorite,
  onChannelChange,
  onToggleFavorite,
  onRequestClose,
}: ChannelListItemProps) {
  return (
    <div className={`channel-item ${isSelected ? "selected" : ""}`}>
      <button type="button"
        className="channel-item-info"
        onClick={() => {
          onChannelChange?.(channel.id);
          onRequestClose?.();
        }}
        title={`${channel.displayName}${channel.gameName ? ` • ${channel.gameName}` : ""}`}
      >
        {channel.profileImageUrl ? (
          <span className="channel-item-avatar-wrap">
            <img
              src={channel.profileImageUrl}
              alt={channel.displayName}
              className="channel-item-image"
            />
            {isYoutubeLinked && (
              <FaYoutube
                size={13}
                className="channel-item-yt-badge"
                title="YouTube linked"
              />
            )}
          </span>
        ) : isYoutubeLinked ? (
          <span className="channel-item-avatar-wrap">
            <span className="channel-item-image channel-item-image--placeholder" />
            <FaYoutube
              size={13}
              className="channel-item-yt-badge"
              title="YouTube linked"
            />
          </span>
        ) : null}
        <div className="channel-item-details">
          <span className="channel-item-name">{channel.displayName}</span>
          {channel.gameName && (
            <span className="channel-game-name">{channel.gameName}</span>
          )}
        </div>
      </button>
      {channel.viewerCount !== undefined && channel.viewerCount !== null && (
        <span className="viewer-count">
          <FaUsers size={12} /> {channel.viewerCount.toLocaleString()}
        </span>
      )}
      <button type="button"
        onClick={() => onToggleFavorite?.(channel.id)}
        className={`favorite-button ${isFavorite ? "active" : ""}`}
        title={isFavorite ? "Remove from favorites" : "Add to favorites"}
      >
        {isFavorite ? <FaStar size={16} /> : <FaRegStar size={16} />}
      </button>
    </div>
  );
}

interface ChannelListProps {
  channels: TwitchChannel[];
  selectedTwitchChannel: string;
  linkedYoutubeChannelIds: string[];
  favoriteChannels: string[];
  onChannelChange?: (channelId: string) => void;
  onToggleFavorite?: (channelId: string) => void;
  onRequestClose?: () => void;
}

function ChannelList({
  channels,
  selectedTwitchChannel,
  linkedYoutubeChannelIds,
  favoriteChannels,
  onChannelChange,
  onToggleFavorite,
  onRequestClose,
}: ChannelListProps) {
  return (
    <div className="channel-list">
      {channels.map((channel) => (
        <ChannelListItem
          key={channel.id}
          channel={channel}
          isSelected={selectedTwitchChannel === channel.id}
          isYoutubeLinked={new Set(linkedYoutubeChannelIds).has(channel.id)}
          isFavorite={new Set(favoriteChannels).has(channel.id)}
          onChannelChange={onChannelChange}
          onToggleFavorite={onToggleFavorite}
          onRequestClose={onRequestClose}
        />
      ))}
    </div>
  );
}

interface ManualJoinSectionProps {
  manualChannel: string;
  onManualChannelChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

function ManualJoinSection({
  manualChannel,
  onManualChannelChange,
  onSubmit,
}: ManualJoinSectionProps) {
  return (
    <div className="manual-join-section">
      <label className="section-label" htmlFor="login-manual-join">
        Or join manually
      </label>
      <form onSubmit={onSubmit} className="join-form">
        <input
          id="login-manual-join"
          type="text"
          value={manualChannel}
          onChange={(e) => onManualChannelChange(e.target.value)}
          placeholder="Enter channel name"
          aria-label="Channel name"
          className="join-input"
        />
        <button
          type="submit"
          disabled={!manualChannel.trim()}
          className="logout-btn"
          style={{
            backgroundColor: manualChannel.trim() ? "#555555" : "#333333",
            cursor: manualChannel.trim() ? "pointer" : "not-allowed",
          }}
        >
          Join
        </button>
      </form>
    </div>
  );
}

interface YoutubeLoginSectionProps {
  youtubeConnected?: boolean;
  youtubeUser?: string;
  onYoutubeLogin?: () => void;
  onYoutubeLogout?: () => void;
}

function YoutubeLoginSection({
  youtubeConnected,
  youtubeUser,
  onYoutubeLogin,
  onYoutubeLogout,
}: YoutubeLoginSectionProps) {
  if (IS_TWITCH_ONLY) return null;
  return (
    <div className="youtube-section">
      {youtubeConnected ? (
        <div className="youtube-info-row">
          <div className="youtube-user-info">
            <FaYoutube
              style={{ color: "#FF0000", fontSize: "18px", flexShrink: 0 }}
            />
            <span className="youtube-user-name">
              {youtubeUser || "YouTube"}
            </span>
          </div>
          <button type="button" onClick={onYoutubeLogout} className="logout-btn small">
            Logout
          </button>
        </div>
      ) : onYoutubeLogin ? (
        <button type="button"
          onClick={onYoutubeLogin}
          className="login-btn youtube-btn"
          style={{ width: "100%" }}
        >
          Login with YouTube
        </button>
      ) : null}
    </div>
  );
}

function LoginPanel({
  twitchConnected,
  twitchUser,
  twitchProfileImage,
  twitchUserName,
  twitchUserId,
  twitchChannels = EMPTY_STRING_ARRAY as unknown as TwitchChannel[],
  selectedTwitchChannel = "",
  favoriteChannels = EMPTY_STRING_ARRAY,
  onChannelChange,
  onToggleFavorite,
  onTwitchLogin,
  onTwitchLogout,
  youtubeConnected,
  youtubeUser,
  onYoutubeLogin,
  onYoutubeLogout,
  onManageWatchlist,
  onManageYoutubeLinks,
  linkedYoutubeChannelIds = EMPTY_STRING_ARRAY,
  onGoHome,
  onRequestClose,
  hasYoutubeSession,
  hasDriveScope,
  onReauthYoutube,
  onYoutubeDriveLogin,
}: LoginPanelProps) {
  const [manualChannel, setManualChannel] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [showEmbedConfig, setShowEmbedConfig] = React.useState(false);

  const filteredChannels = React.useMemo(() => {
    if (!searchQuery.trim()) return twitchChannels;
    const query = searchQuery.toLowerCase();
    return twitchChannels.filter(
      (channel) =>
        channel.displayName.toLowerCase().includes(query) ||
        channel.name.toLowerCase().includes(query),
    );
  }, [searchQuery, twitchChannels]);

  const handleManualJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualChannel.trim() && onChannelChange) {
      onChannelChange(manualChannel.trim().toLowerCase());
      setManualChannel("");
      onRequestClose?.();
    }
  };
  return (
    <div className="login-panel">
      <div className="login-panel-header">
        <a
          href="/"
          title="Go to home page"
          onClick={(e) => {
            if (onGoHome) {
              e.preventDefault();
              onGoHome();
            }
          }}
          style={{ lineHeight: 0 }}
        >
          <img
            src={IS_TWITCH_ONLY ? "/logo-twitch.webp" : "/logo.webp"}
            alt="Mixchat"
            style={{ height: 24, width: "auto", opacity: 0.9 }}
          />
        </a>
        <button type="button"
          onClick={() => setShowEmbedConfig(true)}
          className="icon-button small"
          title="Configure global settings"
        >
          <FaCog />
        </button>
      </div>

      <div className="platform-login twitch">
        <div className="platform-header"></div>

        {twitchConnected && twitchUser ? (
          <div className="connected-info">
            <div className="user-profile-container">
        <div  role="button"
          tabIndex={0}
          className="user-profile-link"
          onClick={() => {
          if (twitchUserId || twitchUserName) {
            onChannelChange?.(twitchUserId || twitchUserName!);
            onRequestClose?.();
          }
        }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (twitchUserId || twitchUserName) { onChannelChange?.(twitchUserId || twitchUserName!); onRequestClose?.(); } } } }
        title={`Switch to ${twitchUser}'s channel`}
              >
                {twitchProfileImage && (
                  <img
                    src={twitchProfileImage}
                    alt={twitchUser}
                    className="profile-image"
                    loading="eager"
                  />
                )}
                <div className="user-details">
                  <p className="user-name">{twitchUser}</p>
                </div>
              </div>

              <div className="user-actions">
                {onManageWatchlist && (
                  <button type="button"
                    onClick={() => {
                      onManageWatchlist();
                      onRequestClose?.();
                    }}
                    className="icon-button"
                    title="Manage Notification Streams"
                  >
                    <FaEye />
                  </button>
                )}
                {!IS_TWITCH_ONLY && onManageYoutubeLinks && (
                  <button type="button"
                    onClick={() => {
                      onManageYoutubeLinks();
                      onRequestClose?.();
                    }}
                    className="icon-button youtube-icon-btn"
                    title="Link YouTube channels"
                  >
                    <FaYoutube />
                  </button>
                )}
              </div>
            </div>
            <button type="button" onClick={onTwitchLogout} className="logout-btn">
              Logout
            </button>

            {twitchChannels && twitchChannels.length > 0 && (
              <div className="channels-section">
                <label className="section-label" htmlFor="login-channel-search">
                  Channels ({filteredChannels.length})
                </label>
                <input
                  id="login-channel-search"
                  type="text"
                  placeholder="Search channels..."
                  aria-label="Search channels"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="channel-search-input"
                />
                <ChannelList
                  channels={filteredChannels}
                  selectedTwitchChannel={selectedTwitchChannel}
                  linkedYoutubeChannelIds={linkedYoutubeChannelIds}
                  favoriteChannels={favoriteChannels}
                  onChannelChange={onChannelChange}
                  onToggleFavorite={onToggleFavorite}
                  onRequestClose={onRequestClose}
                />

                <ManualJoinSection
                  manualChannel={manualChannel}
                  onManualChannelChange={setManualChannel}
                  onSubmit={handleManualJoin}
                />
              </div>
            )}
          </div>
        ) : (
          <button type="button" onClick={onTwitchLogin} className="login-btn twitch-btn">
            Login with Twitch
          </button>
        )}

        <YoutubeLoginSection
          youtubeConnected={youtubeConnected}
          youtubeUser={youtubeUser}
          onYoutubeLogin={onYoutubeLogin}
          onYoutubeLogout={onYoutubeLogout}
        />
      </div>

      {showEmbedConfig && (
        <EmbedConfigModal
          onClose={() => setShowEmbedConfig(false)}
          hasYoutubeSession={hasYoutubeSession}
          hasDriveScope={hasDriveScope}
          onReauthYoutube={onReauthYoutube}
          onYoutubeDriveLogin={onYoutubeDriveLogin}
        />
      )}
    </div>
  );
}

export default memo(LoginPanel);
