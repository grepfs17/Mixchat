import React, { memo } from 'react';
import { MdReply, MdContentCopy, MdDelete, MdHourglassEmpty, MdBlock, MdWarning } from 'react-icons/md';
import { parseMessageWithEmotes } from '../../../lib/emotes';
import { getReadableUsernameColor } from '../../../lib/chatColors';
import MessageBadges from '../../MessageBadges';
import TwitchEventIcon from '../../TwitchEventIcon';
import { EVENT_CONFIG } from '../../TwitchEventIcon';
import type { ChatMessage } from '../../../lib/types';

function hashChannelColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  const hue = ((hash >>> 0) % 360);
  return `hsl(${hue}, 80%, 60%)`;
}

interface ChatMessageItemProps {
  msg: ChatMessage;
  index: number;
  filteredMessages: ChatMessage[];
  authorColorById: Map<string, string>;
  currentUserDisplayName?: string;
  isModerator: boolean;
  modModeActive: boolean;
  compactActions: boolean;
  onReply?: (msg: ChatMessage) => void;
  onCopy: (msg: ChatMessage) => void;
  onDeleteMessage?: (id: string) => void;
  onBanUser?: (userId: string, displayName?: string) => void;
  onTimeoutUser?: (userId: string, seconds: number, displayName?: string) => void;
  onUntimeoutUser?: (userName: string) => void;
  onWarnUser?: (userName: string) => void;
  onUsernameClick?: (e: React.MouseEvent, author: string, avatar?: string) => void;
  onTimeoutMenu: (state: { x: number; y: number; userId: string; username: string }) => void;
  onScrollToMessage: (id: string) => void;
  onTouchStart: (msg: ChatMessage) => void;
  onTouchEnd: (msg: ChatMessage) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  fontSize?: number;
  onContextMenu: (e: React.MouseEvent, msg: ChatMessage) => void;
}

function ChatMessageItemBase({
  msg,
  index,
  filteredMessages,
  authorColorById,
  currentUserDisplayName,
  isModerator,
  modModeActive,
  compactActions,
  onReply,
  onCopy,
  onDeleteMessage,
  onBanUser,
  onTimeoutUser,
  onUntimeoutUser,
  onWarnUser,
  onUsernameClick,
  onTimeoutMenu,
  onScrollToMessage,
  onTouchStart,
  onTouchEnd,
  onTouchMove,
  onContextMenu,
}: ChatMessageItemProps) {
  const isMentioned = currentUserDisplayName && msg.content.includes(currentUserDisplayName);
  const isFirstLive = !msg.isPreloaded && index > 0 && filteredMessages[index - 1].isPreloaded;
  const parityClass = (index % 2 === 0) ? 'even' : 'odd';
  const messageClasses = [
    'message',
    msg.messageType || 'chat',
    msg.isPreloaded ? 'preloaded' : '',
    msg.isDeleted ? 'deleted' : '',
    msg.isBot ? 'bot' : '',
    ((msg.mentionsUser || isMentioned) && !msg.isBot) ? 'mention' : '',
    parityClass,
  ].filter(Boolean).join(' ');

  const eventStyle = (() => {
    const cfg = msg.messageType ? EVENT_CONFIG[msg.messageType] : undefined;
    return cfg ? { '--event-color': cfg.color, '--event-bg': cfg.bg } as React.CSSProperties : undefined;
  })();

  const handleCtx = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e, msg);
  };

  return (
    <React.Fragment key={msg.id}>
      {isFirstLive && <div className="live-start-marker"><span>Live</span></div>}
      <div
        className={messageClasses}
        data-message-id={msg.id}
        style={eventStyle}
        onTouchStart={() => onTouchStart(msg)}
        onTouchEnd={() => onTouchEnd(msg)}
        onTouchMove={onTouchMove}
        onContextMenu={handleCtx}
      >
        {msg.replyTo && (
          <div
            className="reply-info reply-info-clickable"
            onClick={() => onScrollToMessage(msg.replyTo!.id)}
            title="Jump to original message"
          >
            <span>response to{' '}
              <span style={{ color: getReadableUsernameColor(authorColorById.get(msg.replyTo.id)) || '#94a3b8' }}>
                @{msg.replyTo.author}
              </span>
              {msg.replyTo.content && (
                <>
                  {': '}
                  <span
                    className="reply-target-content"
                    dangerouslySetInnerHTML={{ __html: parseMessageWithEmotes(msg.replyTo.content) }}
                  />
                </>
              )}
            </span>
          </div>
        )}
        <TwitchEventIcon messageType={msg.messageType} rewardTitle={msg.rewardTitle} />
        <div className="message-single-line">
          <span className="timestamp">{msg.timestamp.toLocaleTimeString()}</span>
          {msg.sourceChannelId && (
            <span
              className="shared-chat-source"
              title={`From ${msg.sourceChannelLogin ?? msg.sourceChannelId}'s chat (Shared Chat)`}
              style={{ display: 'inline-flex', alignItems: 'center', marginRight: '2px', position: 'relative', flexShrink: 0 }}
            >
              {(() => {
                const channelColor = hashChannelColor(msg.sourceChannelId!);
                return msg.sourceChannelAvatar ? (
                  <img
                    src={msg.sourceChannelAvatar}
                    alt={msg.sourceChannelLogin ?? msg.sourceChannelId}
                    style={{
                      width: '22px', height: '22px', borderRadius: '50%',
                      border: `1.5px solid ${channelColor}`,
                      verticalAlign: 'middle', display: 'block',
                    }}
                  />
                ) : (
                  <span
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: '16px', height: '16px', borderRadius: '50%',
                      border: `2px solid ${channelColor}`, background: '#18181b',
                      fontSize: '9px', color: channelColor, fontWeight: 'bold', flexShrink: 0,
                    }}
                  >
                    {(msg.sourceChannelLogin ?? msg.sourceChannelId!).charAt(0).toUpperCase()}
                  </span>
                );
              })()}
            </span>
          )}
          {msg.messageType === 'redemption' && msg.rewardTitle && (
            <span className="reward-title-badge">
              {msg.rewardTitle}
              {typeof msg.rewardCost === 'number' ? ` (${msg.rewardCost})` : ''}
            </span>
          )}
          <MessageBadges badgeDetails={msg.badgeDetails} badges={msg.badges} />
          <a
            href={`https://twitch.tv/${msg.author}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`author author-link ${msg.isCurrentUser ? 'self' : ''}`}
            style={{ color: msg.isCurrentUser ? '#ffffff' : getReadableUsernameColor(msg.authorColor) }}
            onClick={(e) => onUsernameClick?.(e, msg.author, msg.authorAvatar)}
          >
            {msg.author}
          </a>
          <span className="message-separator">:</span>
          <span
            className="message-text"
            dangerouslySetInnerHTML={{ __html: parseMessageWithEmotes(msg.content, msg.emotes) }}
          />
          {!compactActions && (!msg.messageType || msg.messageType === 'chat' || ((msg.messageType === 'timeout' || msg.messageType === 'ban') && isModerator && msg.targetUsername)) && (
            <div className="message-actions">
              {(msg.messageType === 'timeout' || msg.messageType === 'ban') ? (
                <button
                  onClick={() => onUntimeoutUser?.(msg.targetUsername!)}
                  className="action-button mod-action"
                  title="Undo moderation action"
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid currentColor', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', marginTop: '2px' }}
                >
                  Undo
                </button>
              ) : (
                <>
                  {onReply && (
                    <button
                      onClick={() => onReply(msg)}
                      className="action-button"
                      title="Reply to this message"
                      style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <MdReply size={12} />
                    </button>
                  )}
                  <button
                    onClick={() => onCopy(msg)}
                    className="action-button"
                    title="Copy message"
                    style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <MdContentCopy size={12} />
                  </button>
                  {isModerator && modModeActive && (
                    <>
                      {(() => {
                        const isBroadcaster = Boolean(msg.badges && msg.badges['broadcaster']);
                        const isModeratorMsg = Boolean(msg.badges && msg.badges['moderator']);
                        const isUnmoderatable = isBroadcaster || isModeratorMsg || msg.isCurrentUser;
                        return (
                          <>
                            <button
                              onClick={() => onDeleteMessage?.(msg.id)}
                              className="action-button mod-action"
                              title="Delete message"
                              style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                              <MdDelete size={12} />
                            </button>
                            {!isUnmoderatable && (
                              <>
                                <button
                                  onClick={() => onTimeoutUser?.(msg.userId || '', 600, msg.author)}
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onTimeoutMenu({ x: e.clientX, y: e.clientY, userId: msg.userId || '', username: msg.author });
                                  }}
                                  className="action-button mod-action"
                                  title="Timeout (10m) - Right-click for more"
                                  style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                                >
                                  <MdHourglassEmpty size={12} />
                                </button>
                                <button
                                  onClick={() => onBanUser?.(msg.userId || '', msg.author)}
                                  className="action-button mod-action"
                                  title="Ban user"
                                  style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                                >
                                  <MdBlock size={12} />
                                </button>
                                <button
                                  onClick={() => onWarnUser?.(msg.author)}
                                  className="action-button mod-action"
                                  title="Warn user"
                                  style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                                >
                                  <MdWarning size={12} />
                                </button>
                              </>
                            )}
                          </>
                        );
                      })()}
                    </>
                  )}
                </>
              )}
            </div>
          )}
          {msg.isDeleted && (
            <div className="deleted-notice">Deleted by a moderator</div>
          )}
        </div>
      </div>
    </React.Fragment>
  );
}

const ChatMessageItem = memo(ChatMessageItemBase, (prev, next) => {
  return (
    prev.msg.id === next.msg.id &&
    prev.msg === next.msg &&
    prev.isModerator === next.isModerator &&
    prev.modModeActive === next.modModeActive &&
    prev.compactActions === next.compactActions &&
    prev.currentUserDisplayName === next.currentUserDisplayName
  );
});

export default ChatMessageItem;
