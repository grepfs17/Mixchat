import { useCallback, type RefObject } from "react";
import ChatDisplay from "./display";
import UnifiedInput, { type UnifiedInputHandle } from "./shared/UnifiedInput";
import MessageInput, { type MessageInputHandle } from "./shared/MessageInput";
import YouTubeChat from "./shared/YouTubeChat";
import UnifiedChat from "./unified";
import SplitLayout from "./SplitLayout";
import type { ChatAppState, ChatAppStateProps } from "../../hooks/chat/useChatAppState";
import type { ChatFont, TwitchMessage } from "../../lib/types";
import { MAX_DISPLAYED_MESSAGES } from "../../lib/types";
import type { YTMessage } from "./unified/types";

export interface YtConnectionState {
  connected: boolean;
  loading: boolean;
  error: string | null;
  reconnecting: boolean;
}

/**
 * First-message marks are global; when the user picked channels in the
 * setting they only apply on those channels. An empty selection applies
 * everywhere.
 */
export function isFirstMessageChannelInScope(
  channelName: string | undefined,
  selectedChannels: string[],
): boolean {
  if (selectedChannels.length === 0) return true;
  const normalized = (channelName ?? "").trim().toLowerCase();
  return selectedChannels.some((c) => c.toLowerCase() === normalized);
}

function resolveChatAppSettings(appProps: ChatAppStateProps) {
  return {
    fontSize: appProps.fontSize ?? 14,
    chatFont: appProps.chatFont ?? ("inter" as ChatFont),
    splitChatEnabled: appProps.splitChatEnabled ?? false,
    showDeletedMessages: appProps.showDeletedMessages ?? true,
    maxDisplayedMessages:
      appProps.maxDisplayedMessages ?? MAX_DISPLAYED_MESSAGES,
    hideViewerCount: appProps.hideViewerCount ?? false,
    sidebarVisible: appProps.sidebarVisible ?? true,
    showStreamEmbed: appProps.showStreamEmbed ?? true,
    renderThirdPartyEmotesOnYoutube:
      appProps.renderThirdPartyEmotesOnYoutube ?? false,
    markFirstMessages: appProps.markFirstMessages ?? false,
    markFirstMessageChannels: appProps.markFirstMessageChannels ?? [],
    isOnOwnChannel: appProps.isOnOwnChannel ?? false,
  };
}

function shouldMarkFirstMessages(
  markFirstMessages: boolean,
  selectedChannels: string[],
  channelName: string | undefined,
): boolean {
  return (
    markFirstMessages &&
    isFirstMessageChannelInScope(channelName, selectedChannels)
  );
}

function getViewerUsername(
  session: { username?: string } | undefined,
): string {
  return session?.username ?? "";
}

function getViewerDisplayName(
  session: { displayName?: string } | undefined,
): string | undefined {
  return session?.displayName;
}

function getDisplayYoutubeMessages(
  isVodPlayback: boolean,
  ytMessages: YTMessage[],
  ytOptimisticMessages: YTMessage[],
  getYtMessageText: (message: YTMessage) => string,
): YTMessage[] {
  if (isVodPlayback) return [];

  const normalize = (value: string) =>
    value.normalize("NFKC").trim().toLowerCase();
  const pending = ytOptimisticMessages.filter((optimistic) => {
    const optimisticText = normalize(getYtMessageText(optimistic));
    const optimisticAuthor = normalize(optimistic.author);
    return !ytMessages.some((message) => {
      const messageText = normalize(getYtMessageText(message));
      if (optimistic.authorChannelId && message.authorChannelId) {
        return (
          message.authorChannelId === optimistic.authorChannelId &&
          messageText === optimisticText
        );
      }
      return (
        normalize(message.author) === optimisticAuthor &&
        messageText === optimisticText
      );
    });
  });

  return [...ytMessages, ...pending];
}

interface YoutubeChatDisplay {
  ytConnectionState: YtConnectionState | undefined;
  ytLoading: boolean;
  ytError: string | null;
  twitchConnected: boolean;
}

function getYoutubeChatDisplay(
  isVodPlayback: boolean,
  linkedYoutubeUrl: string | undefined,
  ytConnectionState: YtConnectionState,
  ytLoading: boolean,
  ytError: string | null,
  isTwitchChatConnected: boolean,
): YoutubeChatDisplay {
  if (isVodPlayback) {
    return {
      ytConnectionState: undefined,
      ytLoading: false,
      ytError: null,
      twitchConnected: true,
    };
  }
  return {
    ytConnectionState: linkedYoutubeUrl ? ytConnectionState : undefined,
    ytLoading,
    ytError,
    twitchConnected: isTwitchChatConnected,
  };
}

interface LiveChatInteractions {
  onReply?: (message: TwitchMessage) => void;
  onMentionUser?: (username: string) => void;
  streamUptime?: string;
}

function getLiveChatInteractions(
  isVodPlayback: boolean,
  onReply: (message: TwitchMessage) => void,
  onMentionUser: (username: string) => void,
  streamUptime: string | undefined,
): LiveChatInteractions {
  if (isVodPlayback) return {};
  return {
    onReply,
    onMentionUser,
    streamUptime,
  };
}

function shouldShowHiddenYoutubeChat(
  isVodPlayback: boolean,
  linkedYoutubeUrl: string | undefined,
  youtubeVideoId: string | null | undefined,
  showYoutubeSection: boolean,
): boolean {
  return (
    !isVodPlayback &&
    Boolean(linkedYoutubeUrl) &&
    Boolean(youtubeVideoId) &&
    showYoutubeSection
  );
}

function hasYoutubeInput(
  linkedYoutubeUrl: string | undefined,
  youtubeVideoId: string | null | undefined,
  youtubeSession: unknown,
): boolean {
  return Boolean(linkedYoutubeUrl && youtubeVideoId && youtubeSession);
}

function getUnifiedChannelName(channelName: string | undefined): string {
  return channelName ?? "";
}

interface ChatAppContentProps {
  state: ChatAppState;
  appProps: ChatAppStateProps;
  ytConnectionState: YtConnectionState;
  onYtConnectionChange: (state: YtConnectionState) => void;
  messageInputRef: RefObject<MessageInputHandle | null>;
  unifiedInputRef: RefObject<UnifiedInputHandle | null>;
  onMentionUser: (username: string) => void;
  onOpenModTools: () => void;
  onNotification: (
    message: string,
    type: "success" | "error" | "info",
  ) => void;
  showModTools: boolean;
}

export default function ChatAppContent(props: ChatAppContentProps) {
  return props.appProps.unifyChatEnabled ? (
    <UnifiedChatContent {...props} />
  ) : (
    <SplitChatContent {...props} />
  );
}

/**
 * Chat, header, and status data shared by the unified and split layouts. VOD
 * playback replaces live chat with the replay and hides live-only values.
 */
function deriveVodDisplay(
  state: Pick<
    ChatAppState,
    | "isVodPlayback"
    | "messages"
    | "isLoading"
    | "vodMessages"
    | "vodChatLoading"
    | "streamTitle"
    | "streamGameName"
    | "streamIsLive"
    | "vodTitle"
    | "vodGameName"
  >,
  viewerCount: number | null | undefined,
) {
  return {
    messages: state.isVodPlayback ? state.vodMessages : state.messages,
    loading: state.isVodPlayback ? state.vodChatLoading : state.isLoading,
    streamTitle: state.isVodPlayback ? state.vodTitle : state.streamTitle,
    streamGameName: state.isVodPlayback
      ? state.vodGameName
      : state.streamGameName,
    streamIsLive: state.isVodPlayback ? false : state.streamIsLive,
    viewerCount: state.isVodPlayback ? null : viewerCount,
  };
}

function UnifiedChatContent({
  state,
  appProps,
  ytConnectionState,
  onYtConnectionChange,
  unifiedInputRef,
  onMentionUser,
  onOpenModTools,
  onNotification,
  showModTools,
}: ChatAppContentProps) {
  const {
    linkedYoutubeUrl,
    selectedTwitchChannelName,
    selectedTwitchChannelDisplayName,
    youtubeSession,
    viewerCount,
    onToggleSidebar,
    onToggleStreamEmbed,
  } = appProps;
  const {
    fontSize,
    chatFont,
    splitChatEnabled,
    showDeletedMessages,
    maxDisplayedMessages,
    hideViewerCount,
    sidebarVisible,
    showStreamEmbed,
    renderThirdPartyEmotesOnYoutube,
    markFirstMessages,
    markFirstMessageChannels,
    isOnOwnChannel,
  } = resolveChatAppSettings(appProps);
  const {
    messages,
    isLoading,
    isTwitchChatConnected,
    isVodPlayback,
    vodChatError,
    downloadVod,
    downloadVodChat,
    selectedPlatforms,
    setReplyingTo,
    streamUptime,
    streamStartedAt,
    handleRefreshEmotes,
    isRefreshingEmotes,
    handleUpdateTitle,
    handleUpdateCategory,
    handleSearchCategories,
    ignoredUsers,
    ytMessages,
    ytOptimisticMessages,
    youtubeVideoId,
    ytVideos,
    selectYoutubeVideo,
    showYoutubeSection,
    handleYtMessages,
    markYtMessageDeleted,
    unifiedChatRef,
    getYtMessageText,
    ytLoading,
    ytError,
    handleSendMessage,
    replyingTo,
    handleYtOptimisticMessage,
    handleYtOptimisticFailed,
    slowModeWaitTime,
    followerModeMinutes,
    isFollowingChannelState,
  } = state;

  const handleReply = useCallback(
    (message: TwitchMessage) => setReplyingTo(message),
    [setReplyingTo],
  );

  const markFirstMessagesActive = shouldMarkFirstMessages(
    markFirstMessages,
    markFirstMessageChannels,
    selectedTwitchChannelName,
  );

  const display = deriveVodDisplay(state, viewerCount);
  const displayMessages = display.messages;
  const displayLoading = display.loading;
  const displayStreamTitle = display.streamTitle;
  const displayStreamGameName = display.streamGameName;
  const displayStreamIsLive = display.streamIsLive;
  const displayViewerCount = display.viewerCount;
  const displayYtMessages = getDisplayYoutubeMessages(
    isVodPlayback,
    ytMessages,
    ytOptimisticMessages,
    getYtMessageText,
  );
  const youtubeChatDisplay = getYoutubeChatDisplay(
    isVodPlayback,
    linkedYoutubeUrl,
    ytConnectionState,
    ytLoading,
    ytError,
    isTwitchChatConnected,
  );
  const interactions = getLiveChatInteractions(
    isVodPlayback,
    handleReply,
    onMentionUser,
    streamUptime,
  );
  const showHiddenYoutubeChat = shouldShowHiddenYoutubeChat(
    isVodPlayback,
    linkedYoutubeUrl,
    youtubeVideoId,
    showYoutubeSection,
  );
  const youtubeInputAvailable = hasYoutubeInput(
    linkedYoutubeUrl,
    youtubeVideoId,
    youtubeSession,
  );
  const unifiedChannelName = getUnifiedChannelName(selectedTwitchChannelName);
  const viewerUsername = getViewerUsername(appProps.twitchSession);
  const viewerDisplayName = getViewerDisplayName(appProps.twitchSession);

  return (
    <>
      {showHiddenYoutubeChat && youtubeVideoId && (
        <div style={{ display: "none" }} aria-hidden="true">
          <YouTubeChat
            videoId={youtubeVideoId}
            channel={selectedTwitchChannelName}
            authUserId={youtubeSession?.userId}
            onMessages={handleYtMessages}
            onMessageDeleted={markYtMessageDeleted}
            onConnectionChange={onYtConnectionChange}
            fontSize={fontSize}
            chatFont={chatFont}
            splitChatEnabled={splitChatEnabled}
            showDeletedMessages={true}
            renderThirdPartyEmotes={renderThirdPartyEmotesOnYoutube}
            enableLazyHistory={false}
          />
        </div>
      )}

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <ChatDisplay
          messages={displayMessages}
          isLoading={displayLoading}
          vodMode={isVodPlayback}
          vodError={vodChatError}
          onDownloadVod={downloadVod}
          onDownloadVodChat={downloadVodChat}
          selectedPlatforms={selectedPlatforms}
          onReply={interactions.onReply}
          onMentionUser={interactions.onMentionUser}
          channelName={selectedTwitchChannelName}
          channelDisplayName={selectedTwitchChannelDisplayName}
          streamTitle={displayStreamTitle}
          streamGameName={displayStreamGameName}
          isStreamLive={displayStreamIsLive}
          streamUptime={interactions.streamUptime}
          streamStartedAt={streamStartedAt}
          viewerCount={displayViewerCount}
          hideViewerCount={hideViewerCount}
          onRefreshEmotes={handleRefreshEmotes}
          isRefreshingEmotes={isRefreshingEmotes}
          onToggleSidebar={onToggleSidebar}
          sidebarVisible={sidebarVisible}
          onCopyMessage={() => onNotification("Message copied!", "success")}
          showStreamEmbed={showStreamEmbed}
          onToggleStreamEmbed={onToggleStreamEmbed}
          currentUserDisplayName={viewerDisplayName}
          fontSize={fontSize}
          chatFont={chatFont}
          splitChatEnabled={splitChatEnabled}
          onUpdateTitle={handleUpdateTitle}
          onUpdateCategory={handleUpdateCategory}
          onSearchCategories={handleSearchCategories}
          youtubeVideos={ytVideos}
          onSelectYoutubeVideo={selectYoutubeVideo}
          ignoredUsers={ignoredUsers}
          ytMessages={ytMessages}
          showModTools={showModTools}
          onOpenModTools={onOpenModTools}
          subscriptionStatuses={state.subscriptionStatuses}
          redemptionPubSubStatus={state.redemptionPubSubStatus}
          isOnOwnChannel={isOnOwnChannel}
          maxDisplayedMessages={maxDisplayedMessages}
          markFirstMessages={markFirstMessagesActive}
          unifiedChatSlot={
            <UnifiedChat
              ref={unifiedChatRef}
              twitchMessages={displayMessages}
              channelName={unifiedChannelName}
              ytMessages={displayYtMessages}
              ytConnectionState={youtubeChatDisplay.ytConnectionState}
              ytLoading={youtubeChatDisplay.ytLoading}
              ytError={youtubeChatDisplay.ytError}
              twitchConnected={youtubeChatDisplay.twitchConnected}
              onReply={interactions.onReply}
              onMentionUser={interactions.onMentionUser}
              onCopyMessage={() => onNotification("Message copied!", "success")}
              currentUserDisplayName={viewerDisplayName}
              fontSize={fontSize}
              chatFont={chatFont}
              splitChatEnabled={splitChatEnabled}
              ignoredUsers={ignoredUsers}
              showDeletedMessages={showDeletedMessages}
              maxDisplayedMessages={maxDisplayedMessages}
              renderThirdPartyEmotesOnYoutube={renderThirdPartyEmotesOnYoutube}
              markFirstMessages={markFirstMessagesActive}
              streamStartedAt={streamStartedAt}
            />
          }
        />
      </div>

      {!isVodPlayback && (
        <UnifiedInput
          ref={unifiedInputRef}
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(undefined)}
          chatMessages={messages}
          currentUsername={viewerUsername}
          onInputFocus={() => unifiedChatRef.current?.scrollToBottom()}
          slowModeWaitTime={slowModeWaitTime}
          followerModeMinutes={followerModeMinutes}
          isFollowing={isFollowingChannelState}
          channelName={selectedTwitchChannelName}
          youtubeVideoId={youtubeVideoId}
          ytChatMessages={ytMessages}
          onOptimisticYoutube={handleYtOptimisticMessage}
          onOptimisticYoutubeFailed={handleYtOptimisticFailed}
          youtubeAvailable={youtubeInputAvailable}
          emoteAutocompleteMode={appProps.emoteAutocompleteMode}
        />
      )}
    </>
  );
}

function SplitChatContent({
  state,
  appProps,
  onYtConnectionChange,
  messageInputRef,
  onMentionUser,
  onOpenModTools,
  onNotification,
  showModTools,
}: ChatAppContentProps) {
  const {
    linkedYoutubeUrl,
    selectedTwitchChannelName,
    selectedTwitchChannelDisplayName,
    twitchConnected,
    youtubeSession,
    useYoutubeEmbed = true,
    fontSize = 14,
    chatFont = "inter" as ChatFont,
    splitChatEnabled = false,
    showDeletedMessages = true,
    maxDisplayedMessages = MAX_DISPLAYED_MESSAGES,
    hideViewerCount = false,
    viewerCount,
    onToggleSidebar,
    sidebarVisible = true,
    showStreamEmbed = true,
    onToggleStreamEmbed,
    renderThirdPartyEmotesOnYoutube = false,
    markFirstMessages = false,
    markFirstMessageChannels = [],
  } = appProps;
  const {
    messages,
    isLoading,
    isTwitchChatConnected,
    isVodPlayback,
    vodChatError,
    downloadVod,
    downloadVodChat,
    selectedPlatforms,
    setReplyingTo,
    replyingTo,
    streamUptime,
    streamStartedAt,
    handleRefreshEmotes,
    isRefreshingEmotes,
    handleUpdateTitle,
    handleUpdateCategory,
    handleSearchCategories,
    ignoredUsers,
    ytMessages,
    ytOptimisticMessages,
    chatSplitRatio,
    isDraggingChatSplit,
    setIsDraggingChatSplit,
    youtubeVideoId,
    ytVideos,
    ytNotice,
    ytLoading,
    ytError,
    setManualVideoId,
    selectYoutubeVideo,
    setShowYoutubeSection,
    handleYtMessages,
    handleYtOptimisticMessage,
    handleYtOptimisticFailed,
    handleSendMessage,
    slowModeWaitTime,
    followerModeMinutes,
    isFollowingChannelState,
  } = state;

  const markFirstMessagesActive =
    markFirstMessages &&
    isFirstMessageChannelInScope(
      selectedTwitchChannelName,
      markFirstMessageChannels,
    );

  const display = deriveVodDisplay(state, viewerCount);
  const displayMessages = display.messages;
  const displayLoading = display.loading;
  const displayStreamTitle = display.streamTitle;
  const displayStreamGameName = display.streamGameName;
  const displayStreamIsLive = display.streamIsLive;
  const displayViewerCount = display.viewerCount;

  return (
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
              ref={state.chatDisplayRef}
              messages={displayMessages}
              isLoading={displayLoading}
              vodMode={isVodPlayback}
              vodError={vodChatError}
              onDownloadVod={downloadVod}
              onDownloadVodChat={downloadVodChat}
              twitchConnected={isVodPlayback || isTwitchChatConnected}
              selectedPlatforms={selectedPlatforms}
              onReply={
                isVodPlayback
                  ? undefined
                  : (message) => setReplyingTo(message)
              }
              onMentionUser={isVodPlayback ? undefined : onMentionUser}
              channelName={selectedTwitchChannelName}
              channelDisplayName={selectedTwitchChannelDisplayName}
              streamTitle={displayStreamTitle}
              streamGameName={displayStreamGameName}
              isStreamLive={displayStreamIsLive}
              streamUptime={isVodPlayback ? undefined : streamUptime}
              streamStartedAt={streamStartedAt}
              viewerCount={displayViewerCount}
              hideViewerCount={hideViewerCount}
              onRefreshEmotes={handleRefreshEmotes}
              isRefreshingEmotes={isRefreshingEmotes}
              onToggleSidebar={onToggleSidebar}
              sidebarVisible={sidebarVisible}
              onCopyMessage={() => onNotification("Message copied!", "success")}
              showStreamEmbed={showStreamEmbed}
              onToggleStreamEmbed={onToggleStreamEmbed}
              currentUserDisplayName={appProps.twitchSession?.displayName}
              fontSize={fontSize}
              chatFont={chatFont}
              splitChatEnabled={splitChatEnabled}
              onUpdateTitle={handleUpdateTitle}
              onUpdateCategory={handleUpdateCategory}
              onSearchCategories={handleSearchCategories}
              youtubeVideos={ytVideos}
              onSelectYoutubeVideo={selectYoutubeVideo}
              ignoredUsers={ignoredUsers}
              ytMessages={ytMessages}
              showModTools={showModTools}
              onOpenModTools={onOpenModTools}
              subscriptionStatuses={state.subscriptionStatuses}
              redemptionPubSubStatus={state.redemptionPubSubStatus}
              isOnOwnChannel={appProps.isOnOwnChannel ?? false}
              maxDisplayedMessages={maxDisplayedMessages}
              markFirstMessages={markFirstMessagesActive}
            />
          </div>
          {!isVodPlayback && (
            <MessageInput
              ref={messageInputRef}
              onSendMessage={handleSendMessage}
              isLoading={isLoading}
              isConnected={{ twitch: twitchConnected }}
              replyingTo={replyingTo}
              onCancelReply={() => setReplyingTo(undefined)}
              chatMessages={messages}
              currentUsername={appProps.twitchSession?.username || ""}
              onInputFocus={() =>
                state.chatDisplayRef.current?.scrollToBottom()
              }
              slowModeWaitTime={slowModeWaitTime}
              followerModeMinutes={followerModeMinutes}
              isFollowing={isFollowingChannelState}
              channelName={selectedTwitchChannelName}
              emoteAutocompleteMode={appProps.emoteAutocompleteMode}
            />
          )}
        </div>
      }
      linkedYoutubeUrl={linkedYoutubeUrl}
      showYoutubeSection={isVodPlayback ? false : state.showYoutubeSection}
      chatSplitRatio={chatSplitRatio}
      isDraggingChatSplit={isDraggingChatSplit}
      onSetIsDraggingChatSplit={setIsDraggingChatSplit}
      youtubeVideoId={youtubeVideoId}
      ytNotice={ytNotice}
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
      showDeletedMessages={showDeletedMessages}
      onYtMessages={handleYtMessages}
      youtubeSession={youtubeSession}
      onOptimisticMessage={handleYtOptimisticMessage}
      onOptimisticFailed={handleYtOptimisticFailed}
      onShowError={(message) => onNotification(message, "error")}
      onYtConnectionChange={onYtConnectionChange}
      channelName={selectedTwitchChannelName}
      renderThirdPartyEmotesOnYoutube={renderThirdPartyEmotesOnYoutube}
      markFirstMessages={markFirstMessagesActive}
      streamStartedAt={streamStartedAt}
    />
  );
}
