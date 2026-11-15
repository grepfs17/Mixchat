import React, { memo } from "react";

import {
  FaStar,
  FaRegStar,
  FaUsers,
  FaEye,
  FaYoutube,
  FaCog,
  FaTwitch,
  FaSignOutAlt,
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
  isLive?: boolean;
}

const EMPTY_STRING_ARRAY: string[] = [];
const EMPTY_CHANNELS: TwitchChannel[] = [];

interface LoginPanelProps {
  twitchConnected: boolean;
  twitchUser?: string;
  twitchProfileImage?: string;
  twitchUserName?: string;
  twitchUserId?: string;
  twitchChannels?: TwitchChannel[];
  /** Full following list (online + offline), used by the settings channel picker. */
  allTwitchChannels?: TwitchChannel[];
  /** Channels where the logged-in user is a moderator, online and offline. */
  moderatedChannels?: TwitchChannel[];
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
  /** Shows a live/offline indicator, including offline channels. */
  showStatus?: boolean;
  onChannelChange?: (channelId: string) => void;
  onToggleFavorite?: (channelId: string) => void;
  onRequestClose?: () => void;
}

function ChannelStatusDot({ isLive }: { isLive: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`channel-status-dot ${isLive ? "is-live" : "is-offline"}`}
      title={isLive ? "Live" : "Offline"}
    />
  );
}

function ChannelStatusLabel({
  channel,
  isLive,
  showStatus,
}: {
  channel: TwitchChannel;
  isLive: boolean;
  showStatus: boolean;
}) {
  if (showStatus && !isLive) {
    return <span className="channel-status-offline">Offline</span>;
  }
  if (channel.viewerCount === undefined || channel.viewerCount === null) {
    return null;
  }
  return (
    <span className="viewer-count">
      <FaUsers size={12} /> {channel.viewerCount.toLocaleString()}
    </span>
  );
}

function ChannelListItem({
  channel,
  isSelected,
  isYoutubeLinked,
  isFavorite,
  showStatus = false,
  onChannelChange,
  onToggleFavorite,
  onRequestClose,
}: ChannelListItemProps) {
  const isLive = channel.isLive ?? (channel.viewerCount ?? 0) > 0;
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
            {showStatus && <ChannelStatusDot isLive={isLive} />}
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
            {showStatus && <ChannelStatusDot isLive={isLive} />}
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
      <ChannelStatusLabel
        channel={channel}
        isLive={isLive}
        showStatus={showStatus}
      />
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
  showStatus?: boolean;
  onChannelChange?: (channelId: string) => void;
  onToggleFavorite?: (channelId: string) => void;
  onRequestClose?: () => void;
}

function ChannelList({
  channels,
  selectedTwitchChannel,
  linkedYoutubeChannelIds,
  favoriteChannels,
  showStatus,
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
          showStatus={showStatus}
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
          className="join-btn"
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
    <section className="platform-card youtube">
      <div className="platform-card-header">
        <span className="platform-brand">
          <FaYoutube
            size={15}
            className="platform-brand-icon youtube"
            aria-hidden="true"
          />
          <span className="platform-name">YouTube</span>
        </span>
      </div>
      <div className="platform-card-body">
        {youtubeConnected ? (
          <div className="account-row">
            <div className="youtube-user-info">
              <span
                className="account-avatar account-avatar--youtube"
                aria-hidden="true"
              >
                <FaYoutube size={16} />
              </span>
              <span className="youtube-user-name">
                {youtubeUser || "YouTube"}
              </span>
            </div>
            <div className="account-actions">
              <button
                type="button"
                onClick={onYoutubeLogout}
                className="icon-button account-logout"
                title="Log out of YouTube"
                aria-label="Log out of YouTube"
              >
                <FaSignOutAlt size={13} />
              </button>
            </div>
          </div>
        ) : onYoutubeLogin ? (
          <button
            type="button"
            onClick={onYoutubeLogin}
            className="login-btn youtube-btn"
          >
            Login with YouTube
          </button>
        ) : null}
      </div>
    </section>
  );
}

function LoginPanel({
  twitchConnected,
  twitchUser,
  twitchProfileImage,
  twitchUserName,
  twitchUserId,
  twitchChannels = EMPTY_CHANNELS,
  allTwitchChannels = EMPTY_CHANNELS,
  moderatedChannels = EMPTY_CHANNELS,
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

  // A channel that is both followed and online already appears in the
  // Channels list above, so skip it here. Offline moderated channels always
  // show because they are never part of the online Channels list.
  const visibleModeratedChannels = React.useMemo(() => {
    const shownIds = new Set(twitchChannels.map((channel) => channel.id));
    return moderatedChannels.filter((channel) => !shownIds.has(channel.id));
  }, [moderatedChannels, twitchChannels]);

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

      <div className="login-panel-body">
        <section className="platform-card twitch">
          <div className="platform-card-header">
            <span className="platform-brand">
              <FaTwitch
                size={15}
                className="platform-brand-icon twitch"
                aria-hidden="true"
              />
              <span className="platform-name">Twitch</span>
            </span>
            {twitchConnected && twitchUser && (
              <div className="platform-actions">
                {onManageWatchlist && (
                  <button
                    type="button"
                    onClick={() => {
                      onManageWatchlist();
                      onRequestClose?.();
                    }}
                    className="icon-button"
                    title="Manage Notification Streams"
                    aria-label="Manage Notification Streams"
                  >
                    <FaEye size={14} />
                  </button>
                )}
                {!IS_TWITCH_ONLY && onManageYoutubeLinks && (
                  <button
                    type="button"
                    onClick={() => {
                      onManageYoutubeLinks();
                      onRequestClose?.();
                    }}
                    className="icon-button youtube-icon-btn"
                    title="Link YouTube channels"
                    aria-label="Link YouTube channels"
                  >
                    <FaYoutube size={14} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={onTwitchLogout}
                  className="icon-button account-logout"
                  title="Log out of Twitch"
                  aria-label="Log out of Twitch"
                >
                  <FaSignOutAlt size={13} />
                </button>
              </div>
            )}
          </div>

          <div className="platform-card-body">
            {twitchConnected && twitchUser ? (
              <>
                <div className="account-row">
                  <div
                    role="button"
                    tabIndex={0}
                    className="user-profile-link"
                    onClick={() => {
                      if (twitchUserId || twitchUserName) {
                        onChannelChange?.(twitchUserId || twitchUserName!);
                        onRequestClose?.();
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (twitchUserId || twitchUserName) {
                          onChannelChange?.(twitchUserId || twitchUserName!);
                          onRequestClose?.();
                        }
                      }
                    }}
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
                </div>

                {twitchChannels && twitchChannels.length > 0 && (
                  <div className="channels-section">
                    <label
                      className="section-label"
                      htmlFor="login-channel-search"
                    >
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

                {visibleModeratedChannels.length > 0 && (
                  <div className="moderated-section">
                    <span className="section-label">
                      Moderated Channels ({visibleModeratedChannels.length})
                    </span>
                    <ChannelList
                      channels={visibleModeratedChannels}
                      selectedTwitchChannel={selectedTwitchChannel}
                      linkedYoutubeChannelIds={linkedYoutubeChannelIds}
                      favoriteChannels={favoriteChannels}
                      showStatus
                      onChannelChange={onChannelChange}
                      onToggleFavorite={onToggleFavorite}
                      onRequestClose={onRequestClose}
                    />
                  </div>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={onTwitchLogin}
                className="login-btn twitch-btn"
              >
                Login with Twitch
              </button>
            )}
          </div>
        </section>

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
          allTwitchChannels={allTwitchChannels}
        />
      )}
    </div>
  );
}

export default memo(LoginPanel);
