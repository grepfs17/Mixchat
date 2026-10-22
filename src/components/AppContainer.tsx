import { useState, useCallback, useMemo } from "react";
import { SettingsProvider } from "../contexts/SettingsContext";
import { useStreamMonitor } from "../hooks/app/useStreamMonitor";
import { useAuthSessions } from "../hooks/app/useAuthSessions";
import { useTwitchChannels } from "../hooks/app/useTwitchChannels";
import { useChatSettings } from "../hooks/app/useChatSettings";
import { useYoutubeLink } from "../hooks/app/useYoutubeLink";
import { useEmbedState } from "../hooks/app/useEmbedState";
import { useUiState } from "../hooks/app/useUiState";
import { useMyChannelInfo } from "../hooks/app/useMyChannelInfo";
import { useAppModals } from "../hooks/app/useAppModals";
import { useInitialLoading } from "../hooks/app/useInitialLoading";
import { useChannelSelection } from "../hooks/app/useChannelSelection";
import { IS_TWITCH_ONLY } from "../lib/constants";
// storageMigration runs at import time, importing it triggers the migration.
import "../lib/storageMigration";
import { primeAudioContext } from "../hooks/chat/useTwitchChat";
import type { StreamTransitionInfo } from "./StreamGrid";
import LandingPage from "./LandingPage";
import AppSidebar from "./app/AppSidebar";
import HomeChannelView from "./app/HomeChannelView";
import ChatView from "./app/ChatView";
import AppModals from "./app/AppModals";
import LoadingScreen, { type LoadingStep } from "./app/LoadingScreen";

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
    isRestoringSession,
    setIsLoading,
    twitchLogin: handleTwitchLogin,
    twitchLogout,
    youtubeLogin: handleYoutubeLogin,
    youtubeDriveLogin: handleYoutubeDriveLogin,
    youtubeLogout: handleYoutubeLogout,
    clearTwitchSession,
    twitchDevice,
    cancelTwitchDevice,
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
    channelsReady,
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
  const { showStreamEmbed, hideChatTimestamps, autoFoldSidebar } = chatSettings;
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
    defaultPlayerType: chatSettings.defaultPlayerType,
    defaultHlsQuality: chatSettings.defaultHlsQuality,
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

  const {
    showOnboarding,
    showFavoriteChannels,
    setShowFavoriteChannels,
    handleOnboardingComplete,
  } = useAppModals(sessions.twitch);

  const clientId = import.meta.env.PUBLIC_TWITCH_CLIENT_ID;
  const { newLiveStreamer, clearNewNotification } = useStreamMonitor({
    session: sessions.twitch,
    clientId,
    enabled: !!sessions.twitch,
    checkInterval: 60000, // Check every minute
  });

  // Mark app-level loading complete once the initial channel fetch settles.
  useInitialLoading(
    channelsReady,
    sessions.twitch,
    isRestoringSession,
    setIsLoading,
  );

  const loadingSteps = useMemo<LoadingStep[]>(() => {
    const hasTwitchSession = !!sessions.twitch;
    const tokenReady = !!sessions.twitch?.accessToken;
    const steps: LoadingStep[] = [
      {
        id: "session",
        label: "Restoring your session",
        detail: isRestoringSession
          ? "Reading saved preferences"
          : "Session restored",
        status: isRestoringSession ? "active" : "complete",
        weight: 20,
      },
    ];

    if (hasTwitchSession) {
      steps.push({
        id: "account",
        label: "Connecting to Twitch",
        detail: tokenReady ? "Account connected" : "Refreshing access token",
        status: tokenReady ? "complete" : "active",
        weight: 30,
      });
    }

    steps.push({
      id: "channels",
      label: "Loading followed channels",
      detail: channelsReady
        ? "Channels ready"
        : tokenReady
          ? "Fetching your channel list"
          : "Waiting for Twitch",
      status: channelsReady ? "complete" : tokenReady ? "active" : "pending",
      weight: 45,
    });

    steps.push({
      id: "ready",
      label: "Preparing your workspace",
      detail: channelsReady ? "All set" : "Waiting for channels",
      status: channelsReady ? "complete" : "pending",
      weight: 5,
    });

    return steps;
  }, [isRestoringSession, sessions.twitch, channelsReady]);

  // Channel selection plus the reload auto-fold guard.
  const { handleChannelSelect } = useChannelSelection({
    setChannelData,
    autoFoldSidebar,
    setLeftColumnVisible,
    selectedTwitchChannel,
  });

  // Auth login flows now live in useAuthSessions. The Twitch logout also has
  // to clear non-auth state (channel list, current selection, favorites).
  const handleTwitchLogout = useCallback(() => {
    twitchLogout();
    resetChannels();
  }, [twitchLogout, resetChannels]);

  // While sessions are being restored and channels are loading, show the
  // staged loading screen so the wait is informative.
  if (isLoading) {
    return <LoadingScreen steps={loadingSteps} />;
  }

  // Not logged in and not loading, show the landing page
  if (!isLoggingIn && !sessions.twitch) {
    return (
      <LandingPage onTwitchLogin={handleTwitchLogin} twitchOnly={IS_TWITCH_ONLY} />
    );
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
        <AppSidebar
          leftColumnVisible={leftColumnVisible}
          setLeftColumnVisible={setLeftColumnVisible}
          sessions={sessions}
          sortedChannels={sortedChannels}
          selectedTwitchChannel={selectedTwitchChannel}
          favoriteChannels={favoriteChannels}
          linkedYoutubeChannelIds={linkedYoutubeChannelIds}
          onToggleFavorite={toggleFavorite}
          onChannelSelect={handleChannelSelect}
          onTwitchLogin={handleTwitchLogin}
          onTwitchLogout={handleTwitchLogout}
          onYoutubeLogin={handleYoutubeLogin}
          onYoutubeLogout={handleYoutubeLogout}
          onYoutubeDriveLogin={handleYoutubeDriveLogin}
          onManageWatchlist={() => setShowWatchlistManager(true)}
          onManageYoutubeLinks={() => setShowYoutubeLinker(true)}
          onGoHome={() => {
            clearSelection();
            setStreamTransition(null);
            window.history.pushState({}, "", "/");
          }}
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              showStreamEmbed && !!selectedTwitchChannel
                ? `${videoRatio}fr 8px ${100 - videoRatio}fr`
                : "1fr",
            gap: "0",
            overflow: "hidden",
          }}
          data-app-grid
          className={`app-grid${streamTransition ? " app-grid--transitioning" : ""}`}
        >
          {sessions.twitch && !selectedTwitchChannel ? (
            <HomeChannelView
              twitchSession={sessions.twitch}
              youtubeSession={sessions.youtube}
              myChannelInfo={myChannelInfo}
              leftColumnVisible={leftColumnVisible}
              setLeftColumnVisible={setLeftColumnVisible}
              setShowFavoriteChannels={setShowFavoriteChannels}
              onChannelSelect={handleChannelSelect}
              twitchChannels={twitchChannels}
              favoriteChannels={favoriteChannels}
              linkedYoutubeChannelIds={linkedYoutubeChannelIds}
              onToggleFavorite={toggleFavorite}
              channelsLoading={channelsLoading}
            />
          ) : (
            <ChatView
              twitchSession={sessions.twitch}
              youtubeSession={sessions.youtube}
              selectedTwitchChannel={selectedTwitchChannel}
              selectedTwitchChannelName={selectedTwitchChannelName}
              selectedTwitchChannelDisplayName={
                selectedTwitchChannelDisplayName
              }
              showStreamEmbed={showStreamEmbed}
              setShowStreamEmbed={chatSettings.setShowStreamEmbed}
              viewerCount={viewerCount}
              leftColumnVisible={leftColumnVisible}
              setLeftColumnVisible={setLeftColumnVisible}
              linkedYoutubeUrl={linkedYoutubeUrl}
              youtubeStreamVideoId={youtubeStreamVideoId}
              playerType={playerType}
              setPlayerType={setPlayerType}
              hlsQualities={hlsQualities}
              setHlsQualities={setHlsQualities}
              selectedHlsQualityIdx={selectedHlsQualityIdx}
              setSelectedHlsQualityIdx={setSelectedHlsQualityIdx}
              showHlsQualityMenu={showHlsQualityMenu}
              setShowHlsQualityMenu={setShowHlsQualityMenu}
              embedRef={embedRef}
              isDragging={isDragging}
              setIsDragging={setIsDragging}
              streamTransition={streamTransition}
              setStreamTransition={setStreamTransition}
              onTwitchLogin={handleTwitchLogin}
              onChannelSelect={handleChannelSelect}
              chatSettings={chatSettings}
            />
          )}
        </div>
        <AppModals
          newLiveStreamer={newLiveStreamer}
          clearNewNotification={clearNewNotification}
          onChannelSelect={handleChannelSelect}
          showWatchlistManager={showWatchlistManager}
          setShowWatchlistManager={setShowWatchlistManager}
          allTwitchChannels={allTwitchChannels}
          showYoutubeLinker={showYoutubeLinker}
          setShowYoutubeLinker={setShowYoutubeLinker}
          notifyLinksChanged={notifyLinksChanged}
          showFavoriteChannels={showFavoriteChannels}
          setShowFavoriteChannels={setShowFavoriteChannels}
          favoriteChannels={favoriteChannels}
          onToggleFavorite={toggleFavorite}
          isDragging={isDragging}
          isLoggingIn={isLoggingIn}
          streamTransition={streamTransition}
          selectedTwitchChannel={selectedTwitchChannel}
          embedRef={embedRef}
          setStreamTransition={setStreamTransition}
          showOnboarding={showOnboarding}
          handleOnboardingComplete={handleOnboardingComplete}
          twitchDevice={twitchDevice}
          cancelTwitchDevice={cancelTwitchDevice}
          twitchSession={sessions.twitch}
        />
      </div>
    </SettingsProvider>
  );
}
