import MobileTouchHintModal from "./shared/MobileTouchHintModal";
import type { UnifiedInputHandle } from "./shared/UnifiedInput";
import type { MessageInputHandle } from "./shared/MessageInput";
import { usePinnedChatHighlight } from "../../hooks/chat/usePinnedChatHighlight";
import ChatAppChrome from "./ChatAppChrome";
import ChatAppContent, { type YtConnectionState } from "./ChatAppContent";
import ThemeMascots from "./ThemeMascots";
import {
  useChatAppState,
  type ChatAppStateProps,
} from "../../hooks/chat/useChatAppState";
import { ModerationContext } from "../../contexts/ModerationContext";
import type { ModModeTarget } from "../../contexts/ModerationContext";
import type { ChatTheme, Platform, TwitchMessage } from "../../lib/types";
import type { YTMessage } from "./unified/types";
import type { GiveawayEntry } from "../../lib/streamerTools/giveaway";
import { useGiveaway } from "../../hooks/chat/useGiveaway";
import {
  usePollCreator,
  type PollCreatorPhase,
} from "../../hooks/chat/usePollCreator";
import {
  usePredictionCreator,
  type PredictionCreatorPhase,
} from "../../hooks/chat/usePredictionCreator";
import { useSongQueue } from "../../hooks/chat/useSongQueue";
import { useMusicPlayer } from "../../hooks/chat/useMusicPlayer";
import { parsePollCommand } from "../../lib/streamerTools/poll";
import { parsePredictionCommand } from "../../lib/streamerTools/prediction";
import { useStreamToolsSettings } from "../../hooks/chat/useStreamToolsSettings";
import type { SongQueueItem } from "../../lib/songQueue/types";
import { sendHelixMessage } from "../../lib/twitch";
import { sendYouTubeChatMessage } from "../../lib/youtubeChat";
import { IS_DESKTOP } from "../../lib/constants";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";

interface PollChatCommandDeps {
  isOnOwnChannel: boolean;
  showStreamTools: boolean;
  phase: PollCreatorPhase;
  openPollPanel: () => void;
  endPoll: () => Promise<void>;
  notify: (message: string, type: "success" | "error" | "info") => void;
}

/** Handle local poll commands. Returns true when the message was consumed. */
async function handlePollChatCommand(
  message: string,
  deps: PollChatCommandDeps,
): Promise<boolean> {
  const command = parsePollCommand(message);
  if (!command) return false;
  if (!deps.isOnOwnChannel) {
    deps.notify(
      "Only the broadcaster can create or end Twitch polls.",
      "error",
    );
    return true;
  }
  if (command === "createpoll") {
    if (!deps.showStreamTools) {
      deps.notify("Turn on Stream tools to create polls.", "info");
      return true;
    }
    deps.openPollPanel();
    return true;
  }
  if (deps.phase !== "active") {
    deps.notify("No active poll.", "info");
    return true;
  }
  await deps.endPoll();
  return true;
}

interface PredictionChatCommandDeps {
  isOnOwnChannel: boolean;
  showStreamTools: boolean;
  phase: PredictionCreatorPhase;
  openPredictionPanel: () => void;
  lock: () => Promise<void>;
  cancel: () => Promise<void>;
  notify: (message: string, type: "success" | "error" | "info") => void;
}

/** Handle local prediction commands. Returns true when consumed. */
async function handlePredictionChatCommand(
  message: string,
  deps: PredictionChatCommandDeps,
): Promise<boolean> {
  const command = parsePredictionCommand(message);
  if (!command) return false;
  if (!deps.isOnOwnChannel) {
    deps.notify(
      "Only the broadcaster can manage Twitch predictions.",
      "error",
    );
    return true;
  }
  if (command === "createprediction") {
    if (!deps.showStreamTools) {
      deps.notify("Turn on Stream tools to create predictions.", "info");
      return true;
    }
    deps.openPredictionPanel();
    return true;
  }
  if (command === "lockprediction") {
    if (deps.phase !== "active") {
      deps.notify("There is no active prediction to lock.", "info");
      return true;
    }
    await deps.lock();
    return true;
  }
  if (deps.phase !== "active" && deps.phase !== "locked") {
    deps.notify("There is no active prediction to cancel.", "info");
    return true;
  }
  await deps.cancel();
  return true;
}

export default function ChatApp(props: ChatAppStateProps) {
  const currentModModeTarget: ModModeTarget =
    props.modModeTargets?.[props.selectedTwitchChannel ?? ""] ?? "off";

  const chatState = useChatAppState({ ...props, modModeTarget: currentModModeTarget });
  const {
    messages,
    isLoading,
    pendingRaid,
    setPendingRaid,
    isRaidInitiator,
    setIsRaidInitiator,
    isRefreshingEmotes,
    selectedPlatforms,
    replyingTo,
    streamIsLive,
    streamUptime,
    streamStartedAt,
    streamTitle,
    streamGameId,
    streamGameName,
    notification,
    chatDisplayRef,
    unifiedChatRef,
    ytLoading,
    ytError,
    showYoutubeSection,
    chatSplitRatio,
    isDraggingChatSplit,
    ytMessages,
    ytOptimisticMessages,
    youtubeVideoId,
    isModerator,
    modModeActive,
    isYouTubeModerator,
    youtubeModModeActive,
    isFollowingChannelState,
    hypeTrain,
    setHypeTrain,
    poll,
    setPoll,
    prediction,
    setPrediction,
    celebration,
    setCelebration,
    setReplyingTo,
    setShowYoutubeSection,
    setIsDraggingChatSplit,
    setManualVideoId,
    setNotification,
    handleSendMessage,
    handleRefreshEmotes,
    handleDelete,
    handleBan,
    handleTimeout,
    handleUntimeout,
    handleWarn,
    handleShoutout,
    handlePinMessage,
    handleCancelRaid,
    handleUpdateTitle,
    handleUpdateCategory,
    handleSearchCategories,
    handleYtMessages,
    handleYtOptimisticMessage,
    handleYtOptimisticFailed,
    handleYtDelete,
    handleYtBan,
    handleYtTimeout,
    getYtMessageText,
    markYtMessageDeleted,
    slowModeWaitTime,
    followerModeMinutes,
    ignoredUsers,
    subscriptionStatuses,
    redemptionPubSubStatus,
  } = chatState;

  const [ytConnectionState, setYtConnectionState] = useState<YtConnectionState>(
    { connected: false, loading: true, error: null, reconnecting: false },
  );
  const handleYtConnectionChange = useCallback((state: YtConnectionState) => {
    setYtConnectionState(state);
  }, []);

  const messageInputRef = useRef<MessageInputHandle>(null);
  const unifiedInputRef = useRef<UnifiedInputHandle>(null);
  const handleMentionUser = useCallback((username: string) => {
    messageInputRef.current?.insertMention(username);
    unifiedInputRef.current?.insertMention(username);
  }, []);

  const {
    selectedTwitchChannel,
    selectedTwitchChannelName,
    twitchSession,
    linkedYoutubeUrl,
    youtubeSession,
    compactActions = false,
    keepModActionsVisible = false,
    modActionsFirst = false,
    doubleClickConfirmModActions = false,
    chatTheme = "default" as ChatTheme,
    streamerToolsEnabled = false,
    isOnOwnChannel = false,
  } = props;

  // Reset YouTube connection when URL/video changes, intentional
  // eslint-disable-next-line no-adjust-state-on-prop-change
  useEffect(() => {
    if (!linkedYoutubeUrl || !youtubeVideoId) {
      setYtConnectionState({
        connected: false,
        loading: false,
        error: null,
        reconnecting: false,
      });
    }
  }, [linkedYoutubeUrl, youtubeVideoId]);

  const showNotification = useCallback(
    (message: string, type: "success" | "error" | "info") => {
      setNotification({ message, type });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const pollCreator = usePollCreator({
    broadcasterId: selectedTwitchChannel || "",
    canManage: isOnOwnChannel,
    livePoll: poll,
    setPoll,
    onNotify: showNotification,
  });

  const predictionCreator = usePredictionCreator({
    broadcasterId: selectedTwitchChannel || "",
    canManage: isOnOwnChannel,
    livePrediction: prediction,
    setPrediction,
    onNotify: showNotification,
  });

  const handleSetModMode = useCallback(
    (target: ModModeTarget) => {
      if (props.setModModeTargetForChannel && selectedTwitchChannel) {
        props.setModModeTargetForChannel(selectedTwitchChannel, target);
      }
    },
    [props.setModModeTargetForChannel, selectedTwitchChannel],
  );

  const [streamerToolsOpen, setStreamerToolsOpen] = useState(false);
  const [streamerToolsInitialTool, setStreamerToolsInitialTool] = useState<
    "giveaway" | "poll" | "prediction" | "song-queue" | "music-player" | null
  >(null);

  const streamToolsChannelKey = selectedTwitchChannelName
    ? `twitch:${selectedTwitchChannelName.toLowerCase()}`
    : null;
  const streamToolsSettings = useStreamToolsSettings(streamToolsChannelKey);
  const isTwitchModerator = !!chatState.isModerator && !isOnOwnChannel;
  const showStreamTools = IS_DESKTOP
    ? streamerToolsEnabled && isOnOwnChannel
    : isOnOwnChannel
      ? streamerToolsEnabled
      : isTwitchModerator &&
        streamToolsSettings.settings.enabled &&
        streamToolsSettings.settings.allowMods;
  const streamToolsRole: "owner" | "moderator" = isOnOwnChannel
    ? "owner"
    : "moderator";

  // Keep the server-side master switch in sync with the streamer's local
  // preference so moderators see the same enabled/disabled state.
  useEffect(() => {
    if (!isOnOwnChannel || !streamToolsSettings.loaded) return;
    if (streamToolsSettings.settings.enabled === streamerToolsEnabled) return;
    void streamToolsSettings
      .update({ enabled: streamerToolsEnabled })
      .catch(() => {});
  }, [
    isOnOwnChannel,
    streamToolsSettings.loaded,
    streamToolsSettings.settings.enabled,
    streamerToolsEnabled,
  ]);

  useEffect(() => {
    if (!showStreamTools && streamerToolsOpen) setStreamerToolsOpen(false);
  }, [showStreamTools, streamerToolsOpen]);

  const openStreamerTools = useCallback(
    (
      initialTool:
        | "giveaway"
        | "poll"
        | "prediction"
        | "song-queue"
        | "music-player"
        | null = null,
    ) => {
      setStreamerToolsInitialTool(initialTool);
      setStreamerToolsOpen(true);
    },
    [],
  );
  const closeStreamerTools = useCallback(() => {
    setStreamerToolsOpen(false);
    setStreamerToolsInitialTool(null);
  }, []);

  const handleSendFromInput = useCallback(
    async (message: string, platforms: Platform[], replyToId?: string) => {
      const handled = await handlePollChatCommand(message, {
        isOnOwnChannel,
        showStreamTools,
        phase: pollCreator.phase,
        openPollPanel: () => openStreamerTools("poll"),
        endPoll: pollCreator.end,
        notify: showNotification,
      });
      if (handled) return;
      const predictionHandled = await handlePredictionChatCommand(message, {
        isOnOwnChannel,
        showStreamTools,
        phase: predictionCreator.phase,
        openPredictionPanel: () => openStreamerTools("prediction"),
        lock: predictionCreator.lock,
        cancel: predictionCreator.cancel,
        notify: showNotification,
      });
      if (predictionHandled) return;
      await handleSendMessage(message, platforms, replyToId);
    },
    [
      handleSendMessage,
      isOnOwnChannel,
      openStreamerTools,
      pollCreator.end,
      pollCreator.phase,
      predictionCreator.cancel,
      predictionCreator.lock,
      predictionCreator.phase,
      showNotification,
      showStreamTools,
    ],
  );

  const contentState = useMemo(
    () => ({ ...chatState, handleSendMessage: handleSendFromInput }),
    [chatState, handleSendFromInput],
  );

  const handleAnnounceWinner = useCallback(
    async (winner: GiveawayEntry, message: string) => {
      const platforms: Platform[] = [];
      if (winner.platform === "twitch") platforms.push("twitch");
      if (winner.platform === "youtube") platforms.push("youtube");
      if (platforms.length === 0) return;
      try {
        if (platforms.includes("twitch")) {
          await handleSendMessage(message, ["twitch"]);
        }
        if (platforms.includes("youtube") && youtubeVideoId) {
          try {
            await sendYouTubeChatMessage(youtubeVideoId, message);
          } catch (err) {
            showNotification(
              err instanceof Error ? err.message : "Failed to send winner to YouTube",
              "error",
            );
          }
        }
      } catch (err) {
        showNotification(
          err instanceof Error ? err.message : "Failed to announce winner",
          "error",
        );
      }
    },
    [handleSendMessage, youtubeVideoId, showNotification],
  );

  // Poll the Twitch GQL pinnedChatHighlight for the currently-viewed Twitch
  // channel. Pinned chat is a property of the selected Twitch stream, not
  // the chat layout, so we always poll when a Twitch channel is selected.
  const pinned = usePinnedChatHighlight(selectedTwitchChannelName ?? null);
  const pinnedHighlight = pinned.highlight;
  const showPinnedBanner =
    !!pinnedHighlight &&
    (pinned.dismissedMessageId !== pinnedHighlight.messageId ||
      pinned.dismissedPinnedAt !== pinnedHighlight.pinnedAt.toISOString());

  const giveaway = useGiveaway({
    owner: {
      twitchBroadcasterId: selectedTwitchChannel,
      youtubeChannelId: youtubeSession?.userId,
    },
    enabled: showStreamTools,
    channelKey: IS_DESKTOP ? null : streamToolsChannelKey,
  });

  // Feed the giveaway's own buffer one message at a time. The chat window
  // is capped and rotates, so entries can't be derived from it. Track ids
  // to avoid replaying messages across re-renders.
  const ingestedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (giveaway.phase !== "running") return;
    for (const m of messages) {
      if (!m?.id || ingestedIdsRef.current.has(m.id)) continue;
      ingestedIdsRef.current.add(m.id);
      giveaway.ingestMessage({ platform: "twitch", msg: m as TwitchMessage });
    }
  }, [messages, giveaway]);
  useEffect(() => {
    if (giveaway.phase !== "running") return;
    for (const m of ytMessages) {
      if (!m?.id || ingestedIdsRef.current.has(m.id)) continue;
      ingestedIdsRef.current.add(m.id);
      giveaway.ingestMessage({ platform: "youtube", msg: m as YTMessage });
    }
  }, [ytMessages, giveaway]);
  // Reset the ingestion ledger when the giveaway leaves the running phase so
  // the next run starts fresh.
  useEffect(() => {
    if (giveaway.phase !== "running") {
      ingestedIdsRef.current = new Set();
    }
  }, [giveaway.phase]);

  // Song Queue dedupes by message id internally, so ingesting every render
  // is safe.
  const onSongError = useCallback(
    (msg: string) => setNotification({ message: msg, type: "error" }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Use `sendHelixMessage` directly (not `handleSendMessage`) for automated
  // replies: the wrapper relies on `replyingTo` state and triggers reply
  // reset, scroll-into-view, and loading side effects we don't want.
  const onSongSendChat = useCallback(
    async (platform: "twitch" | "youtube", message: string, replyToMessageId: string) => {
      try {
        if (platform === "twitch") {
          if (!selectedTwitchChannel || !twitchSession?.userId) {
            console.warn(
              "[song-queue] cannot notify: twitch channel or session missing",
              { selectedTwitchChannel, hasSession: !!twitchSession },
            );
            return;
          }
          const serverMessageId = await sendHelixMessage(
            selectedTwitchChannel,
            twitchSession.userId,
            message,
            replyToMessageId || undefined,
          );
          if (!serverMessageId) {
            console.warn("[song-queue] Twitch send returned no message id");
          }
        } else if (platform === "youtube") {
          if (!youtubeVideoId) {
            console.warn(
              "[song-queue] cannot notify: youtube video id missing",
            );
            return;
          }
          try {
            await sendYouTubeChatMessage(youtubeVideoId, message);
          } catch (err) {
            showNotification(
              err instanceof Error ? err.message : "Failed to send song-queue message to YouTube",
              "error",
            );
          }
        }
      } catch (err) {
        // Best-effort. The rejection is still visible in the streamer UI.
        console.warn("[song-queue] chat-send failed", err);
        showNotification(
          err instanceof Error
            ? `Song queue reply failed: ${err.message}`
            : "Song queue reply failed",
          "error",
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedTwitchChannel, twitchSession?.userId, youtubeVideoId, showNotification],
  );

  // Announce a new song to every platform the streamer is live on (fans out
  // to both when restreaming).
  const onSongAnnounce = useCallback(
    async (item: SongQueueItem) => {
      const videoUrl = `https://youtu.be/${item.videoId}`;
      const channelTitle = item.channelTitle ? ` by ${item.channelTitle}` : "";
      const submitter = item.submitter?.author
        ? ` (added by @${item.submitter.author})`
        : "";
      const message = `🎵 Now playing: ${item.title}${channelTitle}${submitter} - ${videoUrl}`;
      const platforms: Platform[] = [];
      if (selectedTwitchChannel && twitchSession) platforms.push("twitch");
      if (youtubeVideoId && youtubeSession) platforms.push("youtube");
      if (platforms.length === 0) return;
      try {
        await handleSendMessage(message, platforms);
      } catch (err) {
        console.warn("[song-queue] announce send failed", err);
        showNotification(
          err instanceof Error
            ? `Now-playing announce failed: ${err.message}`
            : "Now-playing announce failed",
          "error",
        );
      }
    },
    [
      selectedTwitchChannel,
      twitchSession,
      youtubeVideoId,
      youtubeSession,
      handleSendMessage,
      showNotification,
    ],
  );

  const songChannelKey = useMemo(() => {
    if (selectedTwitchChannelName) return `twitch:${selectedTwitchChannelName.toLowerCase()}`;
    if (youtubeSession?.userId) return `youtube:${youtubeSession.userId}`;
    return null;
  }, [selectedTwitchChannelName, youtubeSession?.userId]);
  const songQueue = useSongQueue({
    channelKey: songChannelKey ?? "twitch:unknown",
    owner: {
      twitchBroadcasterId: selectedTwitchChannel,
      youtubeChannelId: youtubeSession?.userId,
    },
    enabled: !IS_DESKTOP && showStreamTools && Boolean(songChannelKey),
    onError: onSongError,
    onSendChat: onSongSendChat,
    onAnnounceNowPlaying: onSongAnnounce,
  });
  const { ingestMessage: ingestSong, phase: songPhase } = songQueue;

  // Client-side (IndexedDB) hook always runs. Visual components render only
  // when Stream tools are available for this viewer.
  const musicPlayer = useMusicPlayer({
    channelKey: IS_DESKTOP ? null : streamToolsChannelKey,
    isHost: isOnOwnChannel,
  });
  const musicHasItems =
    !!musicPlayer.activePlaylist &&
    musicPlayer.activePlaylist.items.length > 0;
  const showMusicBar = musicHasItems && !musicPlayer.miniBarHidden;
  useEffect(() => {
    if (songPhase !== "open") return;
    for (const m of messages) {
      if (!m?.id) continue;
      ingestSong({ platform: "twitch", msg: m as TwitchMessage });
    }
    for (const m of ytMessages) {
      if (!m?.id) continue;
      ingestSong({ platform: "youtube", msg: m as YTMessage });
    }
  }, [messages, ytMessages, ingestSong, songPhase]);

  const moderationValue = useMemo(
    () => ({
      isModerator,
      modModeActive,
      compactActions,
      keepModActionsVisible,
      modActionsFirst,
      doubleClickConfirmModActions,
      isYouTubeModerator,
      youtubeModModeActive,
      youtubeVideoId,
      youtubeOwnChannelId: youtubeSession?.userId ?? null,
      onDeleteMessage: handleDelete,
      onBanUser: handleBan,
      onTimeoutUser: handleTimeout,
      onUntimeoutUser: handleUntimeout,
      onWarnUser: handleWarn,
      onShoutoutUser: handleShoutout,
      onPinMessage: handlePinMessage,
      onDeleteYouTubeMessage: handleYtDelete,
      onBanYouTubeUser: handleYtBan,
      onTimeoutYouTubeUser: handleYtTimeout,
      onSetModMode: handleSetModMode,
    }),
    [
      isModerator,
      modModeActive,
      compactActions,
      keepModActionsVisible,
      modActionsFirst,
      doubleClickConfirmModActions,
      isYouTubeModerator,
      youtubeModModeActive,
      youtubeVideoId,
      youtubeSession?.userId,
      handleDelete,
      handleBan,
      handleTimeout,
      handleUntimeout,
      handleWarn,
      handleShoutout,
      handlePinMessage,
      handleYtDelete,
      handleYtBan,
      handleYtTimeout,
      handleSetModMode,
    ],
  );

  return (
    <ModerationContext.Provider value={moderationValue}>
      <div
        data-chat-app-container
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          position: "relative",
        }}
      >
        <ChatAppChrome
          state={chatState}
          appProps={props}
          giveaway={giveaway}
          poll={pollCreator}
          prediction={predictionCreator}
          songQueue={songQueue}
          musicPlayer={musicPlayer}
          showStreamTools={showStreamTools}
          streamToolsRole={streamToolsRole}
          streamToolsSettings={streamToolsSettings.settings}
          onUpdateStreamToolsSettings={streamToolsSettings.update}
          showMusicBar={showMusicBar}
          streamerToolsOpen={streamerToolsOpen}
          streamerToolsInitialTool={streamerToolsInitialTool}
          pinned={pinned}
          showPinnedBanner={showPinnedBanner}
          onOpenStreamerTools={openStreamerTools}
          onCloseStreamerTools={closeStreamerTools}
          onAnnounceWinner={handleAnnounceWinner}
          youtubeConnected={!!youtubeSession}
          publicOrigin={
            typeof window !== "undefined" ? window.location.origin : ""
          }
          channelKey={songChannelKey}
        />

        <ChatAppContent
          state={contentState}
          appProps={props}
          ytConnectionState={ytConnectionState}
          onYtConnectionChange={handleYtConnectionChange}
          messageInputRef={messageInputRef}
          unifiedInputRef={unifiedInputRef}
          onMentionUser={handleMentionUser}
          onOpenModTools={openStreamerTools}
          onNotification={showNotification}
          showModTools={showStreamTools}
        />

        <MobileTouchHintModal twitchConnected={props.twitchConnected} />
        <ThemeMascots chatTheme={chatTheme} />
      </div>
    </ModerationContext.Provider>
  );
}
