import { useState, useCallback, useEffect } from "react";
import { FaTimes, FaChevronLeft, FaChevronRight, FaTwitch } from "react-icons/fa";
import LoginPanel from "./LoginPanel";
import ChatApp from "./chat/ChatApp";
import StreamEmbed from "./StreamEmbed";
import LiveNotification from "./LiveNotification";
import WatchlistManager from "./WatchlistManager";
import YouTubeLinker from "./YouTubeLinker";

import { useStreamMonitor } from "../hooks/app/useStreamMonitor";
import { useAuthSessions } from "../hooks/app/useAuthSessions";
import { useTwitchChannels } from "../hooks/app/useTwitchChannels";
import { useChatSettings } from "../hooks/app/useChatSettings";
import { useYoutubeLink } from "../hooks/app/useYoutubeLink";
import { useEmbedState } from "../hooks/app/useEmbedState";
import { useUiState } from "../hooks/app/useUiState";
import { useMyChannelInfo } from "../hooks/app/useMyChannelInfo";
import { markStreamerNotified } from "../lib/streamMonitor";
import { primeAudioContext } from "../hooks/chat/useTwitchChat";
import StreamGrid from "./StreamGrid";
import type { StreamTransitionInfo } from "./StreamGrid";
import StreamTransitionOverlay from "./StreamTransitionOverlay";
import LandingPage from "./LandingPage";

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
    splitChatEnabled,
    setSplitChatEnabled,
    chatTheme,
    setChatTheme,
    hideViewerCount,
    setHideViewerCount,
    disableModModeByDefault,
    setDisableModModeByDefault,
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
  } = useChatSettings();
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
    return <LandingPage onTwitchLogin={handleTwitchLogin} />;
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: leftColumnVisible ? "280px 1fr" : "1fr",
        gap: "0",
        height: "100%",
      }}
      data-hide-timestamps={hideChatTimestamps}
      onClick={primeAudioContext}
      onKeyDown={primeAudioContext}
    >
      {leftColumnVisible && (
        <div
          data-sidebar-section
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0",
            overflowY: "auto",
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
            <button
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
            onChannelChange={(channelId) => setChannelData(channelId)}
            onRequestClose={() => {
              if (window.innerWidth < 1366) setLeftColumnVisible(false);
            }}
            onTwitchLogin={handleTwitchLogin}
            onTwitchLogout={handleTwitchLogout}
            youtubeConnected={!!sessions.youtube}
            youtubeUser={sessions.youtube?.displayName}
            onYoutubeLogin={handleYoutubeLogin}
            onYoutubeLogout={handleYoutubeLogout}
            onManageWatchlist={() => setShowWatchlistManager(true)}
            onManageYoutubeLinks={() => setShowYoutubeLinker(true)}
            linkedYoutubeChannelIds={linkedYoutubeChannelIds}
            embedDefaultOpen={embedDefaultOpen}
            onEmbedDefaultOpenChange={setEmbedDefaultOpen}
            unifyChatEnabled={unifyChatEnabled}
            onUnifyChatEnabledChange={(v: boolean) => {
              setUnifyChatEnabled(v);
              if (v) setUseYoutubeEmbed(false);
            }}
            useYoutubeEmbed={useYoutubeEmbed}
            onUseYoutubeEmbedChange={(v: boolean) => {
              setUseYoutubeEmbed(v);
              if (v) setUnifyChatEnabled(false);
            }}
            fontSize={fontSize}
            onFontSizeChange={setFontSize}
            chatFont={chatFont}
            onChatFontChange={setChatFont}
            mentionSoundEnabled={mentionSoundEnabled}
            onMentionSoundEnabledChange={setMentionSoundEnabled}
            mentionVolume={mentionVolume}
            onMentionVolumeChange={setMentionVolume}
            mentionSoundType={mentionSoundType}
            onMentionSoundTypeChange={setMentionSoundType}
            showDeletedMessages={showDeletedMessages}
            onShowDeletedMessagesChange={setShowDeletedMessages}
            compactActions={compactActions}
            onCompactActionsChange={setCompactActions}
            splitChatEnabled={splitChatEnabled}
            onSplitChatEnabledChange={setSplitChatEnabled}
            chatTheme={chatTheme}
            onChatThemeChange={setChatTheme}
            hideViewerCount={hideViewerCount}
            onHideViewerCountChange={setHideViewerCount}
            disableModModeByDefault={disableModModeByDefault}
            onDisableModModeByDefaultChange={setDisableModModeByDefault}
            hideChatTimestamps={hideChatTimestamps}
            onHideChatTimestampsChange={setHideChatTimestamps}
            eventSounds={eventSounds}
            onEventSoundChange={handleEventSoundChange}
            eventSoundVolume={eventSoundVolume}
            onEventSoundVolumeChange={setEventSoundVolume}
            ignoredUsers={ignoredUsers}
            onIgnoredUsersChange={setIgnoredUsers}
            hasYoutubeSession={!!sessions.youtube}
            onReauthYoutube={handleYoutubeLogin}
            onGoHome={() => {
              clearSelection();
              setStreamTransition(null);
              window.history.pushState({}, "", "/");
            }}
          />
        </div>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            showStreamEmbed && !!selectedTwitchChannel
              ? `${videoRatio}fr 2px ${100 - videoRatio}fr`
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
              <button
                onClick={() => setLeftColumnVisible((v) => !v)}
                className="sidebar-toggle-button sidebar-toggle-button--home"
                title={leftColumnVisible ? "Close sidebar" : "Open sidebar"}
              >
                {leftColumnVisible ? <FaChevronLeft size={14} /> : <FaChevronRight size={14} />}
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
                </div>
              </div>
              {(myChannelInfo.description || myChannelInfo.followerCount !== null) && (
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
                <button
                  className="your-channel-btn"
                  onClick={() =>
                    setChannelData(sessions.twitch!.userId)
                  }
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
              </div>
            </div>
            <StreamGrid
              channels={twitchChannels}
              favoriteChannels={favoriteChannels}
              linkedYoutubeChannelIds={linkedYoutubeChannelIds}
              onChannelSelect={(id, transitionInfo) =>
                setChannelData(id, transitionInfo)
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
                  <button
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
                      <button
                        onClick={() => setPlayerType("embed")}
                        className={`player-type-btn${playerType === "embed" ? " active-twitch" : ""}`}
                        title="Twitch embed player"
                      >
                        Twitch
                      </button>
                      <button
                        onClick={() => setPlayerType("m3u8")}
                        className={`player-type-btn${playerType === "m3u8" ? " active-m3u8" : ""}`}
                        title="M3U8 HLS player"
                      >
                        M3U8 (experimental)
                      </button>
                      {linkedYoutubeUrl && (
                        <button
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
                          <div
                            className="quality-selector__backdrop"
                            onClick={() => setShowHlsQualityMenu(false)}
                          />
                        )}
                        <div className="quality-selector__inner">
                          <button
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
                                <button
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
                    <button
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
                  width: "4px",
                  backgroundColor: "#1a1a1a",
                  cursor: "col-resize",
                  userSelect: "none",
                  transition: isDragging ? "none" : "background-color 0.2s",
                }}
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
                splitChatEnabled={splitChatEnabled}
                chatTheme={chatTheme}
                hideViewerCount={shouldHideViewerCount}
                disableModModeByDefault={disableModModeByDefault}
                modModeTargets={modModeTargets}
                setModModeTargetForChannel={setModModeTargetForChannel}
                eventSounds={eventSounds}
                eventSoundVolume={eventSoundVolume}
                ignoredUsers={ignoredUsers}
                onFollowRaid={(channelLogin) => setChannelData(channelLogin)}
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
            setChannelData(newLiveStreamer.id);
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
    </div>
  );
}
