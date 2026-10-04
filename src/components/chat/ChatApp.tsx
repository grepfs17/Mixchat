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
import { useSongQueue } from "../../hooks/chat/useSongQueue";
import { useMusicPlayer } from "../../hooks/chat/useMusicPlayer";
import type { SongQueueItem } from "../../lib/songQueue/types";
import { sendHelixMessage } from "../../lib/twitch";
import { sendYouTubeChatMessage } from "../../lib/youtubeChat";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";

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

  // Reset YouTube connection when URL/video changes — intentional
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
    "giveaway" | "song-queue" | "music-player" | null
  >(null);
  const showModTools = streamerToolsEnabled && isOnOwnChannel;

  const openStreamerTools = useCallback(
    (
      initialTool:
        | "giveaway"
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
    enabled: showModTools,
  });

  // Ingest new messages into the giveaway's entry buffer.
  //
  // The chat's `messages` array is capped at the user's max displayed
  // messages and rolls over, so we cannot derive entries from it after the
  // buffer rotates.
  // Instead, the hook maintains its own buffer that survives the chat cap.
  // Here we feed it each new chat message exactly once. We track which
  // message ids have already been ingested so re-renders don't replay.
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

  // Song Queue: another stream of messages → server-side queue. The hook
  // dedupes by message id internally, so we can call `ingestMessage` on
  // every render without worry.
  const onSongError = useCallback(
    (msg: string) => setNotification({ message: msg, type: "error" }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Send a chat reply from the song queue (e.g. "song too long" notice).
  // We use `sendHelixMessage` directly rather than the wrapper
  // `handleSendMessage` because the wrapper keys replies off of a
  // `replyingTo` state variable (not its `_replyToId` argument) and
  // also calls `setReplyingTo(undefined)` + scroll-into-view + sets
  // `isLoading` — all side-effects we don't want for an automated
  // reply. The message is sent as the authenticated streamer either
  // way.
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
        // Best-effort; the rejection is still visible in the streamer UI.
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

  // Post a "now playing" announcement in chat when a new song starts and
  // `announceOnPlay` is enabled. Sends to whichever platform(s) the
  // streamer is actively streaming on; if the streamer is on both (e.g.
  // Twitch + YouTube restream), it fans out to both.
  const onSongAnnounce = useCallback(
    async (item: SongQueueItem) => {
      const videoUrl = `https://youtu.be/${item.videoId}`;
      const channelTitle = item.channelTitle ? ` by ${item.channelTitle}` : "";
      const submitter = item.submitter?.author
        ? ` (added by @${item.submitter.author})`
        : "";
      const message = `🎵 Now playing: ${item.title}${channelTitle}${submitter} — ${videoUrl}`;
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
    enabled: showModTools && Boolean(songChannelKey),
    onError: onSongError,
    onSendChat: onSongSendChat,
    onAnnounceNowPlaying: onSongAnnounce,
  });
  const { ingestMessage: ingestSong, phase: songPhase } = songQueue;

  // Music Player is purely client-side (IndexedDB). The hook is always
  // created (React hooks can't be conditional), but the visual components
  // are only rendered when the user is on their own channel with streamer
  // tools enabled.
  const musicPlayer = useMusicPlayer();
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
          songQueue={songQueue}
          musicPlayer={musicPlayer}
          showModTools={showModTools}
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
          state={chatState}
          appProps={props}
          ytConnectionState={ytConnectionState}
          onYtConnectionChange={handleYtConnectionChange}
          messageInputRef={messageInputRef}
          unifiedInputRef={unifiedInputRef}
          onMentionUser={handleMentionUser}
          onOpenModTools={openStreamerTools}
          onNotification={showNotification}
          showModTools={showModTools}
        />

        <MobileTouchHintModal twitchConnected={props.twitchConnected} />
        <ThemeMascots chatTheme={chatTheme} />
      </div>
    </ModerationContext.Provider>
  );
}
