import React, {
  useState,
  useEffect,
  useMemo,
  memo,
  useCallback,
  useImperativeHandle,
  forwardRef,
  useRef,
} from "react";
import type { ChatMessage, Platform, ChatFont } from "../../../lib/types";
import { FONT_FAMILY_MAP, MAX_DISPLAYED_MESSAGES } from "../../../lib/types";
import { useChatTouchGestures } from "../../../hooks/useChatTouchGestures";
import { useChatAutoScroll } from "../../../hooks/useChatAutoScroll";
import ChatHeader from "./ChatHeader";
import ChatMessageItem from "./ChatMessageItem";
import EmoteTooltip from "../shared/EmoteTooltip";
import TimeoutMenu from "../shared/TimeoutMenu";
import MessageMenu from "../shared/MessageMenu";
import ScrollToBottomButton from "../shared/ScrollToBottomButton";
import ChatterHistoryOverlay from "../shared/ChatterHistoryOverlay";
import type {
  EmoteTooltipState,
  TimeoutMenuState,
  MessageMenuState,
} from "./types";

interface ChatDisplayProps {
  messages: ChatMessage[];
  ytMessages?: Array<{ author: string; authorAvatar?: string }>;
  isLoading: boolean;
  selectedPlatforms: Platform[];
  onReply?: (message: ChatMessage) => void;
  channelName?: string;
  channelDisplayName?: string;
  streamTitle?: string;
  streamGameName?: string;
  isStreamLive?: boolean;
  streamUptime?: string;
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
  isModerator?: boolean;
  modModeActive?: boolean;
  onToggleModMode?: () => void;
  onDeleteMessage?: (messageId: string) => void;
  onBanUser?: (userId: string, displayName?: string) => void;
  onTimeoutUser?: (
    userId: string,
    seconds: number,
    displayName?: string,
  ) => void;
  onUntimeoutUser?: (userName: string) => void;
  onWarnUser?: (userName: string) => void;
  compactActions?: boolean;
  splitChatEnabled?: boolean;
  hideViewerCount?: boolean;
  ignoredUsers?: string[];
  onUpdateTitle?: (title: string) => Promise<void>;
  onUpdateCategory?: (gameId: string, gameName: string) => Promise<void>;
  onSearchCategories?: (
    query: string,
  ) => Promise<Array<{ id: string; name: string }>>;
}

export interface ChatDisplayHandle {
  scrollToBottom: () => void;
}

const ChatDisplay = forwardRef<ChatDisplayHandle, ChatDisplayProps>(
  function ChatDisplay(
    {
      messages,
      ytMessages,
      isLoading,
      selectedPlatforms,
      onReply,
      channelName,
      channelDisplayName,
      streamTitle,
      streamGameName,
      isStreamLive,
      streamUptime,
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
      isModerator = false,
      modModeActive = false,
      onToggleModMode,
      onDeleteMessage,
      onBanUser,
      onTimeoutUser,
      onUntimeoutUser,
      onWarnUser,
      compactActions = false,
      splitChatEnabled = false,
      hideViewerCount = false,
      ignoredUsers = [],
      onUpdateTitle,
      onUpdateCategory,
      onSearchCategories,
    }: ChatDisplayProps,
    ref: React.ForwardedRef<ChatDisplayHandle>,
  ) {
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const [emoteTooltip, setEmoteTooltip] = useState<EmoteTooltipState | null>(
      null,
    );
    const [timeoutMenu, setTimeoutMenu] = useState<TimeoutMenuState | null>(
      null,
    );
    const [messageMenu, setMessageMenu] = useState<MessageMenuState | null>(
      null,
    );
    const [chatterHistory, setChatterHistory] = useState<{
      author: string;
      platform: Platform;
      authorAvatar?: string;
    } | null>(null);

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
      (
        e: React.MouseEvent,
        author: string,
        platform: Platform,
        authorAvatar?: string,
      ) => {
        e.preventDefault();
        e.stopPropagation();
        handleViewHistory(author, platform, authorAvatar);
      },
      [handleViewHistory],
    );

    useEffect(() => {
      const handleClick = () => setTimeoutMenu(null);
      if (timeoutMenu) {
        window.addEventListener("click", handleClick);
        window.addEventListener("contextmenu", handleClick);
      }
      return () => {
        window.removeEventListener("click", handleClick);
        window.removeEventListener("contextmenu", handleClick);
      };
    }, [timeoutMenu]);

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

      if (selectedPlatforms.length > 0) {
        filtered = filtered.filter((msg) =>
          selectedPlatforms.includes(msg.platform),
        );
      }

      const ignoredSet = new Set(ignoredUsers.map((u) => u.toLowerCase()));
      filtered = filtered.filter(
        (msg) => !ignoredSet.has(msg.author.toLowerCase()),
      );

      return filtered.length > MAX_DISPLAYED_MESSAGES
        ? filtered.slice(-MAX_DISPLAYED_MESSAGES)
        : filtered;
    }, [messages, selectedPlatforms, ignoredUsers]);

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
      messages: filteredMessages,
    });

    useImperativeHandle(ref, () => ({ scrollToBottom }));

    const authorColorById = useMemo(() => {
      const map = new Map<string, string>();
      messages.forEach((message) => {
        if (message.authorColor) {
          map.set(message.id, message.authorColor);
        }
      });
      return map;
    }, [messages]);

    const handlePointerMove = useCallback((e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "IMG" && target.classList.contains("chat-emote")) {
        const tooltipUrl = target.getAttribute("data-tooltip-url");
        const emoteName = target.getAttribute("data-emote-name") || "Emote";
        const emoteSource =
          target.getAttribute("data-emote-source") || "Twitch";
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
      useChatTouchGestures<ChatMessage>({
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
          isModerator={isModerator}
          modModeActive={modModeActive}
          onToggleSidebar={onToggleSidebar}
          onToggleStreamEmbed={onToggleStreamEmbed}
          onRefreshEmotes={onRefreshEmotes}
          onToggleModMode={onToggleModMode}
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
            {filteredMessages.length === 0 ? (
              <div className="no-messages">
                <p>No messages yet. Start chatting!</p>
              </div>
            ) : (
              filteredMessages.map((msg, index) => (
                <ChatMessageItem
                  key={msg.id}
                  msg={msg}
                  index={index}
                  filteredMessages={filteredMessages}
                  authorColorById={authorColorById}
                  currentUserDisplayName={currentUserDisplayName}
                  isModerator={isModerator}
                  modModeActive={modModeActive}
                  compactActions={compactActions}
                  onReply={onReply}
                  onCopy={handleCopy}
                  onDeleteMessage={onDeleteMessage}
                  onBanUser={onBanUser}
                  onTimeoutUser={onTimeoutUser}
                  onUntimeoutUser={onUntimeoutUser}
                  onWarnUser={onWarnUser}
                  onUsernameClick={(e, author) =>
                    handleUsernameClick(
                      e,
                      author,
                      msg.platform,
                      msg.authorAvatar,
                    )
                  }
                  fontSize={fontSize}
                  onTimeoutMenu={setTimeoutMenu}
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

        {emoteTooltip && (
          <EmoteTooltip
            url={emoteTooltip.url}
            name={emoteTooltip.name}
            source={emoteTooltip.source}
            x={emoteTooltip.x}
            y={emoteTooltip.y}
          />
        )}

        {timeoutMenu && (
          <TimeoutMenu
            userId={timeoutMenu.userId}
            username={timeoutMenu.username}
            x={timeoutMenu.x}
            y={timeoutMenu.y}
            onTimeout={onTimeoutUser || (() => {})}
            onClose={() => setTimeoutMenu(null)}
          />
        )}

        {messageMenu && (
          <MessageMenu
            entry={messageMenu.message}
            x={messageMenu.x}
            y={messageMenu.y}
            isModerator={isModerator}
            modModeActive={modModeActive}
            compactActions={compactActions}
            onReply={onReply}
            onCopy={handleCopy}
            onDeleteMessage={onDeleteMessage}
            onTimeoutUser={onTimeoutUser}
            onBanUser={onBanUser}
            onWarnUser={onWarnUser}
            onViewHistory={(author) =>
              handleViewHistory(author, messageMenu.message.platform)
            }
            onClose={() => setMessageMenu(null)}
          />
        )}

        {chatterHistory && (
          <ChatterHistoryOverlay
            author={chatterHistory.author}
            platform={chatterHistory.platform}
            authorAvatar={chatterHistory.authorAvatar}
            channel={channelName || ""}
            isModerator={isModerator}
            onTimeoutUser={onTimeoutUser}
            onBanUser={onBanUser}
            onWarnUser={onWarnUser}
            onClose={() => setChatterHistory(null)}
          />
        )}
      </div>
    );
  },
);

export default memo(ChatDisplay);
