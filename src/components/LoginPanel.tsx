import React, { memo } from 'react';
import { FaStar, FaRegStar, FaUsers, FaEye, FaYoutube, FaCog } from 'react-icons/fa';
import EmbedConfigModal from './EmbedConfigModal';
import type { ChatFont } from '../lib/types';

interface TwitchChannel {
  id: string;
  name: string;
  displayName: string;
  title: string;
  profileImageUrl?: string;
  viewerCount?: number;
}

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
  embedDefaultOpen?: boolean;
  onEmbedDefaultOpenChange?: (value: boolean) => void;
  unifyChatEnabled?: boolean;
  onUnifyChatEnabledChange?: (value: boolean) => void;
  fontSize?: number;
  onFontSizeChange?: (value: number) => void;
  chatFont?: ChatFont;
  onChatFontChange?: (value: ChatFont) => void;
  mentionSoundEnabled?: boolean;
  onMentionSoundEnabledChange?: (value: boolean) => void;
}

function LoginPanel({
  twitchConnected,
  twitchUser,
  twitchProfileImage,
  twitchUserName,
  twitchUserId,
  twitchChannels = [],
  selectedTwitchChannel = '',
  favoriteChannels = [],
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
  embedDefaultOpen = true,
  onEmbedDefaultOpenChange,
  unifyChatEnabled = false,
  onUnifyChatEnabledChange,
  fontSize = 14,
  onFontSizeChange,
  chatFont = 'inter' as ChatFont,
  onChatFontChange,
  mentionSoundEnabled = true,
  onMentionSoundEnabledChange,
}: LoginPanelProps) {
  const [manualChannel, setManualChannel] = React.useState('');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [showEmbedConfig, setShowEmbedConfig] = React.useState(false);

  const filteredChannels = React.useMemo(() => {
    if (!searchQuery.trim()) return twitchChannels;
    const query = searchQuery.toLowerCase();
    return twitchChannels.filter(
      (channel) =>
        channel.displayName.toLowerCase().includes(query) ||
        channel.name.toLowerCase().includes(query)
    );
  }, [searchQuery, twitchChannels]);

  const handleManualJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualChannel.trim() && onChannelChange) {
      onChannelChange(manualChannel.trim().toLowerCase());
      setManualChannel('');
    }
  };
  return (
    <div className="login-panel">
      <div className="login-panel-header">
        <h3>Connected Accounts</h3>
        <button
          onClick={() => setShowEmbedConfig(true)}
          className="icon-button small"
          title="Configure global settings"
        >
          <FaCog />
        </button>
      </div>

      <div className="platform-login twitch">
        <div className="platform-header">
          <span className="platform-name">Twitch</span>
        </div>

        {twitchConnected && twitchUser ? (
          <div className="connected-info">
            <div className="user-profile-container">
              <div
                className="user-profile-link"
                onClick={() => (twitchUserId || twitchUserName) && onChannelChange?.(twitchUserId || twitchUserName!)}
                title={`Switch to ${twitchUser}'s channel`}
              >
                {twitchProfileImage && (
                  <img src={twitchProfileImage} alt={twitchUser} className="profile-image" loading="eager" />
                )}
                <div className="user-details">
                  <p className="user-name">{twitchUser}</p>
                </div>
              </div>

              <div className="user-actions">
                {onManageWatchlist && (
                  <button
                    onClick={onManageWatchlist}
                    className="icon-button"
                    title="Manage Notification Streams"
                  >
                    <FaEye />
                  </button>
                )}
                {onManageYoutubeLinks && (
                  <button
                    onClick={onManageYoutubeLinks}
                    className="icon-button youtube-icon-btn"
                    title="Link YouTube channels"
                  >
                    <FaYoutube />
                  </button>
                )}
              </div>
            </div>
            <button onClick={onTwitchLogout} className="logout-btn">
              Logout
            </button>

            {twitchChannels && twitchChannels.length > 0 && (
              <div className="channels-section">
                <label className="section-label">
                  Channels ({filteredChannels.length})
                </label>
                <input
                  type="text"
                  placeholder="Search channels..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="channel-search-input"
                />
                <div className="channel-list">
                  {filteredChannels.map((channel) => (
                    <div
                      key={channel.id}
                      className={`channel-item ${selectedTwitchChannel === channel.id ? 'selected' : ''}`}
                      onClick={() => onChannelChange?.(channel.id)}
                      title={channel.displayName}
                    >
                      {channel.profileImageUrl && (
                        <img
                          src={channel.profileImageUrl}
                          alt={channel.displayName}
                          className="channel-item-image"
                        />
                      )}
                      <span className="channel-item-name">
                        {channel.displayName}
                      </span>
                      {channel.viewerCount !== undefined && channel.viewerCount !== null && (
                        <span className="viewer-count">
                          <FaUsers size={12} /> {channel.viewerCount.toLocaleString()}
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation(); // Don't also select the channel when toggling a favorite
                          onToggleFavorite?.(channel.id);
                        }}
                        className={`favorite-button ${favoriteChannels.includes(channel.id) ? 'active' : ''}`}
                        title={favoriteChannels.includes(channel.id) ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        {favoriteChannels.includes(channel.id) ? <FaStar size={16} /> : <FaRegStar size={16} />}
                      </button>
                    </div>
                  ))}
                </div>

                <div className="manual-join-section">
                  <label className="section-label">
                    Or join manually
                  </label>
                  <form onSubmit={handleManualJoin} className="join-form">
                    <input
                      type="text"
                      value={manualChannel}
                      onChange={(e) => setManualChannel(e.target.value)}
                      placeholder="Enter channel name"
                      className="join-input"
                    />
                    <button
                      type="submit"
                      disabled={!manualChannel.trim()}
                      className="logout-btn"
                      style={{
                        backgroundColor: manualChannel.trim() ? '#555555' : '#333333',
                        cursor: manualChannel.trim() ? 'pointer' : 'not-allowed',
                      }}
                    >
                      Join
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        ) : (
          <button onClick={onTwitchLogin} className="login-btn twitch-btn">
            Login with Twitch
          </button>
        )}

        {/* YouTube login/logout */}
        <div className="youtube-section">
          {youtubeConnected ? (
            <div className="youtube-info-row">
              <div className="youtube-user-info">
                <FaYoutube style={{ color: '#FF0000', fontSize: '18px', flexShrink: 0 }} />
                <span className="youtube-user-name">{youtubeUser || 'YouTube'}</span>
              </div>
              <button onClick={onYoutubeLogout} className="logout-btn small">
                Logout
              </button>
            </div>
          ) : onYoutubeLogin ? (
            <button onClick={onYoutubeLogin} className="login-btn youtube-btn" style={{ width: '100%' }}>
              Login with YouTube
            </button>
          ) : null}
        </div>
      </div>

      {showEmbedConfig && (
        <EmbedConfigModal
          embedDefaultOpen={embedDefaultOpen}
          onEmbedDefaultOpenChange={(value) => {
            if (onEmbedDefaultOpenChange) {
              onEmbedDefaultOpenChange(value);
            }
          }}
          unifyChatEnabled={unifyChatEnabled}
          onUnifyChatEnabledChange={(value) => {
            if (onUnifyChatEnabledChange) {
              onUnifyChatEnabledChange(value);
            }
          }}
          fontSize={fontSize}
          onFontSizeChange={(value) => {
            if (onFontSizeChange) {
              onFontSizeChange(value);
            }
          }}
          chatFont={chatFont}
          onChatFontChange={(value) => {
            if (onChatFontChange) {
              onChatFontChange(value);
            }
          }}
          mentionSoundEnabled={mentionSoundEnabled}
          onMentionSoundEnabledChange={(value) => {
            if (onMentionSoundEnabledChange) {
              onMentionSoundEnabledChange(value);
            }
          }}
          onClose={() => setShowEmbedConfig(false)}
        />
      )}
    </div>
  );
}

export default memo(LoginPanel);
