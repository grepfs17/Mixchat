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
    twitchConnected,
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
  } = appProps;
  const {
    messages,
    isLoading,
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

  return (
    <>
      {linkedYoutubeUrl && youtubeVideoId && showYoutubeSection && (
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
          messages={messages}
          isLoading={isLoading}
          selectedPlatforms={selectedPlatforms}
          onReply={(message) => setReplyingTo(message)}
          onMentionUser={onMentionUser}
          channelName={selectedTwitchChannelName}
          channelDisplayName={selectedTwitchChannelDisplayName}
          streamTitle={streamTitle}
          streamGameName={streamGameName}
          isStreamLive={streamIsLive}
          streamUptime={streamUptime}
          streamStartedAt={streamStartedAt}
          viewerCount={viewerCount}
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

                  return !ytMessages.some((message) => {
                    const messageText = norm(getYtMessageText(message));
                    if (opt.authorChannelId && message.authorChannelId) {
                      return (
                        message.authorChannelId === opt.authorChannelId &&
                        messageText === optText
                      );
                    }
                    return norm(message.author) === optAuthor && messageText === optText;
                  });
                }),
              ]}
              ytConnectionState={linkedYoutubeUrl ? ytConnectionState : undefined}
              ytLoading={ytLoading}
              ytError={ytError}
              twitchConnected={twitchConnected}
              onReply={setReplyingTo}
              onMentionUser={onMentionUser}
              onCopyMessage={() => onNotification("Message copied!", "success")}
              currentUserDisplayName={appProps.twitchSession?.displayName}
              fontSize={fontSize}
              chatFont={chatFont}
              splitChatEnabled={splitChatEnabled}
              ignoredUsers={ignoredUsers}
              showDeletedMessages={showDeletedMessages}
              maxDisplayedMessages={maxDisplayedMessages}
              renderThirdPartyEmotesOnYoutube={renderThirdPartyEmotesOnYoutube}
            />
          }
        />
      </div>

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
        youtubeAvailable={Boolean(linkedYoutubeUrl && youtubeVideoId && youtubeSession)}
        emoteAutocompleteMode={appProps.emoteAutocompleteMode}
      />
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
  } = appProps;
  const {
    messages,
    isLoading,
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
              messages={messages}
              isLoading={isLoading}
              selectedPlatforms={selectedPlatforms}
              onReply={(message) => setReplyingTo(message)}
              onMentionUser={onMentionUser}
              channelName={selectedTwitchChannelName}
              channelDisplayName={selectedTwitchChannelDisplayName}
              streamTitle={streamTitle}
              streamGameName={streamGameName}
              isStreamLive={streamIsLive}
              streamUptime={streamUptime}
              streamStartedAt={streamStartedAt}
              viewerCount={viewerCount}
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
            />
          </div>
          <MessageInput
            ref={messageInputRef}
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
            isConnected={{ twitch: twitchConnected }}
            replyingTo={replyingTo}
            onCancelReply={() => setReplyingTo(undefined)}
            chatMessages={messages}
            currentUsername={appProps.twitchSession?.username || ""}
            onInputFocus={() => state.chatDisplayRef.current?.scrollToBottom()}
            slowModeWaitTime={slowModeWaitTime}
            followerModeMinutes={followerModeMinutes}
            isFollowing={isFollowingChannelState}
            channelName={selectedTwitchChannelName}
            emoteAutocompleteMode={appProps.emoteAutocompleteMode}
          />
        </div>
      }
      linkedYoutubeUrl={linkedYoutubeUrl}
      showYoutubeSection={state.showYoutubeSection}
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
    />
  );
}
