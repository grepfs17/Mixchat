import type { RefObject } from "react";
import ChatDisplay from "./display";
import UnifiedInput, { type UnifiedInputHandle } from "./shared/UnifiedInput";
import MessageInput, { type MessageInputHandle } from "./shared/MessageInput";
import YouTubeChat from "./shared/YouTubeChat";
import UnifiedChat from "./unified";
import SplitLayout from "./SplitLayout";
import type { ChatAppState, ChatAppStateProps } from "../../hooks/chat/useChatAppState";
import type { ChatFont } from "../../lib/types";
import { MAX_DISPLAYED_MESSAGES } from "../../lib/types";

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
    vodMessages,
    vodChatLoading,
    vodChatError,
    vodTitle,
    vodGameName,
    downloadVodChat,
    selectedPlatforms,
    setReplyingTo,
    streamTitle,
    streamGameName,
    streamIsLive,
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

  const markFirstMessagesActive =
    markFirstMessages &&
    isFirstMessageChannelInScope(
      selectedTwitchChannelName,
      markFirstMessageChannels,
    );

  const displayMessages = isVodPlayback ? vodMessages : messages;
  const displayLoading = isVodPlayback ? vodChatLoading : isLoading;
  const displayStreamTitle = isVodPlayback ? vodTitle : streamTitle;
  const displayStreamGameName = isVodPlayback ? vodGameName : streamGameName;
  const displayStreamIsLive = isVodPlayback ? false : streamIsLive;
  const displayViewerCount = isVodPlayback ? null : viewerCount;
  const displayYtMessages = isVodPlayback
    ? []
    : [
        ...ytMessages,
        ...ytOptimisticMessages.filter((opt) => {
          const norm = (s: string) => s.normalize("NFKC").trim().toLowerCase();
          const optText = norm(getYtMessageText(opt));
          const optAuthor = norm(opt.author);

          return !ytMessages.some((message) => {
            const messageText = norm(getYtMessageText(message));
            if (opt.authorChannelId && message.authorChannelId) {
              return (
                message.authorChannelId === opt.authorChannelId &&
                messageText === optText
              );
            }
            return (
              norm(message.author) === optAuthor && messageText === optText
            );
          });
        }),
      ];

  return (
    <>
      {!isVodPlayback &&
        linkedYoutubeUrl &&
        youtubeVideoId &&
        showYoutubeSection && (
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
          onDownloadVodChat={downloadVodChat}
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
          ignoredUsers={ignoredUsers}
          ytMessages={ytMessages}
          showModTools={showModTools}
          onOpenModTools={onOpenModTools}
          subscriptionStatuses={state.subscriptionStatuses}
          redemptionPubSubStatus={state.redemptionPubSubStatus}
          isOnOwnChannel={appProps.isOnOwnChannel ?? false}
          maxDisplayedMessages={maxDisplayedMessages}
          markFirstMessages={markFirstMessagesActive}
          unifiedChatSlot={
            <UnifiedChat
              ref={unifiedChatRef}
              twitchMessages={displayMessages}
              channelName={selectedTwitchChannelName || ""}
              ytMessages={displayYtMessages}
              ytConnectionState={
                !isVodPlayback && linkedYoutubeUrl
                  ? ytConnectionState
                  : undefined
              }
              ytLoading={!isVodPlayback && ytLoading}
              ytError={isVodPlayback ? null : ytError}
              twitchConnected={isVodPlayback || isTwitchChatConnected}
              onReply={isVodPlayback ? undefined : setReplyingTo}
              onMentionUser={isVodPlayback ? undefined : onMentionUser}
              onCopyMessage={() => onNotification("Message copied!", "success")}
              currentUserDisplayName={appProps.twitchSession?.displayName}
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
          currentUsername={appProps.twitchSession?.username || ""}
          onInputFocus={() => unifiedChatRef.current?.scrollToBottom()}
          slowModeWaitTime={slowModeWaitTime}
          followerModeMinutes={followerModeMinutes}
          isFollowing={isFollowingChannelState}
          channelName={selectedTwitchChannelName}
          youtubeVideoId={youtubeVideoId}
          ytChatMessages={ytMessages}
          onOptimisticYoutube={handleYtOptimisticMessage}
          onOptimisticYoutubeFailed={handleYtOptimisticFailed}
          youtubeAvailable={Boolean(
            linkedYoutubeUrl && youtubeVideoId && youtubeSession,
          )}
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
    vodMessages,
    vodChatLoading,
    vodChatError,
    vodTitle,
    vodGameName,
    downloadVodChat,
    selectedPlatforms,
    setReplyingTo,
    replyingTo,
    streamTitle,
    streamGameName,
    streamIsLive,
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
    ytLoading,
    ytError,
    setManualVideoId,
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

  const displayMessages = isVodPlayback ? vodMessages : messages;
  const displayLoading = isVodPlayback ? vodChatLoading : isLoading;
  const displayStreamTitle = isVodPlayback ? vodTitle : streamTitle;
  const displayStreamGameName = isVodPlayback ? vodGameName : streamGameName;
  const displayStreamIsLive = isVodPlayback ? false : streamIsLive;
  const displayViewerCount = isVodPlayback ? null : viewerCount;

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
