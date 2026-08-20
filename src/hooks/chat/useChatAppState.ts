import { useState, useCallback, useEffect, useRef } from "react";
import { useTwitchChat } from "./useTwitchChat";
import type { MentionSoundType } from "./useTwitchChat";
import { useEventSub } from "./useEventSub";
import type { RaidOutEvent } from "./eventSubHelpers/useRaidDetection";
import {
  initializeEmotes,
  clearEmoteCacheStorage,
  subscribeTo7TVUpdates,
} from "../../lib/emotes";
import { initializeBadges, clearBadgeCache } from "../../lib/badges";
import { sendHelixMessage } from "../../lib/twitch";
import type {
  TwitchMessage,
  Platform,
  PlatformSession,
  ChatFont,
  ChatTheme,
} from "../../lib/types";
import { MAX_DISPLAYED_MESSAGES } from "../../lib/types";
import type { ChatDisplayHandle } from "../../components/chat/display";
import type { UnifiedChatHandle } from "../../components/chat/unified";
import type { HypeTrainState } from "../../components/chat/shared/HypeTrainBanner";
import type { PollState } from "../../components/chat/shared/PollBanner";
import type { PredictionState } from "../../components/chat/shared/PredictionBanner";
import type { CelebrationState } from "../../components/chat/shared/CelebrationBanner";
import type { ModModeTarget } from "../../contexts/ModerationContext";

import {
  useChatLayout,
  useStreamInfo,
  useYouTubeSync,
  useModeration,
  useChatMessages,
  useAutomodState,
  useLiveEvents,
  useYouTubeModeration,
} from "./chatAppStateHelpers";
import { setAutomodIds } from "./automodIds";

export interface ChatAppStateProps {
  twitchConnected: boolean;
  selectedTwitchChannel?: string;
  selectedTwitchChannelName?: string;
  selectedTwitchChannelDisplayName?: string;
  twitchSession?: PlatformSession;
  linkedYoutubeUrl?: string;
  youtubeSession?: PlatformSession;
  unifyChatEnabled?: boolean;
  compactActions?: boolean;
  keepModActionsVisible?: boolean;
  modActionsFirst?: boolean;
  doubleClickConfirmModActions?: boolean;
  useYoutubeEmbed?: boolean;
  fontSize?: number;
  chatFont?: ChatFont;
  mentionSoundEnabled?: boolean;
  mentionVolume?: number;
  mentionSoundType?: MentionSoundType;
  showDeletedMessages?: boolean;
  splitChatEnabled?: boolean;
  chatTheme?: ChatTheme;
  hideViewerCount?: boolean;
  modModeTarget?: ModModeTarget;
  modModeTargets?: Record<string, ModModeTarget>;
  setModModeTargetForChannel?: (
    channelId: string,
    target: ModModeTarget,
  ) => void;
  eventSounds?: Record<string, string>;
  eventSoundVolume?: number;
  ignoredUsers?: string[];
  onFollowRaid?: (channelLogin: string) => void;
  viewerCount?: number | null;
  onToggleSidebar?: () => void;
  sidebarVisible?: boolean;
  showStreamEmbed?: boolean;
  onToggleStreamEmbed?: () => void;
  streamerToolsEnabled?: boolean;
  isOnOwnChannel?: boolean;
  renderThirdPartyEmotesOnYoutube?: boolean;
}

export function useChatAppState({
  selectedTwitchChannel = "",
  selectedTwitchChannelName = "",
  selectedTwitchChannelDisplayName = "",
  twitchSession,
  linkedYoutubeUrl,
  youtubeSession,
  unifyChatEnabled = false,
  mentionSoundEnabled = true,
  mentionVolume = 0.2,
  mentionSoundType = "ding" as MentionSoundType,
  showDeletedMessages = true,
  modModeTarget = "off",
  eventSounds = {},
  eventSoundVolume = 1,
  ignoredUsers = [],
  isOnOwnChannel = false,
}: ChatAppStateProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [pendingRaid, setPendingRaid] = useState<RaidOutEvent | null>(null);
  const [isRaidInitiator, setIsRaidInitiator] = useState(false);
  const [isRefreshingEmotes, setIsRefreshingEmotes] = useState(false);
  const [selectedPlatforms, _setSelectedPlatforms] = useState<Platform[]>([]);
  const [replyingTo, setReplyingTo] = useState<TwitchMessage | undefined>();
  const [notification, setNotification] = useState<{
    message: string;
    type: "success" | "error" | "info";
    id?: number;
  } | null>(null);
  const notificationIdRef = useRef(0);
  const chatDisplayRef = useRef<ChatDisplayHandle>(null);
  const unifiedChatRef = useRef<UnifiedChatHandle>(null);
  const currentUserBadgesRef = useRef<{
    badges: Record<string, string>;
    badgeDetails: Record<string, { url: string; title: string }>;
  }>({ badges: {}, badgeDetails: {} });
  const [hypeTrain, setHypeTrain] = useState<HypeTrainState | null>(null);
  const [poll, setPoll] = useState<PollState | null>(null);
  const [prediction, setPrediction] = useState<PredictionState | null>(null);
  const [celebration, setCelebration] = useState<CelebrationState | null>(null);
  const [badgesReady, setBadgesReady] = useState(false);

  const showDeletedMessagesRefForMessages = useRef(showDeletedMessages);
  useEffect(() => {
    showDeletedMessagesRefForMessages.current = showDeletedMessages;
  }, [showDeletedMessages]);

  const { chatSplitRatio, isDraggingChatSplit, setIsDraggingChatSplit } =
    useChatLayout({
      selectedTwitchChannelDisplayName,
    });

  const {
    streamIsLive,
    streamUptime,
    streamTitle,
    streamGameName,
    streamGameId,
    isFollowingChannelState,
    setStreamTitle,
    setStreamGameName,
    setIsFollowingChannelState,
    handleUpdateTitle,
    handleUpdateCategory,
    handleSearchCategories,
  } = useStreamInfo({
    selectedTwitchChannel,
    selectedTwitchChannelName,
    twitchAccessToken: twitchSession?.accessToken,
    twitchUserId: twitchSession?.userId,
  });

  const {
    youtubeVideoId,
    manualVideoId,
    autoVideoId,
    ytLoading,
    ytError,
    showYoutubeSection,
    ytMessages,
    ytOptimisticMessages,
    ytChannelId,
    setManualVideoId,
    setAutoVideoId,
    setShowYoutubeSection,
    handleYtMessages,
    handleYtOptimisticMessage,
    handleYtOptimisticFailed,
    removeYtMessage,
    markYtMessageDeleted,
    getYtMessageText,
  } = useYouTubeSync({
    linkedYoutubeUrl,
    showYoutubeSection: true,
    selectedTwitchChannelName,
    youtubeSession,
    unifyChatEnabled,
    unifiedChatRef,
  });

  const {
    messages,
    showPreloadedMessages,
    setMessages,
    preloadedMessagesRef,
    recentRedemptionsRef,
    handleTwitchMessage,
    handleMessageDeleted,
  } = useChatMessages({
    selectedTwitchChannelName,
    twitchSession,
    showDeletedMessages,
    showDeletedMessagesRef: showDeletedMessagesRefForMessages,
    currentUserBadgesRef,
    badgesReady,
  });

  const {
    isModerator,
    modModeActive,
    handleDelete,
    handleBan,
    handleTimeout,
    handleUntimeout,
    handleWarn,
    handlePinMessage,
    handleCancelRaid,
    handleOwnBadgesLoaded,
    handleModCommand,
  } = useModeration({
    twitchSession,
    selectedTwitchChannel,
    selectedTwitchChannelName,
    modModeTarget,
    setMessages,
    setNotification,
    notificationIdRef,
    setPendingRaid,
    setIsRaidInitiator,
  });

  const {
    isYouTubeModerator,
    youtubeModModeActive,
    handleYtDelete,
    handleYtBan,
    handleYtTimeout,
  } = useYouTubeModeration({
    youtubeSession,
    youtubeVideoId,
    ytChannelId,
    modModeTarget,
    setNotification,
    notificationIdRef,
    onLocalDelete: removeYtMessage,
    onLocalDeleteWithLabel: markYtMessageDeleted,
    messages: ytMessages,
    getMessageText: getYtMessageText,
  });

  useAutomodState({
    moderatorId: twitchSession?.userId || "",
    onError: (msg) => {
      notificationIdRef.current += 1;
      setNotification({
        message: msg,
        type: "error",
        id: notificationIdRef.current,
      });
    },
  });

  // Listen for automod message approvals/denials from inline buttons
  useEffect(() => {
    const handler = (e: Event) => {
      const heldMsgId = (e as CustomEvent).detail?.heldMsgId;
      if (heldMsgId) {
        setMessages((prev) =>
          prev.filter((m) => m.id !== `automod-${heldMsgId}`),
        );
      }
    };
    window.addEventListener("automod-message-resolved", handler);
    return () =>
      window.removeEventListener("automod-message-resolved", handler);
  }, [setMessages]);

  // Keep automod IDs in sync for AutomodActions
  useEffect(() => {
    setAutomodIds(twitchSession?.userId || "", selectedTwitchChannel);
  }, [twitchSession?.userId, selectedTwitchChannel]);

  const { subscribe, subscriptionStatuses } = useEventSub({
    accessToken: twitchSession?.accessToken || "",
    clientId: import.meta.env.PUBLIC_TWITCH_CLIENT_ID,
    enabled: !!(twitchSession?.accessToken && selectedTwitchChannel),
  });

  const { redemptionPubSubStatus } = useLiveEvents({
    subscribe,
    channelId: selectedTwitchChannel,
    twitchSession,
    badgesReady,
    isModerator,
    isOnOwnChannel,
    selectedTwitchChannelName,
    setHypeTrain,
    setPoll,
    setPrediction,
    setCelebration,
    setPendingRaid,
    setIsRaidInitiator,
    setMessages,
    setNotification,
    notificationIdRef,
    recentRedemptionsRef,
    currentUserBadgesRef,
  });

  // Reset all chat state when switching channels — intentional
  // eslint-disable-next-line no-adjust-state-on-prop-change
  useEffect(() => {
    clearBadgeCache();
    setBadgesReady(false);
    setStreamTitle("");
    setStreamGameName("");
    setIsFollowingChannelState(null);
    setMessages([]);
    setPoll(null);
    setPrediction(null);
    setCelebration(null);
    preloadedMessagesRef.current.clear();
  },    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      selectedTwitchChannelName,
      selectedTwitchChannel,
      setStreamTitle,
      setStreamGameName,
      setIsFollowingChannelState,
    setMessages,
  ]);

  useEffect(() => {
    if (!selectedTwitchChannelName || !selectedTwitchChannel) return;

    let cancelled = false;
    let subscribe7tv: (() => void) | undefined;

    const initializeAssets = async () => {
      if (!twitchSession?.accessToken) {
        return;
      }
      try {
        await Promise.all([
          initializeEmotes(
            selectedTwitchChannel,
            selectedTwitchChannelName,
            twitchSession?.userId,
          ),
          initializeBadges(
            selectedTwitchChannel,
            twitchSession?.accessToken || "",
            import.meta.env.PUBLIC_TWITCH_CLIENT_ID,
          ),
        ]);
        if (cancelled) return;
        setBadgesReady(true);

        subscribe7tv = subscribeTo7TVUpdates(
          selectedTwitchChannel,
          selectedTwitchChannelName,
        );
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to initialize chat assets:", err);
      }
    };

    initializeAssets();

    return () => {
      cancelled = true;
      if (subscribe7tv) subscribe7tv();
    };
  }, [
    selectedTwitchChannelName,
    selectedTwitchChannel,
    twitchSession?.userId,
    twitchSession?.accessToken,
  ]);

  // Auto-refresh emotes every 3 hours in the background.
  // Uses a localStorage timestamp so the interval persists across navigations.
  useEffect(() => {
    if (!selectedTwitchChannelName || !selectedTwitchChannel) return;
    if (!twitchSession?.userId) return;

    const STORAGE_KEY = "emotes_last_auto_refresh";
    const THREE_HOURS = 3 * 60 * 60 * 1000;

    const doRefresh = async () => {
      console.log("[emotes] Auto-refresh (3h interval)");
      try {
        await clearEmoteCacheStorage();
        await initializeEmotes(
          selectedTwitchChannel,
          selectedTwitchChannelName,
          twitchSession.userId,
        );
      } catch (err) {
        console.error("[emotes] Auto-refresh failed:", err);
      }
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    };

    // Calculate time until next refresh
    const lastRefresh = Number(localStorage.getItem(STORAGE_KEY) || 0);
    const elapsed = Date.now() - lastRefresh;
    const delay = elapsed >= THREE_HOURS ? 0 : THREE_HOURS - elapsed;

    const timer = setTimeout(async () => {
      await doRefresh();
      // After the first refresh, set a regular interval
      const id = setInterval(doRefresh, THREE_HOURS);
      // Store interval id on a ref so cleanup can clear it
      intervalRef.current = id;
    }, delay);

    const intervalRef = {
      current: null as ReturnType<typeof setInterval> | null,
    };

    return () => {
      clearTimeout(timer);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [selectedTwitchChannelName, selectedTwitchChannel, twitchSession?.userId]);

  const {
    sendMessage: sendTwitchMessage,
    slowModeWaitTime,
    followerModeMinutes,
  } = useTwitchChat(
    selectedTwitchChannelName,
    twitchSession?.accessToken || "",
    twitchSession?.username || twitchSession?.displayName || "",
    handleTwitchMessage,
    badgesReady,
    mentionSoundEnabled,
    mentionVolume,
    mentionSoundType,
    eventSounds,
    eventSoundVolume,
    handleOwnBadgesLoaded,
    handleMessageDeleted,
    twitchSession?.userId || "",
    selectedTwitchChannel,
  );

  const handleSendMessage = useCallback(
    async (message: string, platforms: Platform[], _replyToId?: string) => {
      if (!message.trim() || platforms.length === 0) return;

      setIsLoading(true);
      try {
        if (
          platforms.includes("twitch") &&
          selectedTwitchChannel &&
          twitchSession
        ) {
          try {
            if (message.startsWith("/")) {
              const result = await handleModCommand(message);
              if (result.handled) {
                if (result.error) {
                  notificationIdRef.current += 1;
                  setNotification({
                    message: result.error,
                    type: "error",
                    id: notificationIdRef.current,
                  });
                }
                return;
              }
              await sendTwitchMessage(message, replyingTo?.id);
            } else {
              const serverMessageId = await sendHelixMessage(
                selectedTwitchChannel,
                twitchSession.userId,
                message,
                replyingTo?.id,
              );

              if (serverMessageId) {
                const optimisticId = `optimistic_${serverMessageId}`;
                const optimisticMessage: TwitchMessage = {
                  id: optimisticId,
                  platform: "twitch",
                  author:
                    twitchSession.displayName ||
                    twitchSession.username ||
                    "You",
                  content: message,
                  timestamp: new Date(),
                  userId: twitchSession.userId,
                  authorColor: "#FFFFFF",
                  authorAvatar: twitchSession.profileImageUrl,
                  replyTo: replyingTo
                    ? {
                        id: replyingTo.id,
                        author: replyingTo.author,
                        content: replyingTo.content,
                      }
                    : undefined,
                  mentionsUser: false,
                  emotes: {},
                  isBot: false,
                  badges: currentUserBadgesRef.current.badges,
                  badgeDetails: currentUserBadgesRef.current.badgeDetails,
                  isCurrentUser: true,
                  optimistic: true,
                };

                setMessages((prev) => {
                  const hasRealById = prev.some(
                    (m) => m.id === serverMessageId && !m.optimistic,
                  );
                  if (hasRealById) return prev;

                  const hasRealByContent = prev.some(
                    (m) =>
                      !m.optimistic &&
                      m.isCurrentUser &&
                      m.userId === twitchSession?.userId &&
                      m.content === message &&
                      (m.replyTo?.id || "") === (replyingTo?.id || ""),
                  );
                  if (hasRealByContent) return prev;

                  const optimisticIdExists = prev.some(
                    (m) => m.id === optimisticId,
                  );
                  if (optimisticIdExists) return prev;

                  const updated = [...prev, optimisticMessage];
                  return updated.length > MAX_DISPLAYED_MESSAGES
                    ? updated.slice(-MAX_DISPLAYED_MESSAGES)
                    : updated;
                });
              } else {
                await sendTwitchMessage(message, replyingTo?.id);
              }
            }
          } catch (error) {
            console.error("Failed to send Twitch message:", error);
            notificationIdRef.current += 1;
            setNotification({
              message: "Failed to send message",
              type: "error",
              id: notificationIdRef.current,
            });
          }

          setReplyingTo(undefined);
        }
      } catch (error) {
        console.error("Failed to send message:", error);
      } finally {
        setIsLoading(false);
        if (unifyChatEnabled) {
          unifiedChatRef.current?.scrollToBottom();
        } else {
          chatDisplayRef.current?.scrollToBottom();
        }
      }    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      selectedTwitchChannel,
      sendTwitchMessage,
      twitchSession,
      replyingTo,
      unifyChatEnabled,
      selectedTwitchChannelName,
    ],
  );

  const handleRefreshEmotes = useCallback(async () => {
    console.log("User initiated emote reload (background)");
    setIsRefreshingEmotes(true);
    try {
      await clearEmoteCacheStorage();
      await initializeEmotes(
        selectedTwitchChannel,
        selectedTwitchChannelName,
        twitchSession?.userId,
      );
    } catch (err) {
      console.error("Failed to reinitialize emotes:", err);
    } finally {
      setIsRefreshingEmotes(false);
    }
  }, [selectedTwitchChannel, selectedTwitchChannelName, twitchSession?.userId]);

  // DEV ONLY: expose helper to inject test messages and trigger banners
  useEffect(() => {
    if (import.meta.env.MODE === "production") return;
    const w = window as any;
    w.__mixchatDev = {
      injectMessage(msg: Partial<TwitchMessage>) {
        const full: TwitchMessage = {
          id: msg.id ?? `dev-${Date.now()}`,
          platform: msg.platform ?? "twitch",
          author: msg.author ?? "DevTestUser",
          content: msg.content ?? "This is a dev test message",
          timestamp: msg.timestamp ?? new Date(),
          authorColor: msg.authorColor ?? "#9146FF",
          ...(msg as Partial<TwitchMessage>),
        };
        setMessages((prev) => [...prev, full]);
      },
      triggerCelebration() {
        setCelebration({
          id: `dev-cele-${Date.now()}`,
          userName: "DevTester",
          userDisplayName: "DevTester",
          bitsUsed: 100,
          totalBitsUsed: 500,
          messageEffectId: null,
          endsAt: new Date(Date.now() + 10000),
        });
      },
      triggerHypeTrain() {
        setHypeTrain({
          level: 1,
          progress: 1500,
          goal: 5000,
          totalPoints: 1500,
          topContributors: [
            { displayName: "DevTester", points: 800 },
            { displayName: "DevFan", points: 400 },
          ],
          endsAt: new Date(Date.now() + 300000),
        });
      },
      triggerPoll() {
        setPoll({
          id: `dev-poll-${Date.now()}`,
          title: "Dev Poll: Which power-up style?",
          choices: [
            { id: "1", title: "Message Effect", votes: 42 },
            { id: "2", title: "Celebration", votes: 88 },
            { id: "3", title: "Gigantify", votes: 31 },
          ],
          totalVotes: 161,
          endsAt: new Date(Date.now() + 60000),
        });
      },
      triggerPrediction() {
        setPrediction({
          id: `dev-pred-${Date.now()}`,
          title: "Dev Prediction: Who will win?",
          outcomes: [
            {
              id: "o1",
              title: "Team Blue",
              color: "#0099FF",
              users: 142,
              channelPoints: 5000,
            },
            {
              id: "o2",
              title: "Team Pink",
              color: "#FF69B4",
              users: 98,
              channelPoints: 2800,
            },
          ],
          totalPoints: 7800,
          totalUsers: 240,
          status: "active",
          endsAt: new Date(Date.now() + 120000),
        });
      },
      triggerGigantifiedEmote() {
        setMessages((prev) => [
          ...prev,
          {
            id: `dev-gig-${Date.now()}`,
            platform: "twitch" as const,
            author: "DevTester",
            content: "Kappa PogChamp",
            timestamp: new Date(),
            authorColor: "#9146FF",
            isGigantifiedEmote: true,
            emotes: { "25": ["0-4"], "301492158": ["6-14"] },
          },
        ]);
      },
      triggerMessageEffect() {
        setMessages((prev) => [
          ...prev,
          {
            id: `dev-me-${Date.now()}`,
            platform: "twitch" as const,
            author: "DevTester",
            content: "This message has a glow effect!",
            timestamp: new Date(),
            authorColor: "#00d4aa",
            powerUpType: "message_effect" as const,
            messageEffectId: "slide-in",
          },
        ]);
      },
      triggerCelebrationMessage() {
        setMessages((prev) => [
          ...prev,
          {
            id: `dev-cele-${Date.now()}`,
            platform: "twitch" as const,
            author: "DevTester",
            content: "Party time! 🎉",
            timestamp: new Date(),
            authorColor: "#ff6b9d",
            powerUpType: "celebration" as const,
          },
        ]);
      },
    };
    return () => {
      delete w.__mixchatDev;
    };
  }, [setMessages, setCelebration, setHypeTrain, setPoll, setPrediction]);

  return {
    messages,
    isLoading,
    pendingRaid,
    isRaidInitiator,
    isRefreshingEmotes,
    selectedPlatforms,
    replyingTo,
    streamIsLive,
    streamUptime,
    streamTitle,
    streamGameName,
    streamGameId,
    showPreloadedMessages,
    notification,
    chatDisplayRef,
    unifiedChatRef,
    manualVideoId,
    autoVideoId,
    ytLoading,
    ytError,
    showYoutubeSection,
    chatSplitRatio,
    isDraggingChatSplit,
    ytMessages,
    ytOptimisticMessages,
    youtubeVideoId,
    ytChannelId,
    badgesReady,
    isModerator,
    subscriptionStatuses,
    redemptionPubSubStatus,
    modModeActive,
    isYouTubeModerator,
    youtubeModModeActive,
    youtubeOwnChannelId: youtubeSession?.userId ?? null,
    isFollowingChannelState,
    hypeTrain,
    poll,
    prediction,
    celebration,
    notificationIdRef,

    setReplyingTo,
    setShowYoutubeSection,
    setIsDraggingChatSplit,
    setManualVideoId,
    setAutoVideoId,
    setNotification,
    setPendingRaid,
    setIsRaidInitiator,
    setHypeTrain,
    setPoll,
    setPrediction,
    setCelebration,

    handleSendMessage,
    handleRefreshEmotes,
    handleDelete,
    handleBan,
    handleTimeout,
    handleUntimeout,
    handleWarn,
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
    sendTwitchMessage,
    slowModeWaitTime,
    followerModeMinutes,
    ignoredUsers,
  };
}
