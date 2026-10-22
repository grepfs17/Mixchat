import type { Dispatch, RefObject, SetStateAction } from "react";
import LiveNotification from "../LiveNotification";
import WatchlistManager from "../WatchlistManager";
import YouTubeLinker from "../YouTubeLinker";
import FavoriteChannelsModal from "../FavoriteChannelsModal";
import StreamTransitionOverlay from "../StreamTransitionOverlay";
import OnboardingWizard from "../OnboardingWizard";
import TwitchDeviceLoginModal from "../TwitchDeviceLoginModal";
import FirefoxTrackingProtectionModal from "../FirefoxTrackingProtectionModal";
import { markStreamerNotified } from "../../lib/streamMonitor";
import type { LiveStreamer } from "../../lib/streamMonitor";
import type { TwitchChannel } from "../AppContainer";
import type { PlatformSession } from "../../lib/types";
import type { StreamTransitionInfo } from "../StreamGrid";
import type { TwitchDeviceState } from "../../hooks/app/useAuthSessions";

interface AppModalsProps {
  newLiveStreamer: LiveStreamer | null;
  clearNewNotification: () => void;
  onChannelSelect: (channelId: string) => void;
  showWatchlistManager: boolean;
  setShowWatchlistManager: Dispatch<SetStateAction<boolean>>;
  allTwitchChannels: TwitchChannel[];
  showYoutubeLinker: boolean;
  setShowYoutubeLinker: Dispatch<SetStateAction<boolean>>;
  notifyLinksChanged: () => void;
  showFavoriteChannels: boolean;
  setShowFavoriteChannels: Dispatch<SetStateAction<boolean>>;
  favoriteChannels: string[];
  onToggleFavorite: (channelId: string) => void;
  isDragging: boolean;
  isLoggingIn: boolean;
  streamTransition: StreamTransitionInfo | null;
  selectedTwitchChannel: string;
  embedRef: RefObject<HTMLDivElement | null>;
  setStreamTransition: Dispatch<SetStateAction<StreamTransitionInfo | null>>;
  showOnboarding: boolean;
  handleOnboardingComplete: () => void;
  twitchDevice: TwitchDeviceState | null;
  cancelTwitchDevice: () => void;
  twitchSession?: PlatformSession;
}

export default function AppModals({
  newLiveStreamer,
  clearNewNotification,
  onChannelSelect,
  showWatchlistManager,
  setShowWatchlistManager,
  allTwitchChannels,
  showYoutubeLinker,
  setShowYoutubeLinker,
  notifyLinksChanged,
  showFavoriteChannels,
  setShowFavoriteChannels,
  favoriteChannels,
  onToggleFavorite,
  isDragging,
  isLoggingIn,
  streamTransition,
  selectedTwitchChannel,
  embedRef,
  setStreamTransition,
  showOnboarding,
  handleOnboardingComplete,
  twitchDevice,
  cancelTwitchDevice,
  twitchSession,
}: AppModalsProps) {
  return (
    <>
      {newLiveStreamer && (
        <LiveNotification
          streamer={newLiveStreamer}
          onViewNow={() => {
            // Persist that user has seen this notification so it won't reappear
            markStreamerNotified(newLiveStreamer.id);
            onChannelSelect(newLiveStreamer.id);
            clearNewNotification();
          }}
          onClose={() => {
            markStreamerNotified(newLiveStreamer.id);
            clearNewNotification();
          }}
        />
      )}

      {showWatchlistManager && (
        <WatchlistManager
          availableChannels={allTwitchChannels}
          onClose={() => setShowWatchlistManager(false)}
        />
      )}

      {showYoutubeLinker && (
        <YouTubeLinker
          availableChannels={allTwitchChannels}
          onClose={() => setShowYoutubeLinker(false)}
          onLinksChanged={notifyLinksChanged}
        />
      )}

      {showFavoriteChannels && (
        <FavoriteChannelsModal
          allChannels={allTwitchChannels}
          favoriteChannels={favoriteChannels}
          onToggleFavorite={onToggleFavorite}
          onChannelSelect={(id) => onChannelSelect(id)}
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

      {isLoggingIn && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <div className="loading-text">Connecting...</div>
        </div>
      )}

      {streamTransition && selectedTwitchChannel && (
        <StreamTransitionOverlay
          transitionInfo={streamTransition}
          targetRef={embedRef}
          onAnimationComplete={() => setStreamTransition(null)}
        />
      )}

      {showOnboarding && <OnboardingWizard onComplete={handleOnboardingComplete} />}

      <TwitchDeviceLoginModal
        device={twitchDevice}
        onCancel={cancelTwitchDevice}
      />

      {/* Firefox Enhanced Tracking Protection notice, only when logged in */}
      {twitchSession && <FirefoxTrackingProtectionModal />}
    </>
  );
}
