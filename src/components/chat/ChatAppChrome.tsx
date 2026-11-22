import Notification from "./shared/Notification";
import RaidNotification from "./shared/RaidNotification";
import HypeTrainBanner from "./shared/HypeTrainBanner";
import PollBanner from "./shared/PollBanner";
import PredictionBanner from "./shared/PredictionBanner";
import CelebrationBanner from "./shared/CelebrationBanner";
import PinnedChatBanner from "./shared/PinnedChatBanner";
import StreamerToolsModal from "./shared/StreamerToolsModal";
import GiveawayIndicator from "./shared/GiveawayIndicator";
import SongQueueMinimizedBar from "./shared/SongQueueIndicator";
import MusicPlayerMinimizedBar from "./shared/MusicPlayerIndicator";
import type { ChatAppState, ChatAppStateProps } from "../../hooks/chat/useChatAppState";
import { useGiveaway } from "../../hooks/chat/useGiveaway";
import type { UsePollCreatorResult } from "../../hooks/chat/usePollCreator";
import type { UsePredictionCreatorResult } from "../../hooks/chat/usePredictionCreator";
import { useSongQueue } from "../../hooks/chat/useSongQueue";
import { useMusicPlayer } from "../../hooks/chat/useMusicPlayer";
import type { usePinnedChatHighlight } from "../../hooks/chat/usePinnedChatHighlight";
import type { StreamToolsSettings } from "../../hooks/chat/useStreamToolsSettings";
import { IS_DESKTOP } from "../../lib/constants";

type StreamerToolId =
  | "giveaway"
  | "poll"
  | "prediction"
  | "song-queue"
  | "music-player"
  | null;
type AnnounceWinnerHandler = NonNullable<
  Parameters<typeof StreamerToolsModal>[0]["onAnnounce"]
>;

interface ChatAppChromeProps {
  state: ChatAppState;
  appProps: ChatAppStateProps;
  giveaway: ReturnType<typeof useGiveaway>;
  poll: UsePollCreatorResult;
  prediction: UsePredictionCreatorResult;
  songQueue: ReturnType<typeof useSongQueue>;
  musicPlayer: ReturnType<typeof useMusicPlayer>;
  showStreamTools: boolean;
  streamToolsRole: "owner" | "moderator";
  affiliateEligible: boolean;
  streamToolsSettings: StreamToolsSettings;
  onUpdateStreamToolsSettings: (
    patch: Partial<StreamToolsSettings>,
  ) => Promise<void>;
  showMusicBar: boolean;
  streamerToolsOpen: boolean;
  streamerToolsInitialTool: StreamerToolId;
  pinned: ReturnType<typeof usePinnedChatHighlight>;
  showPinnedBanner: boolean;
  onOpenStreamerTools: (initialTool?: StreamerToolId) => void;
  onCloseStreamerTools: () => void;
  onAnnounceWinner: AnnounceWinnerHandler;
  youtubeConnected: boolean;
  publicOrigin: string;
  channelKey: string | null;
}

export default function ChatAppChrome(props: ChatAppChromeProps) {
  return (
    <>
      <NotificationAndRaid state={props.state} appProps={props.appProps} />
      <StreamerToolsChrome {...props} />
      <EventBanners {...props} />
    </>
  );
}

function NotificationAndRaid({
  state,
  appProps,
}: Pick<ChatAppChromeProps, "state" | "appProps">) {
  return (
    <>
      {state.notification && (
        <Notification
          message={state.notification.message}
          type={state.notification.type}
          onClose={() => state.setNotification(null)}
        />
      )}

      {state.pendingRaid && (
        <RaidNotification
          raid={state.pendingRaid}
          isInitiator={state.isRaidInitiator}
          broadcasterChannel={appProps.selectedTwitchChannelName}
          onRaidNow={() => {
            appProps.onFollowRaid?.(state.pendingRaid!.targetLogin);
            state.setPendingRaid(null);
            state.setIsRaidInitiator(false);
          }}
          onCancelRaid={state.handleCancelRaid}
          onFollowRaid={() => {
            appProps.onFollowRaid?.(state.pendingRaid!.targetLogin);
            state.setPendingRaid(null);
          }}
          onDismiss={() => state.setPendingRaid(null)}
        />
      )}
    </>
  );
}

function StreamerToolsChrome(props: ChatAppChromeProps) {
  const {
    appProps,
    giveaway,
    poll,
    prediction,
    songQueue,
    musicPlayer,
    showStreamTools,
    streamToolsRole,
    affiliateEligible,
    streamToolsSettings,
    onUpdateStreamToolsSettings,
    showMusicBar,
    streamerToolsOpen,
    streamerToolsInitialTool,
    onOpenStreamerTools,
    onCloseStreamerTools,
    onAnnounceWinner,
    youtubeConnected,
    publicOrigin,
    channelKey,
  } = props;

  return (
    <>
      {showStreamTools && showMusicBar && (
        <MusicPlayerMinimizedBar
          player={musicPlayer}
          hidden={streamerToolsOpen}
          onOpen={() => onOpenStreamerTools("music-player")}
        />
      )}

      {!IS_DESKTOP && showStreamTools && songQueue.phase === "open" && (
        <SongQueueMinimizedBar
          queue={songQueue}
          isHost={streamToolsRole === "owner"}
          hidden={streamerToolsOpen}
          onOpen={() => onOpenStreamerTools("song-queue")}
          onEnd={async () => {
            await songQueue.end();
          }}
        />
      )}

      {showStreamTools && !streamerToolsOpen && giveaway.phase !== "config" && (
        <GiveawayIndicator
          giveaway={giveaway}
          onOpen={() => onOpenStreamerTools("giveaway")}
        />
      )}

      {streamerToolsOpen && (
        <StreamerToolsModal
          giveaway={giveaway}
          poll={poll}
          livePoll={poll.effectivePoll}
          prediction={prediction}
          livePrediction={props.state.prediction}
          songQueue={songQueue}
          musicPlayer={musicPlayer}
          onAnnounce={onAnnounceWinner}
          onMinimize={onCloseStreamerTools}
          onClose={onCloseStreamerTools}
          initialTool={streamerToolsInitialTool}
          youtubeConnected={youtubeConnected}
          publicOrigin={publicOrigin}
          channelKey={channelKey}
          streamGameId={appProps.isOnOwnChannel ? props.state.streamGameId : ""}
          streamGameName={props.state.streamGameName}
          onSearchCategories={props.state.handleSearchCategories}
          role={streamToolsRole}
          affiliateEligible={affiliateEligible}
          settings={streamToolsSettings}
          onUpdateSettings={onUpdateStreamToolsSettings}
        />
      )}
    </>
  );
}

function EventBanners({
  state,
  pinned,
  showPinnedBanner,
}: Pick<ChatAppChromeProps, "state" | "pinned" | "showPinnedBanner">) {
  return (
    <>
      {state.hypeTrain && (
        <HypeTrainBanner
          hypeTrain={state.hypeTrain}
          onDismiss={() => state.setHypeTrain(null)}
        />
      )}
      {state.poll && (
        <PollBanner poll={state.poll} onDismiss={() => state.setPoll(null)} />
      )}
      {state.prediction && (
        <PredictionBanner
          prediction={state.prediction}
          onDismiss={() => state.setPrediction(null)}
        />
      )}
      {state.celebration && (
        <CelebrationBanner
          celebration={state.celebration}
          onDismiss={() => state.setCelebration(null)}
        />
      )}
      {pinned.highlight && showPinnedBanner && (
        <PinnedChatBanner
          highlight={pinned.highlight}
          onDismiss={pinned.dismiss}
        />
      )}
    </>
  );
}
