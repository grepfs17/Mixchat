import ChatDisplay from './display';
import MobileTouchHintModal from './shared/MobileTouchHintModal';
import MessageInput from './shared/MessageInput';
import Notification from './shared/Notification';
import YouTubeChat from './shared/YouTubeChat';
import YouTubeMessageInput from './shared/YouTubeMessageInput';
import UnifiedChat from './unified';
import RaidNotification from './shared/RaidNotification';
import SplitLayout from './SplitLayout';
import { useChatAppState, type ChatAppStateProps } from '../../hooks/useChatAppState';
import type { ChatFont, ChatTheme } from '../../lib/types';

export default function ChatApp(props: ChatAppStateProps) {
  const {
    messages,
    isLoading,
    pendingRaid,
    setPendingRaid,
    isRefreshingEmotes,
    selectedPlatforms,
    replyingTo,
    streamIsLive,
    streamUptime,
    streamTitle,
    streamGameName,
    streamGameId,
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
    isFollowingChannelState,
    setReplyingTo,
    setShowYoutubeSection,
    setIsDraggingChatSplit,
    setManualVideoId,
    setNotification,
    handleSendMessage,
    handleRefreshEmotes,
    handleToggleModMode,
    handleDelete,
    handleBan,
    handleTimeout,
    handleUntimeout,
    handleWarn,
    handleUpdateTitle,
    handleUpdateCategory,
    handleSearchCategories,
    handleYtMessages,
    handleYtOptimisticMessage,
    handleYtOptimisticFailed,
    getYtMessageText,
    slowModeWaitTime,
    followerModeMinutes,
  } = useChatAppState(props);

  const {
    twitchConnected,
    selectedTwitchChannelName,
    selectedTwitchChannelDisplayName,
    twitchSession,
    linkedYoutubeUrl,
    youtubeSession,
    unifyChatEnabled,
    useYoutubeEmbed = true,
    fontSize = 14,
    chatFont = 'inter' as ChatFont,
    splitChatEnabled = false,
    hideViewerCount = false,
    compactActions = false,
    chatTheme = 'default' as ChatTheme,
    viewerCount,
    onToggleSidebar,
    sidebarVisible = true,
    showStreamEmbed = true,
    onToggleStreamEmbed,
    onFollowRaid,
  } = props;

  const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
    // This is handled internally by the hook; exposed here for any direct UI needs
    setNotification({ message, type });
  };

  return (
    <div data-chat-app-container style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
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
          onFollowRaid={() => {
            onFollowRaid?.(pendingRaid.targetLogin);
            setPendingRaid(null);
          }}
          onDismiss={() => setPendingRaid(null)}
        />
      )}

      {/* UNIFIED CHAT MODE */}
      {unifyChatEnabled ? (
        <>
          {/* Hidden YouTubeChat to keep polling YouTube messages */}
          {linkedYoutubeUrl && youtubeVideoId && (
            <div style={{ display: 'none' }} aria-hidden="true">
              <YouTubeChat
                videoId={youtubeVideoId}
                onMessages={handleYtMessages}
                fontSize={fontSize}
                chatFont={chatFont}
                splitChatEnabled={splitChatEnabled}
              />
            </div>
          )}

          {/* Twitch ChatDisplay header + unified messages body */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
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
                showNotification('Message copied!', 'success');
              }}
              showStreamEmbed={showStreamEmbed}
              onToggleStreamEmbed={onToggleStreamEmbed}
              currentUserDisplayName={twitchSession?.displayName}
              fontSize={fontSize}
              chatFont={chatFont}
              splitChatEnabled={splitChatEnabled}
              isModerator={isModerator}
              modModeActive={modModeActive}
              onToggleModMode={handleToggleModMode}
              onUpdateTitle={handleUpdateTitle}
              onUpdateCategory={handleUpdateCategory}
              onSearchCategories={handleSearchCategories}
              /* Override messages area with UnifiedChat */
              unifiedChatSlot={
                <UnifiedChat
                  ref={unifiedChatRef}
                  twitchMessages={messages}
                  ytMessages={[
                    ...ytMessages,
                    ...ytOptimisticMessages.filter((opt) => {
                      const norm = (s: string) => s.normalize('NFKC').trim().toLowerCase();
                      const optText = norm(getYtMessageText(opt));
                      const optAuthor = norm(opt.author);

                      return !ytMessages.some((m) => {
                        const mText = norm(getYtMessageText(m));
                        if (opt.authorChannelId && m.authorChannelId) {
                          return m.authorChannelId === opt.authorChannelId && mText === optText;
                        }
                        return norm(m.author) === optAuthor && mText === optText;
                      });
                    }),
                  ]}
                  onReply={setReplyingTo}
                  onCopyMessage={() => {
                    showNotification('Message copied!', 'success');
                  }}
                  currentUserDisplayName={twitchSession?.displayName}
                  fontSize={fontSize}
                  chatFont={chatFont}
                  splitChatEnabled={splitChatEnabled}
                  isModerator={isModerator}
                  compactActions={compactActions}
                  modModeActive={modModeActive}
                  onDeleteMessage={handleDelete}
                  onBanUser={handleBan}
                  onTimeoutUser={handleTimeout}
                  onUntimeoutUser={handleUntimeout}
                  onWarnUser={handleWarn}
                />
              }
            />
          </div>

          {/* Twitch message input */}
          <MessageInput
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
            isConnected={{ twitch: twitchConnected }}
            replyingTo={replyingTo}
            onCancelReply={() => setReplyingTo(undefined)}
            chatMessages={messages}
            currentUsername={twitchSession?.username || ''}
            onInputFocus={() => unifiedChatRef.current?.scrollToBottom()}
            slowModeWaitTime={slowModeWaitTime}
            followerModeMinutes={followerModeMinutes}
            isFollowing={isFollowingChannelState}
            isModerator={isModerator}
          />

          {/* YouTube message input (when we have a live video). Hidden when using the official embed. */}
          {linkedYoutubeUrl && youtubeVideoId && !useYoutubeEmbed && (
            <div style={{ borderTop: '1px solid #333' }}>
              {youtubeSession ? (
                <YouTubeMessageInput
                  youtubeVideoId={youtubeVideoId}
                  chatMessages={ytMessages}
                  onOptimisticMessage={handleYtOptimisticMessage}
                  onOptimisticFailed={handleYtOptimisticFailed}
                  onError={(msg) => {
                    showNotification(msg, 'error');
                  }}
                />
              ) : (
                <div style={{ padding: '8px 12px', fontSize: '12px', color: '#aaa', textAlign: 'center', backgroundColor: '#0f0f0f' }}>
                  <button
                    onClick={() => (document.querySelector<HTMLElement>('.login-btn.youtube-btn') as HTMLElement | null)?.click()}
                    style={{ color: '#ff6b6b', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 'inherit' }}
                  >Login with YouTube</button> to send messages
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <SplitLayout
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
          onShowError={(msg) => showNotification(msg, 'error')}
          chatDisplayRef={chatDisplayRef}
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
          onCopyMessage={() => showNotification('Message copied!', 'success')}
          showStreamEmbed={showStreamEmbed}
          onToggleStreamEmbed={onToggleStreamEmbed}
          currentUserDisplayName={twitchSession?.displayName}
          isModerator={isModerator}
          modModeActive={modModeActive}
          onToggleModMode={handleToggleModMode}
          onUpdateTitle={handleUpdateTitle}
          onUpdateCategory={handleUpdateCategory}
          onSearchCategories={handleSearchCategories}
          compactActions={compactActions}
          onDeleteMessage={handleDelete}
          onBanUser={handleBan}
          onTimeoutUser={handleTimeout}
          onUntimeoutUser={handleUntimeout}
          onWarnUser={handleWarn}
          onSendMessage={handleSendMessage}
          twitchConnected={twitchConnected}
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(undefined)}
          currentUsername={twitchSession?.username || ''}
          onInputFocus={() => chatDisplayRef.current?.scrollToBottom()}
          slowModeWaitTime={slowModeWaitTime}
          followerModeMinutes={followerModeMinutes}
          isFollowing={isFollowingChannelState}
        />
      )}
      <MobileTouchHintModal twitchConnected={twitchConnected} />
      {chatTheme === 'mushu' && (
        <>
          <img src="/themes/Mushu/mushu.webp" alt="Mushu" className="mushu-theme-mascot" />
          <img src="/themes/Mushu/mushuKnife.webp" alt="Mushu Knife" className="mushu-theme-knife" />
        </>
      )}
      {chatTheme === 'lunita' && (
        <>
          <img src="/themes/Lunita/lunateDrama.webp" alt="Lunita Drama" className="lunita-theme-drama" />
          <img src="/themes/Lunita/lunateLurk.webp" alt="Lunita Lurk" className="lunita-theme-lurk" />
        </>
      )}
    </div>
  );
}
