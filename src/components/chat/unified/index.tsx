import {
  useEffect,
  useRef,
  useState,
  memo,
  useImperativeHandle,
  forwardRef,
  useCallback,
  useMemo,
} from "react";
import type { TwitchMessage, ChatFont, Platform } from "../../../lib/types";
import { FONT_FAMILY_MAP, MAX_DISPLAYED_MESSAGES } from "../../../lib/types";
import { useChatTouchGestures } from "../../../hooks/chat/useChatTouchGestures";
import { useChatAutoScroll } from "../../../hooks/chat/useChatAutoScroll";
import { useModerationContext } from "../../../contexts/ModerationContext";
import { UnifiedTwitchMessageItem } from "./UnifiedTwitchMessageItem";
import { YouTubeMessageItem } from "./YouTubeMessageItem";
import MessageMenu from "../shared/MessageMenu";
import TwitchTimeoutDialog from "../shared/TwitchTimeoutDialog";
import YouTubeTimeoutMenu from "../shared/YouTubeTimeoutMenu";
import YouTubeTimeoutDialog from "../shared/YouTubeTimeoutDialog";
import EmoteTooltip from "../shared/EmoteTooltip";
import ChatterHistoryOverlay from "../shared/ChatterHistoryOverlay";
import ScrollToBottomButton from "../shared/ScrollToBottomButton";
import type { UnifiedEntry, MessagePart, YTMessage } from "./types";
import { getKey, getTime } from "./types";

interface UnifiedChatProps {
  twitchMessages: TwitchMessage[];
  ytMessages: YTMessage[];
  channelName: string;
  ytConnectionState?: {
    connected: boolean;
    loading: boolean;
    error: string | null;
    reconnecting: boolean;
  };
  ytLoading?: boolean;
  ytError?: string | null;
  twitchConnected?: boolean;
  onReply?: (message: TwitchMessage) => void;
  onCopyMessage?: () => void;
  currentUserDisplayName?: string;
  fontSize?: number;
  chatFont?: ChatFont;
  splitChatEnabled?: boolean;
  ignoredUsers?: string[];
  showDeletedMessages?: boolean;
  renderThirdPartyEmotesOnYoutube?: boolean;
}

export interface UnifiedChatHandle {
  scrollToBottom: () => void;
}

const EMPTY_STRING_ARRAY: string[] = [];

const UnifiedChat = forwardRef<UnifiedChatHandle, UnifiedChatProps>(
  function UnifiedChat(
    {
      twitchMessages,
      ytMessages,
      channelName,
      ytConnectionState,
      ytLoading,
      ytError,
      twitchConnected,
      onReply,
      onCopyMessage,
      currentUserDisplayName,
      fontSize = 14,
      chatFont = "inter" as ChatFont,
      splitChatEnabled = false,
      ignoredUsers = EMPTY_STRING_ARRAY,
      showDeletedMessages = false,
      renderThirdPartyEmotesOnYoutube = false,
    }: UnifiedChatProps,
    ref: React.ForwardedRef<UnifiedChatHandle>,
  ) {
    const {
      isModerator,
      modModeActive,
      compactActions,
      isYouTubeModerator,
      youtubeModModeActive,
      onDeleteMessage,
      onBanUser,
      onTimeoutUser,
      onUntimeoutUser,
      onWarnUser,
      onDeleteYouTubeMessage,
      onBanYouTubeUser,
      onTimeoutYouTubeUser,
    } = useModerationContext();
    const containerRef = useRef<HTMLDivElement>(null);
    const [emoteTooltip, setEmoteTooltip] = useState<{
      url: string;
      name: string;
      source: string;
      x: number;
      y: number;
    } | null>(null);
    const [twitchTimeoutDialog, setTwitchTimeoutDialog] = useState<{
      userId: string;
      username: string;
    } | null>(null);
    const [ytTimeoutMenu, setYtTimeoutMenu] = useState<{
      x: number;
      y: number;
      channelId: string;
      username: string;
    } | null>(null);
    const [ytTimeoutDialog, setYtTimeoutDialog] = useState<{
      channelId: string;
      username: string;
    } | null>(null);
    const [messageMenu, setMessageMenu] = useState<{
      x: number;
      y: number;
      entry: UnifiedEntry;
    } | null>(null);
    const [chatterHistory, setChatterHistory] = useState<{
      author: string;
      platform: Platform;
      authorAvatar?: string;
    } | null>(null);

    const handleViewHistory = (
      author: string,
      platform: Platform = "twitch",
      authorAvatar?: string,
    ) => {
      setChatterHistory({ author, platform, authorAvatar });
    };

    const handleUsernameClick = (
      e: React.MouseEvent,
      author: string,
      platform: Platform,
      authorAvatar?: string,
    ) => {
      e.preventDefault();
      e.stopPropagation();
      handleViewHistory(author, platform, authorAvatar);
    };

    // Close menus when clicking elsewhere
    useEffect(() => {
      const handleClick = (e: MouseEvent) => {
        if (
          (e.target as HTMLElement | null)?.closest(
            ".mod-context-menu, .yt-timeout-dialog, .yt-timeout-overlay, .tw-timeout-dialog, .tw-timeout-overlay",
          )
        ) {
          return;
        }
        setTwitchTimeoutDialog(null);
        setYtTimeoutMenu(null);
        setMessageMenu(null);
      };
      if (messageMenu || ytTimeoutMenu || twitchTimeoutDialog) {
        window.addEventListener("click", handleClick);
        window.addEventListener("contextmenu", handleClick);
      }
      return () => {
        window.removeEventListener("click", handleClick);
        window.removeEventListener("contextmenu", handleClick);
      };
    }, [messageMenu, ytTimeoutMenu, twitchTimeoutDialog]);

    const ignoredSet = useMemo(
      () => new Set(ignoredUsers.map((u) => u.toLowerCase())),
      [ignoredUsers],
    );

    // Merge and sort messages
    const entries: UnifiedEntry[] = useMemo(() => {
      const tw: UnifiedEntry[] = twitchMessages
        .flatMap((m) => (!ignoredSet.has(m.author.toLowerCase()) ? [{ source: "twitch" as const, msg: m }] : []));
      const yt: UnifiedEntry[] = ytMessages
        .flatMap((m) => (!ignoredSet.has(m.author.toLowerCase()) ? [{ source: "youtube" as const, msg: m }] : []));
      const merged = [...tw, ...yt].sort((a, b) => getTime(a) - getTime(b));
      return merged.length > MAX_DISPLAYED_MESSAGES
        ? merged.slice(-MAX_DISPLAYED_MESSAGES)
        : merged;
    }, [twitchMessages, ytMessages, ignoredSet]);

    const { isAtBottom, newMessagesCount, scrollToBottom } = useChatAutoScroll({
      containerRef,
      messages: entries,
    });

    const scrollToMessage = useCallback((targetId: string) => {
      const container = containerRef.current;
      if (!container) return;
      const el = container.querySelector<HTMLElement>(
        `[data-message-id="${CSS.escape(targetId)}"]`,
      );
      if (!el) return;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.add("message-highlight");
      setTimeout(() => el.classList.remove("message-highlight"), 2000);
    }, []);

    useImperativeHandle(ref, () => ({ scrollToBottom }));

    // Emote tooltip
    useEffect(() => {
      const handlePointerMove = (e: PointerEvent) => {
        const target = e.target as HTMLElement;
        if (
          target.tagName === "IMG" &&
          target.classList.contains("chat-emote")
        ) {
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
      };
      const el = containerRef.current;
      if (el) {
        el.addEventListener("pointermove", handlePointerMove);
      }
      return () => {
        if (el) {
          el.removeEventListener("pointermove", handlePointerMove);
        }
      };
    }, []);

    // Touch gestures
    const { handleTouchStart, handleTouchEnd, handleTouchMove, handleCopy } =
      useChatTouchGestures<UnifiedEntry>({
        onReply: onReply
          ? (entry) => {
              if (entry.source === "twitch")
                onReply(entry.msg as TwitchMessage);
            }
          : undefined,
        onLongPress: (entry) =>
          setMessageMenu({
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
            entry,
          }),
        onCopyMessage,
        getContent: (entry) => {
          if (entry.source === "twitch")
            return (entry.msg as TwitchMessage).content;
          return (entry.msg as YTMessage).parts
            .map((p: MessagePart) =>
              p.type === "text" ? (p.text ?? "") : (p.emojiText ?? p.alt ?? ""),
            )
            .join("");
        },
        canReply: (entry) => entry.source === "twitch",
      });

    const ytState = ytConnectionState;
    const showStatusBar =
      ytState !== undefined || twitchConnected !== undefined;

    return (
      <div className="unified-chat-wrapper">
        {showStatusBar && (
          <div className="chat-status-bar">
            <span
              className={`platform-status${twitchConnected ? " platform-status--connected" : " platform-status--disconnected"}`}
            >
              <span className="platform-status-dot" />
              <span className="platform-status-text">Twitch</span>
            </span>
            {ytState &&
              (() => {
                const isLive = ytState.connected;
                const isReconnecting = !!ytState.reconnecting;
                const isSseLoading = ytState.loading && !isLive;
                const isSearching = ytLoading && !isLive && !isSseLoading;
                const hasError = ytState.error || ytError;

                let statusClass = "platform-status";
                let statusText = "YouTube";
                let dotClass = "platform-status-dot";

                if (isReconnecting) {
                  statusClass += " platform-status--loading";
                  statusText = "YouTube: Reconnecting\u2026";
                  dotClass += " platform-status-dot--loading";
                } else if (isLive) {
                  statusClass += " platform-status--connected";
                  statusText = "YouTube Live";
                } else if (isSseLoading) {
                  statusClass += " platform-status--loading";
                  statusText = "YouTube: Connecting\u2026";
                  dotClass += " platform-status-dot--loading";
                } else if (isSearching) {
                  statusClass += " platform-status--searching";
                  statusText = "YouTube: Searching\u2026";
                  dotClass += " platform-status-dot--loading";
                } else if (hasError) {
                  statusClass += " platform-status--error";
                  statusText = `YouTube: ${hasError}`;
                } else {
                  statusClass += " platform-status--disconnected";
                }

                return (
                  <span className={statusClass}>
                    <span className={dotClass} />
                    <span className="platform-status-text">{statusText}</span>
                  </span>
                );
              })()}
          </div>
        )}
        <div
          ref={containerRef}
          className={`messages-container unified-messages-container${splitChatEnabled ? " split-chat" : ""}`}
          style={
            {
              "--chat-font-size": `${fontSize}px`,
              "--chat-font-family": FONT_FAMILY_MAP[chatFont],
            } as React.CSSProperties
          }
        >
          {entries.length === 0 && (
            <div className="no-messages">
              <p>No messages yet. Start chatting!</p>
            </div>
          )}
          {entries.map((entry, index) => {
            if (entry.source === "twitch") {
              return (
                <UnifiedTwitchMessageItem
                  key={getKey(entry)}
                  entry={entry}
                  index={index}
                  entries={entries}
                  currentUserDisplayName={currentUserDisplayName}
                  onReply={onReply}
                  onCopyMessage={onCopyMessage}
                  onTimeoutMenu={(x, y, userId, username) =>
                    setTwitchTimeoutDialog({ userId, username })
                  }
                  onMessageMenu={(x, y, e) =>
                    setMessageMenu({ x, y, entry: e })
                  }
                  onUsernameClick={(e, author, avatar) =>
                    handleUsernameClick(e, author, "twitch", avatar)
                  }
                  onTouchStart={handleTouchStart}
                  onTouchEnd={handleTouchEnd}
                  onTouchMove={handleTouchMove}
                  onScrollToMessage={scrollToMessage}
                />
              );
            }
            return (
              <YouTubeMessageItem
                key={getKey(entry)}
                entry={entry}
                index={index}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                onTouchMove={handleTouchMove}
                onContextMenu={(x, y, e) => setMessageMenu({ x, y, entry: e })}
                onTimeoutMenu={(x, y, channelId, username) =>
                  setYtTimeoutDialog({ channelId, username })
                }
                onUsernameClick={(e, author, avatar) =>
                  handleUsernameClick(e, author, "youtube", avatar)
                }
                showDeletedMessages={showDeletedMessages}
                renderThirdPartyEmotes={renderThirdPartyEmotesOnYoutube}
              />
            );
          })}
        </div>

        {!isAtBottom && (
          <ScrollToBottomButton
            count={newMessagesCount}
            onClick={scrollToBottom}
          />
        )}

        {emoteTooltip && <EmoteTooltip {...emoteTooltip} />}

        {messageMenu && (
          <MessageMenu
            x={messageMenu.x}
            y={messageMenu.y}
            entry={messageMenu.entry}
            onReply={onReply}
            onCopy={handleCopy}
            onViewHistory={(author, avatar) =>
              handleViewHistory(author, messageMenu.entry.source, avatar)
            }
            onOpenYouTubeTimeoutMenu={(x, y, channelId, username) =>
              setYtTimeoutDialog({ channelId, username })
            }
            onOpenTwitchTimeoutMenu={(userId, username) =>
              setTwitchTimeoutDialog({ userId, username })
            }
            onClose={() => setMessageMenu(null)}
          />
        )}

        {chatterHistory && (
          <ChatterHistoryOverlay
            author={chatterHistory.author}
            platform={chatterHistory.platform}
            authorAvatar={chatterHistory.authorAvatar}
            channel={channelName}
            onClose={() => setChatterHistory(null)}
          />
        )}

        {twitchTimeoutDialog && (
          <TwitchTimeoutDialog
            userId={twitchTimeoutDialog.userId}
            username={twitchTimeoutDialog.username}
            onConfirm={(userId, seconds, username) => {
              onTimeoutUser?.(userId, seconds, username);
              setTwitchTimeoutDialog(null);
            }}
            onClose={() => setTwitchTimeoutDialog(null)}
          />
        )}

        {ytTimeoutMenu && (
          <YouTubeTimeoutMenu
            channelId={ytTimeoutMenu.channelId}
            username={ytTimeoutMenu.username}
            x={ytTimeoutMenu.x}
            y={ytTimeoutMenu.y}
            onTimeout={(channelId, seconds, username) =>
              onTimeoutYouTubeUser?.(channelId, seconds, username)
            }
            onClose={() => setYtTimeoutMenu(null)}
          />
        )}

        {ytTimeoutDialog && (
          <YouTubeTimeoutDialog
            channelId={ytTimeoutDialog.channelId}
            username={ytTimeoutDialog.username}
            onConfirm={(channelId, seconds, username) => {
              onTimeoutYouTubeUser?.(channelId, seconds, username);
              setYtTimeoutDialog(null);
            }}
            onClose={() => setYtTimeoutDialog(null)}
          />
        )}
      </div>
    );
  },
);

export default memo(UnifiedChat);
