import ChatDisplay from "./display";
import MobileTouchHintModal from "./shared/MobileTouchHintModal";
import UnifiedInput from "./shared/UnifiedInput";
import MessageInput from "./shared/MessageInput";
import Notification from "./shared/Notification";
import YouTubeChat from "./shared/YouTubeChat";
import UnifiedChat from "./unified";
import RaidNotification from "./shared/RaidNotification";
import HypeTrainBanner from "./shared/HypeTrainBanner";
import PollBanner from "./shared/PollBanner";
import PredictionBanner from "./shared/PredictionBanner";
import CelebrationBanner from "./shared/CelebrationBanner";
import SplitLayout from "./SplitLayout";
import StreamerToolsModal from "./shared/StreamerToolsModal";
import {
  useChatAppState,
  type ChatAppStateProps,
} from "../../hooks/chat/useChatAppState";
import { ModerationContext } from "../../contexts/ModerationContext";
import type { ModModeTarget } from "../../contexts/ModerationContext";
import type {
  ChatFont,
  ChatTheme,
  Platform,
  TwitchMessage,
} from "../../lib/types";
import type { YTMessage } from "./unified/types";
import type { GiveawayEntry } from "../../lib/streamerTools/giveaway";
import { useGiveaway } from "../../hooks/chat/useGiveaway";
import GiveawayIndicator from "./shared/GiveawayIndicator";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";

interface YtConnectionState {
  connected: boolean;
  loading: boolean;
  error: string | null;
}

export default function ChatApp(props: ChatAppStateProps) {
  const currentModModeTarget: ModModeTarget =
    props.modModeTargets?.[props.selectedTwitchChannel ?? ""] ?? "off";

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
    streamTitle,
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
    slowModeWaitTime,
    followerModeMinutes,
    ignoredUsers,
  } = useChatAppState({ ...props, modModeTarget: currentModModeTarget });

  const [ytConnectionState, setYtConnectionState] = useState<YtConnectionState>(
    { connected: false, loading: true, error: null },
  );
  const handleYtConnectionChange = useCallback((state: YtConnectionState) => {
    setYtConnectionState(state);
  }, []);

  const {
    twitchConnected,
    selectedTwitchChannel,
    selectedTwitchChannelName,
    selectedTwitchChannelDisplayName,
    twitchSession,
    linkedYoutubeUrl,
    youtubeSession,
    unifyChatEnabled,
    useYoutubeEmbed = true,
    fontSize = 14,
    chatFont = "inter" as ChatFont,
    splitChatEnabled = false,
    hideViewerCount = false,
    compactActions = false,
    modActionsFirst = false,
    chatTheme = "default" as ChatTheme,
    viewerCount,
    onToggleSidebar,
    sidebarVisible = true,
    showStreamEmbed = true,
    onToggleStreamEmbed,
    onFollowRaid,
    streamerToolsEnabled = false,
    isOnOwnChannel = false,
  } = props;

  useEffect(() => {
    if (!linkedYoutubeUrl || !youtubeVideoId) {
      setYtConnectionState({ connected: false, loading: false, error: null });
    }
  }, [linkedYoutubeUrl, youtubeVideoId]);

  const showNotification = (
    message: string,
    type: "success" | "error" | "info",
  ) => {
    setNotification({ message, type });
  };

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
    "giveaway" | null
  >(null);
  const showModTools = streamerToolsEnabled && isOnOwnChannel;

  const openStreamerTools = (initialTool: "giveaway" | null = null) => {
    setStreamerToolsInitialTool(initialTool);
    setStreamerToolsOpen(true);
  };
  const closeStreamerTools = () => {
    setStreamerToolsOpen(false);
    setStreamerToolsInitialTool(null);
  };

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
          const res = await fetch("/api/youtube-chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              videoId: youtubeVideoId,
              message,
            }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            showNotification(
              data.error || "Failed to send winner to YouTube",
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
    [handleSendMessage, youtubeVideoId],
  );

  const giveaway = useGiveaway({
    owner: {
      twitchBroadcasterId: selectedTwitchChannel,
      youtubeChannelId: youtubeSession?.userId,
    },
    enabled: showModTools,
  });

  // Ingest new messages into the giveaway's entry buffer.
  //
  // The chat's `messages` array is capped at MAX_DISPLAYED_MESSAGES (100) and
  // rolls over, so we cannot derive entries from it after the buffer rotates.
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

  const moderationValue = {
    isModerator,
    modModeActive,
    compactActions,
    modActionsFirst,
    isYouTubeModerator,
    youtubeModModeActive,
    youtubeVideoId,
    youtubeOwnChannelId: youtubeSession?.userId ?? null,
    onDeleteMessage: handleDelete,
    onBanUser: handleBan,
    onTimeoutUser: handleTimeout,
    onUntimeoutUser: handleUntimeout,
    onWarnUser: handleWarn,
    onDeleteYouTubeMessage: handleYtDelete,
    onBanYouTubeUser: handleYtBan,
    onTimeoutYouTubeUser: handleYtTimeout,
    onSetModMode: handleSetModMode,
  };

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
        {notification && (
          <Notification
            message={notification.message}
            type={notification.type}
            onClose={() => setNotification(null)}
          />
        )}

        {/* Outgoing raid notification */}
        {pendingRaid && (
          <RaidNotification
            raid={pendingRaid}
            isInitiator={isRaidInitiator}
            broadcasterChannel={selectedTwitchChannelName}
            onRaidNow={() => {
              onFollowRaid?.(pendingRaid.targetLogin);
              setPendingRaid(null);
              setIsRaidInitiator(false);
            }}
            onCancelRaid={handleCancelRaid}
            onFollowRaid={() => {
              onFollowRaid?.(pendingRaid.targetLogin);
              setPendingRaid(null);
            }}
            onDismiss={() => setPendingRaid(null)}
          />
        )}

        {/* Hype Train notification */}
        {hypeTrain && (
          <HypeTrainBanner
            hypeTrain={hypeTrain}
            onDismiss={() => setHypeTrain(null)}
          />
        )}

        {/* Poll notification */}
        {poll && <PollBanner poll={poll} onDismiss={() => setPoll(null)} />}

        {/* Prediction notification */}
        {prediction && (
          <PredictionBanner
            prediction={prediction}
            onDismiss={() => setPrediction(null)}
          />
        )}

        {/* Celebration notification */}
        {celebration && (
          <CelebrationBanner
            celebration={celebration}
            onDismiss={() => setCelebration(null)}
          />
        )}

        {streamerToolsOpen && (
          <StreamerToolsModal
            giveaway={giveaway}
            onAnnounce={handleAnnounceWinner}
            onMinimize={closeStreamerTools}
            onClose={closeStreamerTools}
            initialTool={streamerToolsInitialTool}
            youtubeConnected={!!youtubeSession}
          />
        )}

        {showModTools && !streamerToolsOpen && giveaway.phase !== "config" && (
          <GiveawayIndicator
            giveaway={giveaway}
            onOpen={() => openStreamerTools("giveaway")}
          />
        )}

        {/* UNIFIED CHAT MODE */}
        {unifyChatEnabled ? (
          <>
            {/* Hidden YouTubeChat to keep polling YouTube messages */}
            {linkedYoutubeUrl && youtubeVideoId && showYoutubeSection && (
              <div style={{ display: "none" }} aria-hidden="true">
                <YouTubeChat
                  videoId={youtubeVideoId}
                  channel={selectedTwitchChannelName}
                  onMessages={handleYtMessages}
                  onConnectionChange={handleYtConnectionChange}
                  fontSize={fontSize}
                  chatFont={chatFont}
                  splitChatEnabled={splitChatEnabled}
                />
              </div>
            )}

            {/* Twitch ChatDisplay header + unified messages body */}
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
              }}
            >
              <ChatDisplay
                messages={messages}
                isLoading={isLoading}
                selectedPlatforms={selectedPlatforms}
                onReply={(message) => setReplyingTo(message)}
                channelName={selectedTwitchChannelName}
                channelDisplayName={selectedTwitchChannelDisplayName}
                streamTitle={streamTitle}
                streamGameName={streamGameName}
                isStreamLive={streamIsLive}
                streamUptime={streamUptime}
                viewerCount={viewerCount}
                hideViewerCount={hideViewerCount}
                onRefreshEmotes={handleRefreshEmotes}
                isRefreshingEmotes={isRefreshingEmotes}
                onToggleSidebar={onToggleSidebar}
                sidebarVisible={sidebarVisible}
                onCopyMessage={() => {
                  showNotification("Message copied!", "success");
                }}
                showStreamEmbed={showStreamEmbed}
                onToggleStreamEmbed={onToggleStreamEmbed}
                currentUserDisplayName={twitchSession?.displayName}
                fontSize={fontSize}
                chatFont={chatFont}
                splitChatEnabled={splitChatEnabled}
                onUpdateTitle={handleUpdateTitle}
                onUpdateCategory={handleUpdateCategory}
                onSearchCategories={handleSearchCategories}
                ignoredUsers={ignoredUsers}
                ytMessages={ytMessages}
                showModTools={showModTools}
                onOpenModTools={() => openStreamerTools()}
                /* Override messages area with UnifiedChat */
                unifiedChatSlot={
                  <UnifiedChat
                    ref={unifiedChatRef}
                    twitchMessages={messages}
                    channelName={selectedTwitchChannelName || ""}
                    ytMessages={[
                      ...ytMessages,
                      ...ytOptimisticMessages.filter((opt) => {
                        const norm = (s: string) =>
                          s.normalize("NFKC").trim().toLowerCase();
                        const optText = norm(getYtMessageText(opt));
                        const optAuthor = norm(opt.author);

                        return !ytMessages.some((m) => {
                          const mText = norm(getYtMessageText(m));
                          if (opt.authorChannelId && m.authorChannelId) {
                            return (
                              m.authorChannelId === opt.authorChannelId &&
                              mText === optText
                            );
                          }
                          return (
                            norm(m.author) === optAuthor && mText === optText
                          );
                        });
                      }),
                    ]}
                    ytConnectionState={
                      linkedYoutubeUrl ? ytConnectionState : undefined
                    }
                    ytLoading={ytLoading}
                    ytError={ytError}
                    twitchConnected={twitchConnected}
                    onReply={setReplyingTo}
                    onCopyMessage={() => {
                      showNotification("Message copied!", "success");
                    }}
                    currentUserDisplayName={twitchSession?.displayName}
                    fontSize={fontSize}
                    chatFont={chatFont}
                    splitChatEnabled={splitChatEnabled}
                    ignoredUsers={ignoredUsers}
                  />
                }
              />
            </div>

            {/* Unified input */}
            <UnifiedInput
              onSendMessage={handleSendMessage}
              isLoading={isLoading}
              replyingTo={replyingTo}
              onCancelReply={() => setReplyingTo(undefined)}
              chatMessages={messages}
              currentUsername={twitchSession?.username || ""}
              onInputFocus={() => unifiedChatRef.current?.scrollToBottom()}
              slowModeWaitTime={slowModeWaitTime}
              followerModeMinutes={followerModeMinutes}
              isFollowing={isFollowingChannelState}
              channelName={selectedTwitchChannelName}
              youtubeVideoId={youtubeVideoId}
              ytChatMessages={ytMessages}
              onSendYoutube={async (text) => {
                if (!youtubeVideoId) return;
                const res = await fetch("/api/youtube-chat", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    videoId: youtubeVideoId,
                    message: text,
                  }),
                });
                if (!res.ok) {
                  const data = await res.json();
                  throw new Error(data.error || "Failed to send to YouTube");
                }
              }}
              onOptimisticYoutube={handleYtOptimisticMessage}
              onOptimisticYoutubeFailed={handleYtOptimisticFailed}
              youtubeAvailable={
                !!(
                  linkedYoutubeUrl &&
                  youtubeVideoId &&
                  !useYoutubeEmbed &&
                  youtubeSession
                )
              }
            />
          </>
        ) : (
          <SplitLayout
            chatSlot={
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    minHeight: 0,
                  }}
                >
                  <ChatDisplay
                    ref={chatDisplayRef}
                    messages={messages}
                    isLoading={isLoading}
                    selectedPlatforms={selectedPlatforms}
                    onReply={(message) => setReplyingTo(message)}
                    channelName={selectedTwitchChannelName}
                    channelDisplayName={selectedTwitchChannelDisplayName}
                    streamTitle={streamTitle}
                    streamGameName={streamGameName}
                    isStreamLive={streamIsLive}
                    streamUptime={streamUptime}
                    viewerCount={viewerCount}
                    hideViewerCount={hideViewerCount}
                    onRefreshEmotes={handleRefreshEmotes}
                    isRefreshingEmotes={isRefreshingEmotes}
                    onToggleSidebar={onToggleSidebar}
                    sidebarVisible={sidebarVisible}
                    onCopyMessage={() =>
                      showNotification("Message copied!", "success")
                    }
                    showStreamEmbed={showStreamEmbed}
                    onToggleStreamEmbed={onToggleStreamEmbed}
                    currentUserDisplayName={twitchSession?.displayName}
                    fontSize={fontSize}
                    chatFont={chatFont}
                    splitChatEnabled={splitChatEnabled}
                    onUpdateTitle={handleUpdateTitle}
                    onUpdateCategory={handleUpdateCategory}
                    onSearchCategories={handleSearchCategories}
                    ignoredUsers={ignoredUsers}
                    ytMessages={ytMessages}
                    showModTools={showModTools}
                    onOpenModTools={() => openStreamerTools()}
                  />
                </div>
                <MessageInput
                  onSendMessage={handleSendMessage}
                  isLoading={isLoading}
                  isConnected={{ twitch: twitchConnected }}
                  replyingTo={replyingTo}
                  onCancelReply={() => setReplyingTo(undefined)}
                  chatMessages={messages}
                  currentUsername={twitchSession?.username || ""}
                  onInputFocus={() => chatDisplayRef.current?.scrollToBottom()}
                  slowModeWaitTime={slowModeWaitTime}
                  followerModeMinutes={followerModeMinutes}
                  isFollowing={isFollowingChannelState}
                  channelName={selectedTwitchChannelName}
                />
              </div>
            }
            linkedYoutubeUrl={linkedYoutubeUrl}
            showYoutubeSection={showYoutubeSection}
            chatSplitRatio={chatSplitRatio}
            isDraggingChatSplit={isDraggingChatSplit}
            onSetIsDraggingChatSplit={setIsDraggingChatSplit}
            youtubeVideoId={youtubeVideoId}
            useYoutubeEmbed={useYoutubeEmbed}
            ytMessages={ytMessages}
            ytOptimisticMessages={ytOptimisticMessages}
            ytLoading={ytLoading}
            ytError={ytError}
            onSetManualVideoId={setManualVideoId}
            onSetShowYoutubeSection={setShowYoutubeSection}
            fontSize={fontSize}
            chatFont={chatFont}
            splitChatEnabled={splitChatEnabled}
            onYtMessages={handleYtMessages}
            youtubeSession={youtubeSession}
            onOptimisticMessage={handleYtOptimisticMessage}
            onOptimisticFailed={handleYtOptimisticFailed}
            onShowError={(msg) => showNotification(msg, "error")}
            onYtConnectionChange={handleYtConnectionChange}
            channelName={selectedTwitchChannelName}
          />
        )}

        <MobileTouchHintModal twitchConnected={twitchConnected} />
        {chatTheme === "mushu" && (
          <>
            <img
              src="/themes/Mushu/mushu.webp"
              alt="Mushu"
              className="mushu-theme-mascot"
            />
            <img
              src="/themes/Mushu/mushuKnife.webp"
              alt="Mushu Knife"
              className="mushu-theme-knife"
            />
          </>
        )}
        {chatTheme === "lunita" && (
          <>
            <img
              src="/themes/Lunita/lunateDrama.webp"
              alt="Lunita Drama"
              className="lunita-theme-drama"
            />
            <img
              src="/themes/Lunita/lunateLurk.webp"
              alt="Lunita Lurk"
              className="lunita-theme-lurk"
            />
          </>
        )}
      </div>
    </ModerationContext.Provider>
  );
}
