import React, {
  useState,
  useEffect,
  useMemo,
  memo,
  useCallback,
  useImperativeHandle,
  useRef,
} from "react";
import type { TwitchMessage, Platform, ChatFont } from "../../../lib/types";
import type { SubscriptionStatus } from "../../../hooks/chat/useEventSub";
import { FONT_FAMILY_MAP, MAX_DISPLAYED_MESSAGES } from "../../../lib/types";
import { useChatTouchGestures } from "../../../hooks/chat/useChatTouchGestures";
import { useChatAutoScroll } from "../../../hooks/chat/useChatAutoScroll";
import { useMentionColorMap } from "../../../hooks/chat/useMentionColorMap";
import { useLazyChatHistory } from "../../../hooks/chat/useLazyChatHistory";
import { useFirstMessageIds } from "../../../hooks/chat/useFirstMessageIds";
import { useModerationContext } from "../../../contexts/ModerationContext";
import {
  accumulateChatStats,
  buildChatStats,
  createChatStatsStore,
  resetChatStatEntry,
  resetChatStatEntries,
  CHAT_STATS_MAX_RESULTS,
  type ChatStatsResult,
  type ChatStatsWindow,
} from "../../../lib/chatStats";
import { getAllChannelHistory } from "../../../lib/chatHistoryStorage";
import ChatHeader from "./ChatHeader";
import { DisplayTwitchMessageItem } from "./DisplayTwitchMessageItem";
import EmoteTooltip from "../shared/EmoteTooltip";
import TwitchTimeoutDialog from "../shared/TwitchTimeoutDialog";
import MessageMenu from "../shared/MessageMenu";
import ScrollToBottomButton from "../shared/ScrollToBottomButton";
import ChatterHistoryOverlay from "../shared/ChatterHistoryOverlay";
import ChatStatsOverlay from "../shared/ChatStatsOverlay";
import type {
  EmoteTooltipState,
  MessageMenuState,
} from "./types";

interface ChatDisplayProps {
  messages: TwitchMessage[];
  ytMessages?: Array<{ author: string; authorAvatar?: string }>;
  isLoading: boolean;
  selectedPlatforms: Platform[];
  onReply?: (message: TwitchMessage) => void;
  onMentionUser?: (username: string) => void;
  channelName?: string;
  channelDisplayName?: string;
  streamTitle?: string;
  streamGameName?: string;
  isStreamLive?: boolean;
  streamUptime?: string;
  streamStartedAt?: Date | null;
  viewerCount?: number | null;
  onRefreshEmotes?: () => void;
  isRefreshingEmotes?: boolean;
  onToggleSidebar?: () => void;
  sidebarVisible?: boolean;
  onCopyMessage?: () => void;
  showStreamEmbed?: boolean;
  onToggleStreamEmbed?: () => void;
  currentUserDisplayName?: string;
  fontSize?: number;
  chatFont?: ChatFont;
  unifiedChatSlot?: React.ReactNode;
  splitChatEnabled?: boolean;
  hideViewerCount?: boolean;
  ignoredUsers?: string[];
  onUpdateTitle?: (title: string) => Promise<void>;
  onUpdateCategory?: (gameId: string, gameName: string) => Promise<void>;
  onSearchCategories?: (
    query: string,
  ) => Promise<Array<{ id: string; name: string }>>;
  showModTools?: boolean;
  onOpenModTools?: () => void;
  subscriptionStatuses?: Map<string, SubscriptionStatus>;
  redemptionPubSubStatus?: SubscriptionStatus | "disconnected";
  isOnOwnChannel?: boolean;
  maxDisplayedMessages?: number;
  markFirstMessages?: boolean;
  ref?: React.Ref<ChatDisplayHandle>;
}

export interface ChatDisplayHandle {
  scrollToBottom: () => void;
}

const EMPTY_STRING_ARRAY: string[] = [];

interface ChatDisplayOverlaysProps {
  emoteTooltip: EmoteTooltipState | null;
  twitchTimeoutDialog: { userId: string; username: string } | null;
  messageMenu: MessageMenuState | null;
  chatterHistory: {
    author: string;
    platform: Platform;
    authorAvatar?: string;
  } | null;
  channelName?: string;
  streamStartedAt?: Date | null;
  chatStatsOpen: boolean;
  chatStats: ChatStatsResult | null;
  chatStatsLoading: boolean;
  chatStatsWindow: ChatStatsWindow;
  onReply?: (message: TwitchMessage) => void;
  onCopy: (msg: TwitchMessage) => void;
  onViewHistory: (
    author: string,
    platform?: Platform,
    authorAvatar?: string,
  ) => void;
  onConfirmTimeout: (userId: string, seconds: number, username: string) => void;
  onCloseTimeout: () => void;
  onOpenTimeoutMenu: (userId: string, username: string) => void;
  onCloseMessageMenu: () => void;
  onCloseChatterHistory: () => void;
  onChatStatsWindowChange: (next: ChatStatsWindow) => void;
  onCloseChatStats: () => void;
  onResetChatStatEntry: (key: string) => void;
  onResetChatStatEntries: () => void;
}

function ChatDisplayOverlays({
  emoteTooltip,
  twitchTimeoutDialog,
  messageMenu,
  chatterHistory,
  channelName,
  streamStartedAt,
  chatStatsOpen,
  chatStats,
  chatStatsLoading,
  chatStatsWindow,
  onReply,
  onCopy,
  onViewHistory,
  onConfirmTimeout,
  onCloseTimeout,
  onOpenTimeoutMenu,
  onCloseMessageMenu,
  onCloseChatterHistory,
  onChatStatsWindowChange,
  onCloseChatStats,
  onResetChatStatEntry,
  onResetChatStatEntries,
}: ChatDisplayOverlaysProps) {
  return (
    <>
      {emoteTooltip && (
        <EmoteTooltip
          url={emoteTooltip.url}
          name={emoteTooltip.name}
          source={emoteTooltip.source}
          x={emoteTooltip.x}
          y={emoteTooltip.y}
        />
      )}

      {twitchTimeoutDialog && (
        <TwitchTimeoutDialog
          userId={twitchTimeoutDialog.userId}
          username={twitchTimeoutDialog.username}
          onConfirm={onConfirmTimeout}
          onClose={onCloseTimeout}
        />
      )}

      {messageMenu && (
        <MessageMenu
          entry={messageMenu.message}
          x={messageMenu.x}
          y={messageMenu.y}
          onReply={onReply}
          onCopy={onCopy}
          onViewHistory={(author) =>
            onViewHistory(author, messageMenu.message.platform)
          }
          onOpenTwitchTimeoutMenu={onOpenTimeoutMenu}
          onClose={onCloseMessageMenu}
        />
      )}

      {chatterHistory && (
        <ChatterHistoryOverlay
          author={chatterHistory.author}
          platform={chatterHistory.platform}
          authorAvatar={chatterHistory.authorAvatar}
          channel={channelName || ""}
          onClose={onCloseChatterHistory}
        />
      )}

      {chatStatsOpen && chatStats && (
        <ChatStatsOverlay
          stats={chatStats}
          loading={chatStatsLoading}
          timeWindow={chatStatsWindow}
          onTimeWindowChange={onChatStatsWindowChange}
          streamStartedAt={streamStartedAt ?? null}
          onClose={onCloseChatStats}
          onResetEntry={onResetChatStatEntry}
          onResetEntries={onResetChatStatEntries}
        />
      )}
    </>
  );
}

const ChatDisplay = ({
  messages,
  ytMessages,
  isLoading,
  selectedPlatforms,
  onReply,
  onMentionUser,
  channelName,
  channelDisplayName,
  streamTitle,
  streamGameName,
  isStreamLive,
  streamUptime,
  streamStartedAt,
  viewerCount,
  onRefreshEmotes,
  isRefreshingEmotes = false,
  onToggleSidebar,
  sidebarVisible = true,
  onCopyMessage,
  showStreamEmbed = true,
  onToggleStreamEmbed,
  currentUserDisplayName,
  fontSize = 14,
  chatFont = "inter" as ChatFont,
  unifiedChatSlot,
  splitChatEnabled = false,
  hideViewerCount = false,
  ignoredUsers = EMPTY_STRING_ARRAY,
  onUpdateTitle,
  onUpdateCategory,
  onSearchCategories,
  showModTools = false,
  onOpenModTools,
  subscriptionStatuses,
  redemptionPubSubStatus,
  isOnOwnChannel = false,
  maxDisplayedMessages = MAX_DISPLAYED_MESSAGES,
  markFirstMessages = false,
  ref,
}: ChatDisplayProps) => {
  const {
    isModerator,
    modModeActive,
    compactActions,
    onDeleteMessage,
    onBanUser,
    onTimeoutUser,
    onUntimeoutUser,
    onWarnUser,
  } = useModerationContext();
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [emoteTooltip, setEmoteTooltip] = useState<EmoteTooltipState | null>(
    null,
  );
  const [twitchTimeoutDialog, setTwitchTimeoutDialog] = useState<{
    userId: string;
    username: string;
  } | null>(null);
  const [messageMenu, setMessageMenu] = useState<MessageMenuState | null>(
    null,
  );
  const [chatterHistory, setChatterHistory] = useState<{
    author: string;
    platform: Platform;
    authorAvatar?: string;
  } | null>(null);
  const [chatStatsOpen, setChatStatsOpen] = useState(false);
  const [chatStats, setChatStats] = useState<ChatStatsResult | null>(null);
  const [chatStatsLoading, setChatStatsLoading] = useState(false);
  const [chatStatsWindow, setChatStatsWindow] =
    useState<ChatStatsWindow>("all");
  const chatStatsWindowRef = useRef<ChatStatsWindow>("all");
  // useRef has no lazy initializer, so allocate the store once instead of
  // rebuilding (and discarding) it on every render.
  const chatStatsStore = useRef<ReturnType<
    typeof createChatStatsStore
  > | null>(null);
  if (chatStatsStore.current === null) {
    chatStatsStore.current = createChatStatsStore(channelName);
  }
  const statsScopeRef = useRef<string | null>(null);
  const historyLoadedScopeRef = useRef<string | null>(null);
  const historyInFlightScopeRef = useRef<string | null>(null);

  // Stats are scoped to the current stream. Without a stream start (offline)
  // they fall back to messages observed this session only.
  const streamStartMs = streamStartedAt ? streamStartedAt.getTime() : undefined;
  const statsScope = `${channelName ?? ""}:${streamStartMs ?? "session"}`;

  const statsLiveMessages = useMemo(() => {
    if (streamStartMs === undefined) {
      return messages.filter((msg) => !msg.isPreloaded);
    }
    return messages.filter((msg) => msg.timestamp.getTime() >= streamStartMs);
  }, [messages, streamStartMs]);

  const rebuildChatStats = useCallback(() => {
    setChatStats(
      buildChatStats(
        chatStatsStore.current!,
        CHAT_STATS_MAX_RESULTS,
        chatStatsWindowRef.current,
        streamStartMs,
      ),
    );
  }, [streamStartMs]);

  const openChatStats = useCallback(() => setChatStatsOpen(true), []);
  const closeChatStats = useCallback(() => setChatStatsOpen(false), []);
  const handleResetChatStatEntry = useCallback(
    (key: string) => {
      resetChatStatEntry(chatStatsStore.current!, key);
      rebuildChatStats();
    },
    [rebuildChatStats],
  );
  const handleResetChatStatEntries = useCallback(() => {
    resetChatStatEntries(chatStatsStore.current!);
    rebuildChatStats();
  }, [rebuildChatStats]);
  const handleChatStatsWindowChange = useCallback(
    (next: ChatStatsWindow) => {
      chatStatsWindowRef.current = next;
      setChatStatsWindow(next);
      rebuildChatStats();
    },
    [rebuildChatStats],
  );

  const messagesEmpty = messages.length === 0;

  // Fold live messages into the per-stream accumulator as they stream by, so
  // counts survive the in-memory window cap. A channel or stream change (or an
  // empty window) starts a fresh accumulator. The ranked result is only
  // rebuilt while the overlay is open.
  useEffect(() => {
    if (messagesEmpty || statsScopeRef.current !== statsScope) {
      chatStatsStore.current = createChatStatsStore(channelName);
      statsScopeRef.current = statsScope;
      historyLoadedScopeRef.current = null;
    }
    accumulateChatStats(chatStatsStore.current!, statsLiveMessages);
    if (chatStatsOpen) rebuildChatStats();
  }, [
    statsLiveMessages,
    messagesEmpty,
    chatStatsOpen,
    channelName,
    statsScope,
    rebuildChatStats,
  ]);

  // When the overlay opens, backfill the accumulator from IndexedDB so the
  // ranking covers the whole current stream, not just the live window. Older
  // streams stay in IndexedDB (5-day retention) but are excluded here.
  useEffect(() => {
    if (!chatStatsOpen || !channelName || streamStartMs === undefined) return;
    if (historyLoadedScopeRef.current === statsScope) return;
    if (historyInFlightScopeRef.current === statsScope) return;

    historyInFlightScopeRef.current = statsScope;
    setChatStatsLoading(true);

    getAllChannelHistory(channelName, {
      platforms: ["twitch"],
      since: streamStartMs,
    })
      .then((history) => {
        if (statsScopeRef.current !== statsScope) return;
        accumulateChatStats(chatStatsStore.current!, history);
        historyLoadedScopeRef.current = statsScope;
        rebuildChatStats();
      })
      .catch(() => {})
      .finally(() => {
        if (historyInFlightScopeRef.current === statsScope) {
          historyInFlightScopeRef.current = null;
        }
        if (statsScopeRef.current === statsScope) {
          setChatStatsLoading(false);
        }
      });
  }, [chatStatsOpen, channelName, streamStartMs, statsScope, rebuildChatStats]);

  // Relative windows age as time passes even when no new messages arrive, so
  // periodically rebuild the ranking while a non-"all" window is selected.
  useEffect(() => {
    if (!chatStatsOpen || chatStatsWindow === "all") return;
    const interval = setInterval(rebuildChatStats, 15000);
    return () => clearInterval(interval);
  }, [chatStatsOpen, chatStatsWindow, rebuildChatStats]);

  const handleViewHistory = useCallback(
    (
      author: string,
      platform: Platform = "twitch",
      authorAvatar?: string,
    ) => {
      setChatterHistory({ author, platform, authorAvatar });
    },
    [],
  );

  const handleUsernameClick = useCallback(
    (e: React.MouseEvent, author: string) => {
      e.preventDefault();
      e.stopPropagation();
      onMentionUser?.(author);
    },
    [onMentionUser],
  );

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        (e.target as HTMLElement | null)?.closest(
          ".yt-timeout-dialog, .yt-timeout-overlay, .tw-timeout-dialog, .tw-timeout-overlay",
        )
      ) {
        return;
      }
      setTwitchTimeoutDialog(null);
    };
    if (twitchTimeoutDialog) {
      window.addEventListener("click", handleClick);
      window.addEventListener("contextmenu", handleClick);
    }
    return () => {
      window.removeEventListener("click", handleClick);
      window.removeEventListener("contextmenu", handleClick);
    };
  }, [twitchTimeoutDialog]);

  useEffect(() => {
    const handleClick = () => setMessageMenu(null);
    if (messageMenu) {
      window.addEventListener("click", handleClick);
      window.addEventListener("contextmenu", handleClick);
    }
    return () => {
      window.removeEventListener("click", handleClick);
      window.removeEventListener("contextmenu", handleClick);
    };
  }, [messageMenu]);

  const filteredMessages = useMemo(() => {
    let filtered = messages;

    filtered = filtered.filter((msg, _, arr) => {
      if (!msg.optimistic) return true;
      const hasReal = arr.some(
        (other) =>
          other !== msg &&
          !other.optimistic &&
          other.isCurrentUser &&
          other.userId === msg.userId &&
          other.content === msg.content &&
          (other.replyTo?.id || "") === (msg.replyTo?.id || ""),
      );
      return !hasReal;
    });

    if (selectedPlatforms.length > 0) {        const platformSet = new Set(selectedPlatforms);
        filtered = filtered.filter((msg) =>
          platformSet.has(msg.platform),
        );
    }

    const ignoredSet = new Set(ignoredUsers.map((u) => u.toLowerCase()));
    filtered = filtered.filter(
      (msg) => !ignoredSet.has(msg.author.toLowerCase()),
    );

    return filtered.length > maxDisplayedMessages
      ? filtered.slice(-maxDisplayedMessages)
      : filtered;
  }, [messages, selectedPlatforms, ignoredUsers, maxDisplayedMessages]);

  // Lazily-loaded older messages from IndexedDB. Disabled when this pane is
  // only acting as the header for the unified chat (unifiedChatSlot).
  const { history: olderMessages } = useLazyChatHistory<TwitchMessage>({
    channel: channelName,
    enabled: !unifiedChatSlot,
    live: messages,
    platforms: ["twitch"],
    containerRef: messagesContainerRef,
    keyOf: (msg) => `twitch:${msg.id}`,
    timestampOf: (msg) => msg.timestamp.getTime(),
    isOptimistic: (msg) => msg.optimistic === true,
    isEphemeral: (msg) => msg.messageType === "automod",
    mapStored: (msg) => msg as TwitchMessage,
    maxHistory: maxDisplayedMessages,
    liveCap: maxDisplayedMessages,
  });

  const renderedMessages = useMemo(() => {
    if (olderMessages.length === 0) return filteredMessages;
    const ignoredSet = new Set(ignoredUsers.map((u) => u.toLowerCase()));
    const liveIds = new Set(filteredMessages.map((m) => m.id));
    const older = olderMessages.filter(
      (m) => !liveIds.has(m.id) && !ignoredSet.has(m.author.toLowerCase()),
    );
    return older.length === 0
      ? filteredMessages
      : [...older, ...filteredMessages];
  }, [olderMessages, filteredMessages, ignoredUsers]);

  const firstScanItems = useMemo(
    () =>
      renderedMessages.map((msg) => ({
        key: `twitch:${msg.id}`,
        authorKey: `twitch:${msg.author.toLowerCase()}`,
        timeMs: msg.timestamp.getTime(),
        isPreloaded: msg.isPreloaded,
      })),
    [renderedMessages],
  );
  const firstMessageIds = useFirstMessageIds(
    firstScanItems,
    statsScope,
    streamStartMs,
  );

  const ignoredCount = useMemo(() => {
    const ignoredSet = new Set(ignoredUsers.map((u) => u.toLowerCase()));
    return messages.filter((msg) => ignoredSet.has(msg.author.toLowerCase()))
      .length;
  }, [messages, ignoredUsers]);

  const ignoredUserCounts = useMemo(() => {
    const ignoredSet = new Set(ignoredUsers.map((u) => u.toLowerCase()));
    const counts = new Map<
      string,
      {
        count: number;
        displayName: string;
        authorAvatar?: string;
        platform: Platform;
      }
    >();

    const tally = (
      author: string,
      authorAvatar: string | undefined,
      platform: Platform,
    ) => {
      const lower = author.toLowerCase();
      if (ignoredSet.has(lower)) {
        const existing = counts.get(lower);
        if (existing) {
          existing.count++;
        } else {
          counts.set(lower, {
            count: 1,
            displayName: author,
            authorAvatar,
            platform,
          });
        }
      }
    };

    for (const msg of messages)
      tally(msg.author, msg.authorAvatar, msg.platform);
    if (ytMessages) {
      for (const msg of ytMessages)
        tally(msg.author, msg.authorAvatar, "youtube");
    }

    return counts;
  }, [messages, ytMessages, ignoredUsers]);

  const { isAtBottom, newMessagesCount, scrollToBottom } = useChatAutoScroll({
    containerRef: messagesContainerRef,
    messages: renderedMessages,
  });

  useImperativeHandle(ref, () => ({ scrollToBottom }));

  const authorColorById = useMemo(() => {
    const map = new Map<string, string>();
    renderedMessages.forEach((message) => {
      if (message.authorColor) {
        map.set(message.id, message.authorColor);
      }
    });
    return map;
  }, [renderedMessages]);

  const mentionColors = useMentionColorMap(renderedMessages);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "IMG" && target.classList.contains("chat-emote")) {
      const tooltipUrl = target.getAttribute("data-tooltip-url");
      const emoteName = target.getAttribute("data-emote-name") || "Emote";
      const emoteSource =
        target.getAttribute("data-emote-source") || "Twitch";
      const emoteAuthor =
        target.getAttribute("data-emote-author") || undefined;
      if (tooltipUrl) {
        const rect = target.getBoundingClientRect();
        setEmoteTooltip((prev) => {
          if (
            prev &&
            prev.url === tooltipUrl &&
            prev.x === rect.left &&
            prev.y === rect.top
          )
            return prev;
          return {
            url: tooltipUrl,
            name: emoteName,
            source: emoteSource,
            author: emoteAuthor,
            x: rect.left,
            y: rect.top,
          };
        });
      }
    } else {
      setEmoteTooltip(null);
    }
  }, []);

  useEffect(() => {
    const messagesContainer = messagesContainerRef.current;
    if (messagesContainer) {
      messagesContainer.addEventListener("pointermove", handlePointerMove);
    }
    return () => {
      if (messagesContainer) {
        messagesContainer.removeEventListener(
          "pointermove",
          handlePointerMove,
        );
      }
    };
  }, [handlePointerMove]);

  const { handleTouchStart, handleTouchEnd, handleTouchMove, handleCopy } =
    useChatTouchGestures<TwitchMessage>({
      onReply,
      onLongPress: (msg) =>
        setMessageMenu({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
          message: msg,
        }),
      onCopyMessage,
      getContent: (msg) => msg.content,
    });

  const scrollToMessage = useCallback((targetId: string) => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLElement>(
      `[data-message-id="${CSS.escape(targetId)}"]`,
    );
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("message-highlight");
    setTimeout(() => el.classList.remove("message-highlight"), 2000);
  }, []);

  return (
    <div className="chat-display">
      <ChatHeader
        channelName={channelName}
        channelDisplayName={channelDisplayName}
        isStreamLive={isStreamLive}
        streamUptime={streamUptime}
        streamTitle={streamTitle}
        streamGameName={streamGameName}
        viewerCount={viewerCount}
        hideViewerCount={hideViewerCount}
        isLoading={isLoading}
        isRefreshingEmotes={isRefreshingEmotes}
        showStreamEmbed={showStreamEmbed}
        sidebarVisible={sidebarVisible}
        onToggleSidebar={onToggleSidebar}
        onToggleStreamEmbed={onToggleStreamEmbed}
        onRefreshEmotes={onRefreshEmotes}
        onUpdateTitle={onUpdateTitle}
        onUpdateCategory={onUpdateCategory}
        onSearchCategories={onSearchCategories}
        ignoredUserCounts={ignoredUserCounts}
        onOpenIgnoredUserOverlay={(author, authorAvatar, platform) =>
          setChatterHistory({
            author,
            platform: platform || "twitch",
            authorAvatar,
          })
        }
        showModTools={showModTools}
        onOpenModTools={onOpenModTools}
        subscriptionStatuses={subscriptionStatuses}
        redemptionPubSubStatus={redemptionPubSubStatus}
        isOnOwnChannel={isOnOwnChannel}
        onOpenChatStats={openChatStats}
      />

      {unifiedChatSlot ? (
        unifiedChatSlot
      ) : (
        <div
          className={`messages-container${splitChatEnabled ? " split-chat" : ""}`}
          ref={messagesContainerRef}
          style={
            {
              "--chat-font-size": `${fontSize}px`,
              "--chat-font-family": FONT_FAMILY_MAP[chatFont],
            } as React.CSSProperties
          }
        >
          {renderedMessages.length === 0 ? (
            <div className="no-messages">
              <p>No messages yet. Start chatting!</p>
            </div>
          ) : (
            renderedMessages.map((msg, index) => (
              <DisplayTwitchMessageItem
                key={msg.id}
                msg={msg}
                index={index}
                filteredMessages={renderedMessages}
                authorColorById={authorColorById}
                mentionColors={mentionColors}
                currentUserDisplayName={currentUserDisplayName}
                showFirstMessage={
                  markFirstMessages && firstMessageIds.has(`twitch:${msg.id}`)
                }
                onReply={onReply}
                onCopy={handleCopy}
                onUsernameClick={(e, author) =>
                  handleUsernameClick(e, author)
                }
                fontSize={fontSize}
                onTimeoutMenu={(state) =>
                  setTwitchTimeoutDialog({ userId: state.userId, username: state.username })
                }
                onScrollToMessage={scrollToMessage}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                onTouchMove={handleTouchMove}
                onContextMenu={(e, msg) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMessageMenu({
                    x: e.clientX,
                    y: e.clientY,
                    message: msg,
                  });
                }}
              />
            ))
          )}
        </div>
      )}

      {!isAtBottom && !unifiedChatSlot && (
        <ScrollToBottomButton
          count={newMessagesCount}
          onClick={scrollToBottom}
        />
      )}

      <ChatDisplayOverlays
        emoteTooltip={emoteTooltip}
        twitchTimeoutDialog={twitchTimeoutDialog}
        messageMenu={messageMenu}
        chatterHistory={chatterHistory}
        channelName={channelName}
        streamStartedAt={streamStartedAt}
        chatStatsOpen={chatStatsOpen}
        chatStats={chatStats}
        chatStatsLoading={chatStatsLoading}
        chatStatsWindow={chatStatsWindow}
        onReply={onReply}
        onCopy={handleCopy}
        onViewHistory={handleViewHistory}
        onConfirmTimeout={(userId, seconds, username) => {
          onTimeoutUser?.(userId, seconds, username);
          setTwitchTimeoutDialog(null);
        }}
        onCloseTimeout={() => setTwitchTimeoutDialog(null)}
        onOpenTimeoutMenu={(userId, username) =>
          setTwitchTimeoutDialog({ userId, username })
        }
        onCloseMessageMenu={() => setMessageMenu(null)}
        onCloseChatterHistory={() => setChatterHistory(null)}
        onChatStatsWindowChange={handleChatStatsWindowChange}
        onCloseChatStats={closeChatStats}
        onResetChatStatEntry={handleResetChatStatEntry}
        onResetChatStatEntries={handleResetChatStatEntries}
      />
    </div>
  );
};

export default memo(ChatDisplay);
