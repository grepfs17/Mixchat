import { useState, useCallback, useEffect, useRef } from "react";
import { useTwitchChat } from "./useTwitchChat";
import type { MentionSoundType } from "./useTwitchChat";
import { useRaidDetection } from "./useRaidDetection";
import type { RaidOutEvent } from "./useRaidDetection";
import { useChannelPointRedemptions } from "./useChannelPointRedemptions";
import { useHypeTrainEventSub } from "./useHypeTrainEventSub";
import { useAutomodQueue } from "./useAutomodQueue";
import {
  initializeEmotes,
  clearEmoteCache,
  subscribeTo7TVUpdates,
} from "../../lib/emotes";
import { initializeBadges, clearBadgeCache } from "../../lib/badges";
import { sendHelixMessage } from "../../lib/twitch";
import { saveMessage } from "../../lib/chatHistoryStorage";
import type {
  ChatMessage,
  Platform,
  PlatformSession,
  ChatFont,
  ChatTheme,
} from "../../lib/types";
import { MAX_DISPLAYED_MESSAGES } from "../../lib/types";
import type { YTMessage } from "../../components/chat/unified/types";
import type { ChatDisplayHandle } from "../../components/chat/display";
import type { UnifiedChatHandle } from "../../components/chat/unified";
import type { HypeTrainState } from "../../components/chat/shared/HypeTrainBanner";

import {
  useChatLayout,
  useStreamInfo,
  useYouTubeSync,
  useModeration,
  useChatMessages,
  useAutomodState,
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
  disableModModeByDefault?: boolean;
  eventSounds?: Record<string, string>;
  eventSoundVolume?: number;
  ignoredUsers?: string[];
  onFollowRaid?: (channelLogin: string) => void;
  viewerCount?: number | null;
  onToggleSidebar?: () => void;
  sidebarVisible?: boolean;
  showStreamEmbed?: boolean;
  onToggleStreamEmbed?: () => void;
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
  disableModModeByDefault = false,
  eventSounds = {},
  eventSoundVolume = 1,
  ignoredUsers = [],
}: ChatAppStateProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [pendingRaid, setPendingRaid] = useState<RaidOutEvent | null>(null);
  const [isRaidInitiator, setIsRaidInitiator] = useState(false);
  const [isRefreshingEmotes, setIsRefreshingEmotes] = useState(false);
  const [selectedPlatforms, _setSelectedPlatforms] = useState<Platform[]>([]);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | undefined>();
  const [notification, setNotification] = useState<{
    message: string;
    type: "success" | "error" | "info";
    id?: number;
  } | null>(null);
  const notificationIdRef = useRef(0);
  const chatDisplayRef = useRef<ChatDisplayHandle>(null);
  const unifiedChatRef = useRef<UnifiedChatHandle>(null);
  const showDeletedMessagesRef = useRef(showDeletedMessages);
  const currentUserBadgesRef = useRef<{
    badges: Record<string, string>;
    badgeDetails: Record<string, { url: string; title: string }>;
  }>({ badges: {}, badgeDetails: {} });
  const [hypeTrain, setHypeTrain] = useState<HypeTrainState | null>(null);
  const [badgesReady, setBadgesReady] = useState(false);

  useEffect(() => {
    showDeletedMessagesRef.current = showDeletedMessages;
  }, [showDeletedMessages]);

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
    setManualVideoId,
    setAutoVideoId,
    setShowYoutubeSection,
    handleYtMessages,
    handleYtOptimisticMessage,
    handleYtOptimisticFailed,
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
  });

  const {
    isModerator,
    modModeActive,
    handleToggleModMode,
    handleDelete,
    handleBan,
    handleTimeout,
    handleUntimeout,
    handleWarn,
    handleCancelRaid,
    handleOwnBadgesLoaded,
    handleModCommand,
  } = useModeration({
    twitchSession,
    selectedTwitchChannel,
    selectedTwitchChannelName,
    disableModModeByDefault,
    setMessages,
    setNotification,
    notificationIdRef,
  });

  useAutomodState({
    moderatorId: twitchSession?.userId || "",
    onError: (msg) => {
      notificationIdRef.current += 1;
      setNotification({ message: msg, type: "error", id: notificationIdRef.current });
    },
  });

  // Listen for automod message approvals/denials from inline buttons
  useEffect(() => {
    const handler = (e: Event) => {
      const heldMsgId = (e as CustomEvent).detail?.heldMsgId;
      if (heldMsgId) {
        setMessages((prev) => prev.filter((m) => m.id !== `automod-${heldMsgId}`));
      }
    };
    window.addEventListener("automod-message-resolved", handler);
    return () => window.removeEventListener("automod-message-resolved", handler);
  }, [setMessages]);

  // Keep automod IDs in sync for AutomodActions
  useEffect(() => {
    setAutomodIds(twitchSession?.userId || "", selectedTwitchChannel);
  }, [twitchSession?.userId, selectedTwitchChannel]);

  // Inject held messages into the chat messages array
  const handleHeldMessageInline = useCallback(
    (heldMsg: import("./useAutomodQueue").HeldMessage) => {
      const chatMsg: ChatMessage = {
        id: `automod-${heldMsg.id}`,
        platform: "twitch",
        author: heldMsg.userDisplayName || heldMsg.userName,
        content: heldMsg.content,
        timestamp: new Date(heldMsg.holdDate),
        userId: heldMsg.userId,
        messageType: "automod",
        targetUsername: heldMsg.id,
      };
      setMessages((prev) => {
        const updated = [...prev, chatMsg];
        return updated.length > MAX_DISPLAYED_MESSAGES
          ? updated.slice(-MAX_DISPLAYED_MESSAGES)
          : updated;
      });
    },
    [setMessages],
  );

  useAutomodQueue({
    channelId: selectedTwitchChannel,
    moderatorId: twitchSession?.userId || "",
    accessToken: twitchSession?.accessToken || "",
    clientId: import.meta.env.PUBLIC_TWITCH_CLIENT_ID,
    enabled: !!(
      twitchSession?.accessToken &&
      twitchSession?.userId &&
      selectedTwitchChannel &&
      badgesReady &&
      isModerator
    ),
    onHeldMessage: handleHeldMessageInline,
    onResolvedMessage: useCallback(
      (resolved: import("./useAutomodQueue").ResolvedMessage) => {
        setMessages((prev) =>
          prev.filter((m) => m.id !== `automod-${resolved.messageId}`),
        );
      },
      [setMessages],
    ),
    onScopeError: () => {
      console.info(
        "[useChatAppState] Automod EventSub subscription rejected — this is expected when not a moderator or missing moderator:manage:automod scope.",
      );
    },
  });

  useEffect(() => {
    clearBadgeCache();
    setBadgesReady(false);
    setStreamTitle("");
    setStreamGameName("");
    setIsFollowingChannelState(null);
    setMessages([]);
    preloadedMessagesRef.current.clear();
  }, [
    selectedTwitchChannelName,
    selectedTwitchChannel,
    setStreamTitle,
    setStreamGameName,
    setIsFollowingChannelState,
    setMessages,
  ]);

  useEffect(() => {
    if (!selectedTwitchChannelName || !selectedTwitchChannel) return;

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
        setBadgesReady(true);

        subscribe7tv = subscribeTo7TVUpdates(
          selectedTwitchChannel,
          selectedTwitchChannelName,
        );
      } catch (err) {
        console.error("Failed to initialize chat assets:", err);
      }
    };

    initializeAssets();

    return () => {
      if (subscribe7tv) subscribe7tv();
    };
  }, [
    selectedTwitchChannelName,
    selectedTwitchChannel,
    twitchSession?.userId,
    twitchSession?.accessToken,
  ]);

  useRaidDetection({
    channelId: selectedTwitchChannel,
    accessToken: twitchSession?.accessToken || "",
    clientId: import.meta.env.PUBLIC_TWITCH_CLIENT_ID,
    enabled: !!(
      twitchSession?.accessToken &&
      selectedTwitchChannel &&
      badgesReady
    ),
    onRaidOut: (raid) => {
      setPendingRaid(raid);
      setIsRaidInitiator(false);
    },
    onScopeError: () => {
      notificationIdRef.current += 1;
      setNotification({
        message:
          "Raid detection unavailable — please re-login to refresh your Twitch session",
        type: "info",
        id: notificationIdRef.current,
      });
    },
  });

  const handleRedemptionEvent = useCallback(
    (message: ChatMessage) => {
      if (message.rewardId && message.userId) {
        recentRedemptionsRef.current.set(
          `${message.rewardId}-${message.userId}`,
          Date.now(),
        );
        const now = Date.now();
        for (const [key, ts] of recentRedemptionsRef.current) {
          if (now - ts > 10000) recentRedemptionsRef.current.delete(key);
        }
      }

      setMessages((prev) => {
        saveMessage(message, selectedTwitchChannelName);

        const updated = [...prev, message];
        return updated.length > MAX_DISPLAYED_MESSAGES
          ? updated.slice(-MAX_DISPLAYED_MESSAGES)
          : updated;
      });
    },
    [selectedTwitchChannelName, setMessages, recentRedemptionsRef],
  );

  useChannelPointRedemptions({
    channelId: selectedTwitchChannel,
    accessToken: twitchSession?.accessToken || "",
    clientId: import.meta.env.PUBLIC_TWITCH_CLIENT_ID,
    enabled: !!(
      twitchSession?.accessToken &&
      selectedTwitchChannel &&
      badgesReady
    ),
    onRedemption: handleRedemptionEvent,
    onScopeError: () => {
      console.info(
        "[useChatAppState] EventSub redemption subscription rejected — this is expected when viewing another broadcaster's channel.",
      );
    },
  });

  useHypeTrainEventSub({
    channelId: selectedTwitchChannel,
    accessToken: twitchSession?.accessToken || "",
    clientId: import.meta.env.PUBLIC_TWITCH_CLIENT_ID,
    enabled: !!(
      twitchSession?.accessToken &&
      selectedTwitchChannel &&
      badgesReady
    ),
    onHypeTrainBegin: (event) => {
      setHypeTrain({
        level: event.level,
        progress: event.progress,
        goal: event.goal,
        totalPoints: event.total,
        topContributors: event.topContributions.slice(0, 3).map((c) => ({
          displayName: c.displayName,
          points: c.total,
        })),
        endsAt: new Date(event.expiresAt),
      });
    },
    onHypeTrainProgress: (event) => {
      setHypeTrain({
        level: event.level,
        progress: event.progress,
        goal: event.goal,
        totalPoints: event.total,
        topContributors: event.topContributions.slice(0, 3).map((c) => ({
          displayName: c.displayName,
          points: c.total,
        })),
        endsAt: new Date(event.expiresAt),
      });
    },
    onHypeTrainEnd: () => {
      setHypeTrain(null);
    },
    onScopeError: () => {
      console.info(
        "[useChatAppState] EventSub hype train subscription rejected — this is expected when viewing another broadcaster's channel.",
      );
    },
  });

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
                const optimisticMessage: ChatMessage = {
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
      }
    },
    [
      selectedTwitchChannel,
      sendTwitchMessage,
      twitchSession,
      replyingTo,
      unifyChatEnabled,
      selectedTwitchChannelName,
    ],
  );

  const handleRefreshEmotes = useCallback(async () => {
    console.log("User initiated emote reload");
    setIsRefreshingEmotes(true);
    try {
      clearEmoteCache();
      await initializeEmotes(
        selectedTwitchChannel,
        selectedTwitchChannelName,
        twitchSession?.userId,
      );
      notificationIdRef.current += 1;
      setNotification({
        message: "Emotes reloaded successfully!",
        type: "success",
        id: notificationIdRef.current,
      });
    } catch (err) {
      console.error("Failed to reinitialize emotes:", err);
      notificationIdRef.current += 1;
      setNotification({
        message: "Failed to reload emotes",
        type: "error",
        id: notificationIdRef.current,
      });
    } finally {
      setIsRefreshingEmotes(false);
    }
  }, [selectedTwitchChannel, selectedTwitchChannelName, twitchSession?.userId]);

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
    badgesReady,
    isModerator,
    modModeActive,
    isFollowingChannelState,
    hypeTrain,
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

    handleSendMessage,
    handleRefreshEmotes,
    handleToggleModMode,
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
    getYtMessageText,
    sendTwitchMessage,
    slowModeWaitTime,
    followerModeMinutes,
    ignoredUsers,
  };
}
