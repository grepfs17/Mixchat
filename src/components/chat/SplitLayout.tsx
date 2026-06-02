import type { RefObject } from "react";
import ChatDisplay from "./display";
import type { ChatDisplayHandle } from "./display";
import MessageInput from "./shared/MessageInput";
import YouTubePanel from "./shared/YouTubePanel";
import type { YTMessage } from "./unified/types";
import type {
  ChatFont,
  ChatMessage,
  Platform,
  PlatformSession,
} from "../../lib/types";

interface SplitChatProps {
  // Layout
  linkedYoutubeUrl?: string;
  showYoutubeSection: boolean;
  chatSplitRatio: number;
  isDraggingChatSplit: boolean;
  onSetIsDraggingChatSplit: (dragging: boolean) => void;

  // YouTube
  youtubeVideoId: string | null;
  useYoutubeEmbed: boolean;
  ytMessages: YTMessage[];
  ytOptimisticMessages: YTMessage[];
  ytLoading: boolean;
  ytError: string | null;
  onSetManualVideoId: (id: string) => void;
  onSetShowYoutubeSection: (show: boolean) => void;
  fontSize: number;
  chatFont: ChatFont;
  splitChatEnabled: boolean;
  onYtMessages: (messages: YTMessage[]) => void;
  youtubeSession?: PlatformSession;
  onOptimisticMessage: (id: string, text: string) => void;
  onOptimisticFailed: (id: string) => void;
  onShowError: (message: string) => void;
  onYtConnectionChange?: (state: {
    connected: boolean;
    loading: boolean;
    error: string | null;
  }) => void;
  onUsernameClick?: (
    e: React.MouseEvent,
    author: string,
    avatar?: string,
  ) => void;

  // Twitch ChatDisplay
  chatDisplayRef: RefObject<ChatDisplayHandle>;
  messages: ChatMessage[];
  isLoading: boolean;
  selectedPlatforms: Platform[];
  onReply: (message: ChatMessage) => void;
  channelName?: string;
  channelDisplayName?: string;
  streamTitle?: string;
  streamGameName?: string;
  isStreamLive?: boolean;
  streamUptime?: string;
  viewerCount?: number | null;
  hideViewerCount?: boolean;
  onRefreshEmotes?: () => void;
  isRefreshingEmotes?: boolean;
  onToggleSidebar?: () => void;
  sidebarVisible?: boolean;
  onCopyMessage?: () => void;
  showStreamEmbed?: boolean;
  onToggleStreamEmbed?: () => void;
  currentUserDisplayName?: string;
  isModerator?: boolean;
  modModeActive?: boolean;
  onToggleModMode?: () => void;
  onUpdateTitle?: (title: string) => Promise<void>;
  onUpdateCategory?: (gameId: string, gameName: string) => Promise<void>;
  onSearchCategories?: (
    query: string,
  ) => Promise<Array<{ id: string; name: string }>>;
  compactActions?: boolean;
  onDeleteMessage?: (messageId: string) => void;
  onBanUser?: (userId: string, displayName?: string) => void;
  onTimeoutUser?: (
    userId: string,
    seconds: number,
    displayName?: string,
  ) => void;
  onUntimeoutUser?: (userName: string) => void;
  onWarnUser?: (userName: string) => void;
  ignoredUsers?: string[];

  // MessageInput
  onSendMessage: (
    message: string,
    platforms: Platform[],
    replyToId?: string,
  ) => Promise<void>;
  twitchConnected: boolean;
  replyingTo?: ChatMessage;
  onCancelReply: () => void;
  currentUsername: string;
  onInputFocus: () => void;
  slowModeWaitTime: number | null;
  followerModeMinutes: number | null;
  isFollowing: boolean | null;
}

export default function SplitChat({
  linkedYoutubeUrl,
  showYoutubeSection,
  chatSplitRatio,
  isDraggingChatSplit,
  onSetIsDraggingChatSplit,
  youtubeVideoId,
  useYoutubeEmbed,
  ytMessages,
  ytOptimisticMessages,
  ytLoading,
  ytError,
  onSetManualVideoId,
  onSetShowYoutubeSection,
  fontSize,
  chatFont,
  splitChatEnabled,
  onYtMessages,
  youtubeSession,
  onOptimisticMessage,
  onOptimisticFailed,
  onShowError,
  onYtConnectionChange,
  onUsernameClick,
  chatDisplayRef,
  messages,
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
  hideViewerCount,
  onRefreshEmotes,
  isRefreshingEmotes,
  onToggleSidebar,
  sidebarVisible,
  onCopyMessage,
  showStreamEmbed,
  onToggleStreamEmbed,
  currentUserDisplayName,
  isModerator,
  modModeActive,
  onToggleModMode,
  onUpdateTitle,
  onUpdateCategory,
  onSearchCategories,
  compactActions,
  onDeleteMessage,
  onBanUser,
  onTimeoutUser,
  onUntimeoutUser,
  onWarnUser,
  ignoredUsers = [],
  onSendMessage,
  twitchConnected,
  replyingTo,
  onCancelReply,
  currentUsername,
  onInputFocus,
  slowModeWaitTime,
  followerModeMinutes,
  isFollowing,
}: SplitChatProps) {
  const safeSlowMode = slowModeWaitTime ?? 0;
  const safeFollowerMode = followerModeMinutes ?? 0;
  const safeIsFollowing = isFollowing ?? false;

  return (
    <>
      {linkedYoutubeUrl && showYoutubeSection && (
        <YouTubePanel
          style={{ height: `${chatSplitRatio}%`, minHeight: 0 }}
          linkedYoutubeUrl={linkedYoutubeUrl}
          youtubeVideoId={youtubeVideoId ?? null}
          channel={channelName}
          useYoutubeEmbed={useYoutubeEmbed}
          ytMessages={ytMessages}
          ytOptimisticMessages={ytOptimisticMessages}
          ytLoading={ytLoading}
          ytError={ytError}
          onSetManualVideoId={onSetManualVideoId}
          onSetShowYoutubeSection={onSetShowYoutubeSection}
          fontSize={fontSize}
          chatFont={chatFont}
          splitChatEnabled={splitChatEnabled}
          onYtMessages={onYtMessages}
          youtubeSession={youtubeSession}
          onOptimisticMessage={onOptimisticMessage}
          onOptimisticFailed={onOptimisticFailed}
          onError={onShowError}
          onConnectionChange={onYtConnectionChange}
          onUsernameClick={onUsernameClick}
        />
      )}

      {linkedYoutubeUrl && showYoutubeSection && (
        <div
          style={{
            height: "4px",
            backgroundColor: "#1a1a1a",
            cursor: "row-resize",
            userSelect: "none",
            zIndex: 10,
            transition: isDraggingChatSplit ? "none" : "background-color 0.2s",
          }}
          onMouseDown={() => onSetIsDraggingChatSplit(true)}
          onMouseEnter={(e) =>
            !isDraggingChatSplit &&
            (e.currentTarget.style.backgroundColor = "#6366f1")
          }
          onMouseLeave={(e) =>
            !isDraggingChatSplit &&
            (e.currentTarget.style.backgroundColor = "#1a1a1a")
          }
        />
      )}

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
            onReply={onReply}
            channelName={channelName}
            channelDisplayName={channelDisplayName}
            streamTitle={streamTitle}
            streamGameName={streamGameName}
            isStreamLive={isStreamLive}
            streamUptime={streamUptime}
            viewerCount={viewerCount}
            hideViewerCount={hideViewerCount}
            onRefreshEmotes={onRefreshEmotes}
            isRefreshingEmotes={isRefreshingEmotes}
            onToggleSidebar={onToggleSidebar}
            sidebarVisible={sidebarVisible}
            onCopyMessage={onCopyMessage}
            showStreamEmbed={showStreamEmbed}
            onToggleStreamEmbed={onToggleStreamEmbed}
            currentUserDisplayName={currentUserDisplayName}
            fontSize={fontSize}
            chatFont={chatFont}
            splitChatEnabled={splitChatEnabled}
            isModerator={isModerator}
            modModeActive={modModeActive}
            onToggleModMode={onToggleModMode}
            onUpdateTitle={onUpdateTitle}
            onUpdateCategory={onUpdateCategory}
            onSearchCategories={onSearchCategories}
            compactActions={compactActions}
            onDeleteMessage={onDeleteMessage}
            onBanUser={onBanUser}
            onTimeoutUser={onTimeoutUser}
            onUntimeoutUser={onUntimeoutUser}
            onWarnUser={onWarnUser}
            ignoredUsers={ignoredUsers}
            ytMessages={ytMessages}
          />
        </div>

        <MessageInput
          onSendMessage={onSendMessage}
          isLoading={isLoading}
          isConnected={{ twitch: twitchConnected }}
          replyingTo={replyingTo}
          onCancelReply={onCancelReply}
          chatMessages={messages}
          currentUsername={currentUsername}
          onInputFocus={onInputFocus}
          slowModeWaitTime={safeSlowMode}
          followerModeMinutes={safeFollowerMode}
          isFollowing={safeIsFollowing}
          isModerator={isModerator}
          channelName={channelName}
        />
      </div>

      {/* Dragging overlay to prevent iframe focus issues */}
      {isDraggingChatSplit && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            cursor: "row-resize",
            background: "transparent",
          }}
        />
      )}
    </>
  );
}
