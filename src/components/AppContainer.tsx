import { useState, useCallback, useEffect, useRef } from "react";
import {
  FaTimes,
  FaChevronLeft,
  FaChevronRight,
  FaTwitch,
  FaYoutube,
  FaStar,
} from "react-icons/fa";
import LoginPanel from "./LoginPanel";
import ChatApp from "./chat/ChatApp";
import StreamEmbed from "./StreamEmbed";
import LiveNotification from "./LiveNotification";
import WatchlistManager from "./WatchlistManager";
import YouTubeLinker from "./YouTubeLinker";

import { SettingsProvider } from "../contexts/SettingsContext";
import { useStreamMonitor } from "../hooks/app/useStreamMonitor";
import { useAuthSessions } from "../hooks/app/useAuthSessions";
import { useTwitchChannels } from "../hooks/app/useTwitchChannels";
import { useChatSettings } from "../hooks/app/useChatSettings";
import { useYoutubeLink } from "../hooks/app/useYoutubeLink";
import { useEmbedState } from "../hooks/app/useEmbedState";
import { useUiState } from "../hooks/app/useUiState";
import { useMyChannelInfo } from "../hooks/app/useMyChannelInfo";
import { markStreamerNotified } from "../lib/streamMonitor";
import { IS_TWITCH_ONLY } from "../lib/constants";
// storageMigration runs at import time — importing it triggers the migration.
import "../lib/storageMigration";
import { primeAudioContext } from "../hooks/chat/useTwitchChat";
import StreamGrid from "./StreamGrid";
import type { StreamTransitionInfo } from "./StreamGrid";
import StreamTransitionOverlay from "./StreamTransitionOverlay";
import LandingPage from "./LandingPage";
import OnboardingWizard from "./OnboardingWizard";
import FavoriteChannelsModal from "./FavoriteChannelsModal";

const ONBOARDING_COMPLETE_KEY = "mixchat_onboarding_complete";

export interface TwitchChannel {
  id: string;
  name: string;
  displayName: string;
  title: string;
  profileImageUrl?: string;
  viewerCount?: number;
  gameName?: string;
  thumbnailUrl?: string;
}

export default function AppContainer() {
  const {
    sessions,
    isLoggingIn,
    isLoading,
    setIsLoading,
    twitchLogin: handleTwitchLogin,
    twitchLogout,
    youtubeLogin: handleYoutubeLogin,
    youtubeDriveLogin: handleYoutubeDriveLogin,
    youtubeLogout: handleYoutubeLogout,
    clearTwitchSession,
  } = useAuthSessions();
  const [streamTransition, setStreamTransition] =
    useState<StreamTransitionInfo | null>(null);
  const {
    twitchChannels,
    allTwitchChannels,
    sortedChannels,
    selectedTwitchChannel,
    selectedTwitchChannelName,
    selectedTwitchChannelDisplayName,
    channelsLoading,
    favoriteChannels,
    setChannelData,
    toggleFavorite,
    clearSelection,
    reset: resetChannels,
  } = useTwitchChannels({
    session: sessions.twitch,
    isInitialAuthLoading: isLoading,
    onSessionInvalid: clearTwitchSession,
    onStreamTransition: setStreamTransition,
  });
  const chatSettings = useChatSettings();
  const {
    embedDefaultOpen,
    setEmbedDefaultOpen,
    showStreamEmbed,
    setShowStreamEmbed,
    unifyChatEnabled,
    setUnifyChatEnabled,
    useYoutubeEmbed,
    setUseYoutubeEmbed,
    fontSize,
    setFontSize,
    chatFont,
    setChatFont,
    mentionSoundEnabled,
    setMentionSoundEnabled,
    mentionVolume,
    setMentionVolume,
    mentionSoundType,
    setMentionSoundType,
    showDeletedMessages,
    setShowDeletedMessages,
    compactActions,
    setCompactActions,
    keepModActionsVisible,
    setKeepModActionsVisible,
    modActionsFirst,
    setModActionsFirst,
    doubleClickConfirmModActions,
    setDoubleClickConfirmModActions,
    splitChatEnabled,
    setSplitChatEnabled,
    chatTheme,
    setChatTheme,
    hideViewerCount,
    setHideViewerCount,
    hideChatTimestamps,
    setHideChatTimestamps,
    eventSounds,
    eventSoundVolume,
    setEventSoundVolume,
    ignoredUsers,
    setIgnoredUsers,
    handleEventSoundChange,
    modModeTargets,
    setModModeTargetForChannel,
    streamerToolsEnabled,
    setStreamerToolsEnabled,
    defaultPlayerType,
    setDefaultPlayerType,
    defaultHlsQuality,
    setDefaultHlsQuality,
    renderThirdPartyEmotesOnYoutube,
    setRenderThirdPartyEmotesOnYoutube,
    autoFoldSidebar,
  } = chatSettings;
  const {
    linkedYoutubeUrl,
    youtubeStreamVideoId,
    linkedYoutubeChannelIds,
    notifyLinksChanged,
  } = useYoutubeLink({
    selectedTwitchChannel,
    twitchSession: sessions.twitch,
    youtubeSession: sessions.youtube,
  });
  const {
    videoRatio,
    setVideoRatio,
    isDragging,
    setIsDragging,
    embedRef,
    playerType,
    setPlayerType,
    hlsQualities,
    setHlsQualities,
    selectedHlsQualityIdx,
    setSelectedHlsQualityIdx,
    showHlsQualityMenu,
    setShowHlsQualityMenu,
    viewerCount,
  } = useEmbedState({
    selectedTwitchChannel,
    selectedTwitchChannelName,
    twitchAccessToken: sessions.twitch?.accessToken,
    linkedYoutubeUrl,
    defaultPlayerType,
    defaultHlsQuality,
  });
  const {
    leftColumnVisible,
    setLeftColumnVisible,
    showWatchlistManager,
    setShowWatchlistManager,
    showYoutubeLinker,
    setShowYoutubeLinker,
  } = useUiState();
  const myChannelInfo = useMyChannelInfo(sessions.twitch);

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showFavoriteChannels, setShowFavoriteChannels] = useState(false);
  useEffect(() => {
    if (!sessions.twitch) return;
    if (typeof localStorage === "undefined") return;
    if (localStorage.getItem(ONBOARDING_COMPLETE_KEY) === "1") return;
    setShowOnboarding(true);
  }, [sessions.twitch]);
  useEffect(() => {
    const handler = () => {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(ONBOARDING_COMPLETE_KEY);
      }
      setShowOnboarding(true);
    };
    window.addEventListener("mixchat:show-onboarding", handler);
    return () =>
      window.removeEventListener("mixchat:show-onboarding", handler);
  }, []);
  const handleOnboardingComplete = useCallback(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(ONBOARDING_COMPLETE_KEY, "1");
    }
    setShowOnboarding(false);
  }, []);

  const isOnOwnChannel = !!(
    sessions.twitch &&
    selectedTwitchChannel &&
    (selectedTwitchChannel === sessions.twitch.userId ||
      (sessions.twitch.username &&
        selectedTwitchChannelName.toLowerCase() ===
          sessions.twitch.username.toLowerCase()))
  );
  const shouldHideViewerCount = hideViewerCount && isOnOwnChannel;

  // Stream monitoring
  const clientId = import.meta.env.PUBLIC_TWITCH_CLIENT_ID;
  const { newLiveStreamer, clearNewNotification } = useStreamMonitor({
    session: sessions.twitch,
    clientId,
    enabled: !!sessions.twitch,
    checkInterval: 60000, // Check every minute
  });

  // Layout-side effects (resize listener, viewport height pin, modal flags)
  // are owned by useUiState.

  // Mark app-level loading complete once the initial channel fetch settles.
  // Mirrors the pre-extraction behavior: if there's no session or the session
  // already has a token, the channel fetch is the last gate before rendering.
  useEffect(() => {
    if (!channelsLoading && (!sessions.twitch || sessions.twitch.accessToken)) {
      setIsLoading(false);
    }
  }, [channelsLoading, sessions.twitch, setIsLoading]);

  // All embed-runtime state (videoRatio, drag handle, HLS quality, viewer
  // count, YouTube fallback) now lives in useEmbedState.

  // Auth login flows now live in useAuthSessions. The Twitch logout also has
  // to clear non-auth state (channel list, current selection, favorites).
  const handleChannelSelect = useCallback(
    (channelId: string, transitionInfo?: StreamTransitionInfo) => {
      setChannelData(channelId, transitionInfo);
      if (autoFoldSidebar) setLeftColumnVisible(false);
    },
    [setChannelData, autoFoldSidebar, setLeftColumnVisible],
  );

  // When a channel is loaded from URL on page reload (bypassing
  // handleChannelSelect), auto-fold the sidebar if the setting is on.
  const prevChannelRef = useRef(selectedTwitchChannel);
  useEffect(() => {
    if (
      autoFoldSidebar &&
      selectedTwitchChannel &&
      !prevChannelRef.current
    ) {
      setLeftColumnVisible(false);
    }
    prevChannelRef.current = selectedTwitchChannel;
  }, [selectedTwitchChannel, autoFoldSidebar, setLeftColumnVisible]);

  const handleTwitchLogout = useCallback(() => {
    twitchLogout();
    resetChannels();
  }, [twitchLogout, resetChannels]);

  // While sessions are being restored from localStorage, render skeleton cards
  if (isLoading) {
    return (
      <div className="loading-overlay">
        <div className="loading-spinner"></div>
        <div className="loading-text">Loading...</div>
      </div>
    );
  }

  // Not logged in and not loading — show the landing page
  if (!isLoggingIn && !sessions.twitch) {
    return <LandingPage onTwitchLogin={handleTwitchLogin} twitchOnly={IS_TWITCH_ONLY} />;
  }

  return (
    <SettingsProvider value={chatSettings}>
    <div
      className="main-layout"
      style={{
        display: "grid",
        gridTemplateColumns: leftColumnVisible ? "280px 1fr" : "0px 1fr",
        gap: "0",
        height: "100%",
        transition: "grid-template-columns 250ms ease",
      }}
      data-hide-timestamps={hideChatTimestamps}
      onClick={primeAudioContext}
      onKeyDown={primeAudioContext}
      role="presentation"
    >
      <div
        data-sidebar-section
        className={leftColumnVisible ? "" : "sidebar-collapsed"}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0",
          overflow: "hidden",
          overflowY: leftColumnVisible ? "auto" : undefined,
          padding: "0",
          borderRight: "1px solid #1c1c1c",
          background: "linear-gradient(160deg, #131313 0%, #0d0d0d 100%)",
        }}
      >
          {/* Close button for mobile */}
          <div
            style={{
              display: "none",
              justifyContent: "flex-end",
              padding: "8px",
              backgroundColor: "transparent",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
            className="sidebar-close-btn-container"
          >
            <button type="button"
              onClick={() => setLeftColumnVisible(false)}
              style={{
                background: "none",
                border: "none",
                color: "#999",
                cursor: "pointer",
                padding: "4px 8px",
                fontSize: "20px",
                lineHeight: "1",
                display: "flex",
                alignItems: "center",
              }}
              title="Close sidebar"
            >
              <FaTimes size={18} />
            </button>
          </div>
          <LoginPanel
            twitchConnected={!!sessions.twitch}
            twitchUser={sessions.twitch?.displayName}
            twitchProfileImage={sessions.twitch?.profileImageUrl}
            twitchUserName={sessions.twitch?.username}
            twitchUserId={sessions.twitch?.userId}
            twitchChannels={sortedChannels}
            selectedTwitchChannel={selectedTwitchChannel}
            favoriteChannels={favoriteChannels}
            onToggleFavorite={toggleFavorite}
            onChannelChange={(channelId) => handleChannelSelect(channelId)}
            onRequestClose={() => {
              if (window.innerWidth < 1366) setLeftColumnVisible(false);
            }}
            onTwitchLogin={handleTwitchLogin}
            onTwitchLogout={handleTwitchLogout}
            youtubeConnected={IS_TWITCH_ONLY ? false : !!sessions.youtube}
            youtubeUser={sessions.youtube?.displayName}
            onYoutubeLogin={IS_TWITCH_ONLY ? undefined : handleYoutubeLogin}
            onYoutubeLogout={IS_TWITCH_ONLY ? undefined : handleYoutubeLogout}
            onManageWatchlist={() => setShowWatchlistManager(true)}
            onManageYoutubeLinks={
              IS_TWITCH_ONLY ? undefined : () => setShowYoutubeLinker(true)
            }
            linkedYoutubeChannelIds={linkedYoutubeChannelIds}
            hasYoutubeSession={IS_TWITCH_ONLY ? false : !!sessions.youtube}
            hasDriveScope={IS_TWITCH_ONLY ? false : !!sessions.youtube?.hasDriveScope}
            onYoutubeDriveLogin={IS_TWITCH_ONLY ? () => {} : handleYoutubeDriveLogin}
            onReauthYoutube={IS_TWITCH_ONLY ? () => {} : handleYoutubeLogin}
            onGoHome={() => {
              clearSelection();
              setStreamTransition(null);
              window.history.pushState({}, "", "/");
            }}
          />
        </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            showStreamEmbed && !!selectedTwitchChannel
              ? `${videoRatio}fr 8px ${100 - videoRatio}fr`
              : "1fr",
          gap: "0",
          overflow: "hidden",
          backgroundColor: "#1a1a1a",
        }}
        data-app-grid
        className={`app-grid${streamTransition ? " app-grid--transitioning" : ""}`}
      >
        {sessions.twitch && !selectedTwitchChannel ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              height: "100%",
            }}
          >
            <div className="your-channel-banner">
              <button type="button"
                onClick={() => setLeftColumnVisible((v) => !v)}
                className="sidebar-toggle-button sidebar-toggle-button--home"
                title={leftColumnVisible ? "Close sidebar" : "Open sidebar"}
              >
                {leftColumnVisible ? (
                  <FaChevronLeft size={14} />
                ) : (
                  <FaChevronRight size={14} />
                )}
              </button>
              <div className="your-channel-left">
                {sessions.twitch.profileImageUrl && (
                  <img
                    src={sessions.twitch.profileImageUrl}
                    alt=""
                    className="your-channel-avatar"
                  />
                )}
                <div className="your-channel-identity">
                  <span className="your-channel-name">
                    {sessions.twitch.displayName}
                  </span>
                  {sessions.youtube && (
                    <span className="your-channel-youtube-chip">
                      <FaYoutube size={12} />
                      {sessions.youtube.displayName}
                    </span>
                  )}
                </div>
              </div>
              {(myChannelInfo.description ||
                myChannelInfo.followerCount !== null) && (
                <div className="your-channel-meta">
                  {myChannelInfo.followerCount !== null && (
                    <span className="your-channel-followers">
                      {myChannelInfo.followerCount.toLocaleString()} followers
                    </span>
                  )}
                  {myChannelInfo.description && (
                    <span className="your-channel-description">
                      {myChannelInfo.description}
                    </span>
                  )}
                </div>
              )}
              <div className="your-channel-actions">
                <button type="button"
                  className="your-channel-btn your-channel-btn--favorites"
                  onClick={() => setShowFavoriteChannels(true)}
                >
                  <FaStar size={14} />
                  Favorites
                </button>
                <button type="button"
                  className="your-channel-btn"
                  onClick={() => handleChannelSelect(sessions.twitch!.userId)}
                >
                  Go to channel
                </button>
                <a
                  className="your-channel-btn your-channel-btn--twitch"
                  href={`https://www.twitch.tv/${sessions.twitch!.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FaTwitch size={14} />
                  Open on Twitch
                </a>
                {sessions.youtube && (
                  <a
                    className="your-channel-btn your-channel-btn--youtube"
                    href={`https://www.youtube.com/channel/${sessions.youtube.userId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <FaYoutube size={14} />
                    Open on YouTube
                  </a>
                )}
              </div>
            </div>
            <StreamGrid
              channels={twitchChannels}
              favoriteChannels={favoriteChannels}
              linkedYoutubeChannelIds={linkedYoutubeChannelIds}
              onChannelSelect={(id, transitionInfo) =>
                handleChannelSelect(id, transitionInfo)
              }
              onToggleFavorite={toggleFavorite}
              loading={channelsLoading}
            />
          </div>
        ) : (
          <>
            {showStreamEmbed && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  minHeight: "0",
                }}
                data-stream-embed
              >
                <div className="stream-embed-header">
                  <button type="button"
                    onClick={() => setLeftColumnVisible((v) => !v)}
                    className="sidebar-toggle-button sidebar-toggle-button--in-embed"
                    title={
                      leftColumnVisible ? "Fold sidebar" : "Unfold sidebar"
                    }
                  >
                    {leftColumnVisible ? <FaChevronLeft /> : <FaChevronRight />}
                  </button>
                  <span className="stream-embed-title">
                    {playerType === "youtube" ? "YouTube" : "Twitch"}
                  </span>
                  <div className="player-type-center">
                    <div className="player-type-buttons">
                      <button type="button"
                        onClick={() => setPlayerType("embed")}
                        className={`player-type-btn${playerType === "embed" ? " active-twitch" : ""}`}
                        title="Twitch embed player"
                      >
                        Twitch
                      </button>
                      <button type="button"
                        onClick={() => setPlayerType("m3u8")}
                        className={`player-type-btn${playerType === "m3u8" ? " active-m3u8" : ""}`}
                        title="M3U8 HLS player"
                      >
                        M3U8 (experimental)
                      </button>
                      {linkedYoutubeUrl && (
                        <button type="button"
                          onClick={() => setPlayerType("youtube")}
                          className={`player-type-btn${playerType === "youtube" ? " active-youtube" : ""}`}
                          title="YouTube live stream"
                        >
                          YouTube
                        </button>
                      )}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      marginLeft: "auto",
                    }}
                  >
                    {playerType === "m3u8" && hlsQualities.length > 1 && (
                      <div className="quality-selector quality-selector--header">
                        {showHlsQualityMenu && (
                          <div          role="presentation"
          className="quality-selector__backdrop"
          onClick={() => setShowHlsQualityMenu(false)}
                          />
                        )}
                        <div className="quality-selector__inner">
                          <button type="button"
                            className="quality-selector__toggle"
                            onClick={() => setShowHlsQualityMenu((q) => !q)}
                            title={
                              hlsQualities[selectedHlsQualityIdx]?.label ??
                              "Quality"
                            }
                          >
                            ⚙{" "}
                            <span className="quality-selector__label">
                              {hlsQualities[selectedHlsQualityIdx]?.label ??
                                "Quality"}
                            </span>
                          </button>
                          {showHlsQualityMenu && (
                            <div className="quality-selector__menu">
                              {hlsQualities.map((q, i) => (
                                <button type="button"
                                  key={q.label}
                                  onClick={() => {
                                    setSelectedHlsQualityIdx(i);
                                    setShowHlsQualityMenu(false);
                                  }}
                                  className={`quality-selector__option${i === selectedHlsQualityIdx ? " quality-selector__option--active" : ""}`}
                                >
                                  {i === selectedHlsQualityIdx ? "✓ " : "  "}
                                  {q.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    <button type="button"
                      onClick={() => setShowStreamEmbed(false)}
                      className="stream-embed-close"
                      title="Hide stream embed"
                    >
                      <FaTimes size={15} />
                    </button>
                  </div>
                </div>
                <div
                  ref={embedRef}
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    backgroundColor: "#0a0a0a",
                    position: "relative",
                  }}
                >
                  {playerType === "youtube" ? (
                    youtubeStreamVideoId ? (
                      <iframe
                        width="100%"
                        height="100%"
                        src={`https://www.youtube.com/embed/${youtubeStreamVideoId}?autoplay=1`}
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        title="YouTube Stream"
                        style={{ border: "none" }}
                      />
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          height: "100%",
                          color: "#999",
                          fontSize: "13px",
                        }}
                      >
                        No YouTube live stream found for this channel
                      </div>
                    )
                  ) : (
                    <StreamEmbed
                      channelName={selectedTwitchChannelName}
                      playerType={playerType as "embed" | "m3u8"}
                      twitchConnected={!!sessions.twitch}
                      onTwitchLogin={handleTwitchLogin}
                      twitchAccessToken={sessions.twitch?.accessToken}
                      onQualitiesLoaded={setHlsQualities}
                      externalSelectedQualityIdx={selectedHlsQualityIdx}
                      placeholderThumbnailUrl={streamTransition?.thumbnailUrl}
                      onPlaceholderFadeOut={() => setStreamTransition(null)}
                    />
                  )}
                </div>
              </div>
            )}
            {showStreamEmbed && (
              <div
                data-resizer
                style={{
                  width: "8px",
                  backgroundColor: "#1a1a1a",
                  cursor: "col-resize",
                  userSelect: "none",
                  transition: isDragging ? "none" : "background-color 0.2s",
                }}
                role="separator"
        aria-orientation="vertical"
        aria-label="Panel resizer"
        tabIndex={0}
        onMouseDown={() => setIsDragging(true)}
                onMouseEnter={(e) =>
                  !isDragging &&
                  (e.currentTarget.style.backgroundColor = "#6366f1")
                }
                onMouseLeave={(e) =>
                  !isDragging &&
                  (e.currentTarget.style.backgroundColor = "#1a1a1a")
                }
                title="Drag to resize"
              />
            )}
            <div
              data-chat-section
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0",
                overflow: "hidden",
                minHeight: "0",
              }}
            >
              <ChatApp
                twitchConnected={!!sessions.twitch}
                selectedTwitchChannel={selectedTwitchChannel}
                selectedTwitchChannelName={selectedTwitchChannelName}
                selectedTwitchChannelDisplayName={
                  selectedTwitchChannelDisplayName
                }
                twitchSession={sessions.twitch}
                onToggleSidebar={() => setLeftColumnVisible(!leftColumnVisible)}
                sidebarVisible={leftColumnVisible}
                showStreamEmbed={showStreamEmbed}
                onToggleStreamEmbed={() => setShowStreamEmbed(!showStreamEmbed)}
                viewerCount={viewerCount}
                linkedYoutubeUrl={linkedYoutubeUrl || undefined}
                youtubeSession={sessions.youtube}
                unifyChatEnabled={unifyChatEnabled}
                useYoutubeEmbed={useYoutubeEmbed}
                fontSize={fontSize}
                chatFont={chatFont}
                mentionSoundEnabled={mentionSoundEnabled}
                mentionVolume={mentionVolume}
                mentionSoundType={mentionSoundType}
                showDeletedMessages={showDeletedMessages}
                compactActions={compactActions}
                keepModActionsVisible={keepModActionsVisible}
                modActionsFirst={modActionsFirst}
                doubleClickConfirmModActions={doubleClickConfirmModActions}
                splitChatEnabled={splitChatEnabled}
                chatTheme={chatTheme}
                hideViewerCount={shouldHideViewerCount}
                modModeTargets={modModeTargets}
                setModModeTargetForChannel={setModModeTargetForChannel}
                eventSounds={eventSounds}
                eventSoundVolume={eventSoundVolume}
                ignoredUsers={ignoredUsers}
                onFollowRaid={(channelLogin) => handleChannelSelect(channelLogin)}
                streamerToolsEnabled={streamerToolsEnabled}
                isOnOwnChannel={isOnOwnChannel}
                renderThirdPartyEmotesOnYoutube={renderThirdPartyEmotesOnYoutube}
              />
            </div>
          </>
        )}
      </div>

      {/* Live Notification Popup */}
      {newLiveStreamer && (
        <LiveNotification
          streamer={newLiveStreamer}
          onViewNow={() => {
            // Persist that user has seen this notification so it won't reappear
            markStreamerNotified(newLiveStreamer.id);
            handleChannelSelect(newLiveStreamer.id);
            clearNewNotification();
          }}
          onClose={() => {
            markStreamerNotified(newLiveStreamer.id);
            clearNewNotification();
          }}
        />
      )}

      {/* Watchlist Manager Modal */}
      {showWatchlistManager && (
        <WatchlistManager
          availableChannels={allTwitchChannels}
          onClose={() => setShowWatchlistManager(false)}
        />
      )}

      {/* YouTube Linker Modal */}
      {showYoutubeLinker && (
        <YouTubeLinker
          availableChannels={allTwitchChannels}
          onClose={() => setShowYoutubeLinker(false)}
          onLinksChanged={notifyLinksChanged}
        />
      )}

      {/* Favorite Channels Modal */}
      {showFavoriteChannels && (
        <FavoriteChannelsModal
          allChannels={allTwitchChannels}
          favoriteChannels={favoriteChannels}
          onToggleFavorite={toggleFavorite}
          onChannelSelect={(id) => handleChannelSelect(id)}
          onClose={() => setShowFavoriteChannels(false)}
        />
      )}

      {/* Resize Overlay to prevent iframe event capture */}
      {isDragging && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            cursor: "col-resize",
            background: "transparent",
            userSelect: "none",
          }}
        />
      )}

      {/* Loading / Login Overlay */}
      {isLoggingIn && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <div className="loading-text">Connecting...</div>
        </div>
      )}

      {/* Stream transition animation overlay */}
      {streamTransition && selectedTwitchChannel && (
        <StreamTransitionOverlay
          transitionInfo={streamTransition}
          targetRef={embedRef}
          onAnimationComplete={() => setStreamTransition(null)}
        />
      )}

      {showOnboarding && (
        <OnboardingWizard
          onComplete={handleOnboardingComplete}
        />
      )}
    </div>
    </SettingsProvider>
  );
}
