import React, { useState, useEffect, useMemo, memo, useCallback, useImperativeHandle, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { MdRefresh, MdReply, MdContentCopy, MdDelete, MdHourglassEmpty, MdBlock, MdWarning } from 'react-icons/md';
import { FaUsers, FaBars, FaTimes } from 'react-icons/fa';
import { GiCrossedSwords } from 'react-icons/gi';
import type { ChatMessage, Platform, ChatFont } from '../lib/types';
import { FONT_FAMILY_MAP } from '../lib/types';
import { parseMessageWithEmotes } from '../lib/emotes';
import MessageBadges from './MessageBadges';
import TwitchEventIcon from './TwitchEventIcon';
import { EVENT_CONFIG } from './TwitchEventIcon';
import { useChatTouchGestures } from '../hooks/useChatTouchGestures';

interface ChatDisplayProps {
  messages: ChatMessage[];
  isLoading: boolean;
  selectedPlatforms: Platform[];
  onReply?: (message: ChatMessage) => void;
  channelName?: string;
  channelDisplayName?: string;
  streamTitle?: string;
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
  /** When provided (unified chat mode), renders this instead of the normal messages area */
  unifiedChatSlot?: React.ReactNode;
  isModerator?: boolean;
  modModeActive?: boolean;
  onToggleModMode?: () => void;
  onDeleteMessage?: (messageId: string) => void;
  onBanUser?: (userId: string, displayName?: string) => void;
  onTimeoutUser?: (userId: string, seconds: number, displayName?: string) => void;
  onUntimeoutUser?: (userName: string) => void;
  onWarnUser?: (userName: string) => void;
  compactActions?: boolean;
  splitChatEnabled?: boolean;
}

/** Derives a stable, visually-distinct HSL color from a channel ID string. */
function hashChannelColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  const hue = ((hash >>> 0) % 360);
  return `hsl(${hue}, 80%, 60%)`;
}

export interface ChatDisplayHandle {
  scrollToBottom: () => void;
}

const ChatDisplay = forwardRef<ChatDisplayHandle, ChatDisplayProps>(function ChatDisplay({
  messages,
  isLoading,
  selectedPlatforms,
  onReply,
  channelName,
  channelDisplayName,
  streamTitle,
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
  chatFont = 'inter' as ChatFont,
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
}: ChatDisplayProps, ref: React.ForwardedRef<ChatDisplayHandle>) {
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [newMessagesCount, setNewMessagesCount] = useState(0);
  const [previousMessageCount, setPreviousMessageCount] = useState(0);
  const [emoteTooltip, setEmoteTooltip] = useState<{ url: string; name: string; x: number; y: number } | null>(null);
  const [timeoutMenu, setTimeoutMenu] = useState<{ x: number; y: number; userId: string; username: string } | null>(null);
  const [messageMenu, setMessageMenu] = useState<{ x: number; y: number; message: ChatMessage } | null>(null);
  const messagesContainerRef = React.useRef<HTMLDivElement>(null);

  // Close timeout menu when clicking anywhere else
  useEffect(() => {
    const handleClick = () => setTimeoutMenu(null);
    if (timeoutMenu) {
      window.addEventListener('click', handleClick);
      window.addEventListener('contextmenu', handleClick);
    }
    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('contextmenu', handleClick);
    };
  }, [timeoutMenu]);

  useEffect(() => {
    const handleClick = () => setMessageMenu(null);
    if (messageMenu) {
      window.addEventListener('click', handleClick);
      window.addEventListener('contextmenu', handleClick);
    }
    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('contextmenu', handleClick);
    };
  }, [messageMenu]);

  useImperativeHandle(ref, () => ({
    scrollToBottom: () => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        setIsAtBottom(true);
        setNewMessagesCount(0);
      }
    },
  }));

  const authorColorById = useMemo(() => {
    const map = new Map<string, string>();
    messages.forEach((message) => {
      if (message.authorColor) {
        map.set(message.id, message.authorColor);
      }
    });
    return map;
  }, [messages]);

  // Derive filtered messages synchronously — avoids a wasted re-render from setState
  const filteredMessages = useMemo(() => {
    let filtered = messages;

    // Remove optimistic placeholders when a matching real server message exists.
    filtered = filtered.filter((msg, _, arr) => {
      if (!msg.optimistic) return true;

      // If there's a non-optimistic message with same content, reply target,
      // and userId, prefer the real one and drop this optimistic placeholder.
      const hasReal = arr.some((other) =>
        other !== msg &&
        !other.optimistic &&
        other.isCurrentUser &&
        other.userId === msg.userId &&
        other.content === msg.content &&
        ((other.replyTo?.id || '') === (msg.replyTo?.id || ''))
      );

      return !hasReal;
    });

    if (selectedPlatforms.length > 0) {
      filtered = filtered.filter((msg) => selectedPlatforms.includes(msg.platform));
    }

    return filtered;
  }, [messages, selectedPlatforms]);

  // Update new-messages badge when user is scrolled away from bottom
  useEffect(() => {
    if (!isAtBottom) {
      const newCount = filteredMessages.length - previousMessageCount;
      if (newCount > 0) {
        setNewMessagesCount(newCount);
      }
    }
  }, [filteredMessages.length, isAtBottom, previousMessageCount]);

  // Auto-scroll to bottom when messages change (only if user is at bottom)
  useEffect(() => {
    if (messagesContainerRef.current && isAtBottom) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [filteredMessages, isAtBottom]);

  // Track scroll position
  useEffect(() => {
    const handleScroll = () => {
      if (messagesContainerRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
        // Consider user at bottom if within 50px of bottom
        const atBottom = scrollHeight - scrollTop - clientHeight < 50;
        setIsAtBottom(atBottom);

        // Reset new messages count when user scrolls back to bottom
        if (atBottom) {
          setNewMessagesCount(0);
          setPreviousMessageCount(filteredMessages.length);
        }
      }
    };

    const container = messagesContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [filteredMessages.length]);

  // Handle emote tooltip on hover via React state (no direct DOM manipulation)
  const handleEmoteHover = useCallback((e: Event) => {
    const target = e.target as HTMLImageElement;
    if (!target.classList.contains('chat-emote')) return;

    if (e.type === 'mouseenter') {
      const tooltipUrl = target.getAttribute('data-tooltip-url');
      const emoteName = target.getAttribute('data-emote-name') || 'Emote';
      if (tooltipUrl) {
        const rect = target.getBoundingClientRect();
        setEmoteTooltip({ url: tooltipUrl, name: emoteName, x: rect.left, y: rect.top });
      }
    } else if (e.type === 'mouseleave') {
      setEmoteTooltip(null);
    }
  }, []);

  useEffect(() => {
    const messagesContainer = messagesContainerRef.current;
    if (messagesContainer) {
      messagesContainer.addEventListener('mouseenter', handleEmoteHover, true);
      messagesContainer.addEventListener('mouseleave', handleEmoteHover, true);
    }
    return () => {
      if (messagesContainer) {
        messagesContainer.removeEventListener('mouseenter', handleEmoteHover, true);
        messagesContainer.removeEventListener('mouseleave', handleEmoteHover, true);
      }
    };
  }, [handleEmoteHover]);

  const { handleTouchStart, handleTouchEnd, handleTouchMove, handleCopy } = useChatTouchGestures<ChatMessage>({
    onReply,
    onLongPress: (msg) => setMessageMenu({ x: window.innerWidth / 2, y: window.innerHeight / 2, message: msg }),
    onCopyMessage,
    getContent: (msg) => msg.content,
  });

  const scrollToMessage = useCallback((targetId: string) => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(targetId)}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('message-highlight');
    setTimeout(() => el.classList.remove('message-highlight'), 2000);
  }, []);






  return (
    <div className="chat-display">
      <div className="chat-header">
        <div className="chat-header-content">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="sidebar-toggle-button"
              title={sidebarVisible ? 'Hide sidebar' : 'Show sidebar'}
            >
              {sidebarVisible ? <FaTimes /> : <FaBars />}
            </button>
          )}
          {!showStreamEmbed && onToggleStreamEmbed && (
            <button
              onClick={onToggleStreamEmbed}
              className="show-stream-button"
              title="Show stream embed"
            >
              Show Stream
            </button>
          )}
          <h2>
            {isStreamLive ? (
              <span className="status-badge-live">
                <span className="status-dot pulse" />
                <span className="status-badge-live-text">LIVE</span>
              </span>
            ) : (
              <span className="status-badge-offline">
                <span className="status-dot" />
                <span className="status-badge-offline-text">OFFLINE</span>
              </span>
            )}
            <a
              href={`https://twitch.tv/${channelName}`}
              target="_blank"
              rel="noopener noreferrer"
              className="channel-link"
            >
              {channelDisplayName || channelName || 'Chat'}
            </a>
            {viewerCount !== undefined && viewerCount !== null && (
              <span className="viewer-count-display">
                <FaUsers size={14} /> {viewerCount.toLocaleString()}
              </span>
            )}
            {streamUptime && isStreamLive && (
              <span className="uptime-display">
                ({streamUptime})
              </span>
            )}
          </h2>
          {streamTitle && <span className="stream-title">{streamTitle}</span>}
        </div>
        <div className="chat-header-actions">
          {onRefreshEmotes && (
            <button
              onClick={onRefreshEmotes}
              disabled={isRefreshingEmotes}
              className="header-button"
              title={isRefreshingEmotes ? 'Reloading emotes...' : 'Reload all emotes (clears cache)'}
            >
              <MdRefresh size={14} style={{ animation: isRefreshingEmotes ? 'spin 1s linear infinite' : 'none' }} />
              <span className="header-button-label">{isRefreshingEmotes ? 'Reloading...' : 'Reload Emotes'}</span>
            </button>
          )}
          {isModerator && (
            <button
              onClick={onToggleModMode}
              className={`header-button ${modModeActive ? 'mod-active' : ''}`}
              title={modModeActive ? 'Disable Mod Mode' : 'Enable Mod Mode'}
            >
              <GiCrossedSwords
                size={16}
                className="mod-icon"
                style={{ color: modModeActive ? 'var(--color-green)' : 'var(--color-text-muted)' }}
              />
              <span className="mod-label">Mod Mode</span>
            </button>
          )}
          {isLoading && <span className="loading-indicator">●</span>}
        </div>
      </div>

      {unifiedChatSlot ? (
        unifiedChatSlot
      ) : (
        <div
          className={`messages-container${splitChatEnabled ? ' split-chat' : ''}`}
          ref={messagesContainerRef}
          style={{ '--chat-font-size': `${fontSize}px`, '--chat-font-family': FONT_FAMILY_MAP[chatFont] } as React.CSSProperties}
        >
          {filteredMessages.length === 0 ? (
            <div className="no-messages">
              <p>No messages yet. Start chatting!</p>
            </div>
          ) : (
            filteredMessages.map((msg, index) => {
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

              return (
                <React.Fragment key={msg.id}>
                  {isFirstLive && <div className="live-start-marker"><span>Live</span></div>}
                  <div
                    className={messageClasses}
                    data-message-id={msg.id}
                    style={(() => {
                      const cfg = msg.messageType ? EVENT_CONFIG[msg.messageType] : undefined;
                      return cfg ? { '--event-color': cfg.color, '--event-bg': cfg.bg } as React.CSSProperties : undefined;
                    })()}
                    onTouchStart={() => handleTouchStart(msg)}
                    onTouchEnd={() => handleTouchEnd(msg)}
                    onTouchMove={handleTouchMove}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMessageMenu({ x: e.clientX, y: e.clientY, message: msg });
                    }}
                  >
                    {msg.replyTo && (
                      <div
                        className="reply-info reply-info-clickable"
                        onClick={() => scrollToMessage(msg.replyTo!.id)}
                        title="Jump to original message"
                      >
                        <span>response to{' '}
                          <span
                            style={{
                              color: authorColorById.get(msg.replyTo.id) || '#94a3b8',
                            }}
                          >
                            @{msg.replyTo.author}
                          </span>
                          {msg.replyTo.content && (
                            <>
                              {': '}
                              <span
                                className="reply-target-content"
                                dangerouslySetInnerHTML={{
                                  __html: parseMessageWithEmotes(msg.replyTo.content)
                                }}
                              />
                            </>
                          )}
                        </span>

                      </div>
                    )}
                    <TwitchEventIcon messageType={msg.messageType} rewardTitle={msg.rewardTitle} />
                    <div className="message-single-line">
                      <span className="timestamp">
                        {msg.timestamp.toLocaleTimeString()}
                      </span>
                      {msg.sourceChannelId && (
                        <span
                          className="shared-chat-source"
                          title={`From ${msg.sourceChannelLogin ?? msg.sourceChannelLogin}'s chat (Shared Chat)`}
                          style={{ display: 'inline-flex', alignItems: 'center', marginRight: '2px', position: 'relative', flexShrink: 0 }}
                        >
                          {(() => {
                            const channelColor = hashChannelColor(msg.sourceChannelId!);
                            return msg.sourceChannelAvatar ? (
                              <img
                                src={msg.sourceChannelAvatar}
                                alt={msg.sourceChannelLogin ?? msg.sourceChannelId}
                                style={{
                                  width: '22px',
                                  height: '22px',
                                  borderRadius: '50%',
                                  border: `1.5px solid ${channelColor}`,
                                  verticalAlign: 'middle',
                                  display: 'block',
                                }}
                              />
                            ) : (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: '16px',
                                  height: '16px',
                                  borderRadius: '50%',
                                  border: `2px solid ${channelColor}`,
                                  background: '#18181b',
                                  fontSize: '9px',
                                  color: channelColor,
                                  fontWeight: 'bold',
                                  flexShrink: 0,
                                }}
                              >
                                {(msg.sourceChannelLogin ?? msg.sourceChannelId!).charAt(0).toUpperCase()}
                              </span>
                            );
                          })()}
                        </span>
                      )}

                      {/*msg.authorAvatar && (
                      <img
                        src={msg.authorAvatar}
                        alt={msg.author}
                        className="avatar"
                      />
                    )*/}
                      {msg.messageType === 'redemption' && msg.rewardTitle && (
                        <span className="reward-title-badge">{msg.rewardTitle}</span>
                      )}
                      <MessageBadges badgeDetails={msg.badgeDetails} badges={msg.badges} />
                      <a
                        href={`https://twitch.tv/${msg.author}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`author author-link ${msg.isCurrentUser ? 'self' : ''}`}
                        style={{
                          color: msg.isCurrentUser ? '#ffffff' : (msg.authorColor || '#e2e8f0'),
                        }}
                      >
                        {msg.author}
                      </a>
                      <span className="message-separator">:</span>
                      <span
                        className="message-text"
                        dangerouslySetInnerHTML={{
                          __html: parseMessageWithEmotes(msg.content, msg.emotes),
                        }}
                      />
                      {!compactActions && (
                        <div className="message-actions">
                        {(msg.messageType === 'timeout' || msg.messageType === 'ban') ? (
                          isModerator && msg.targetUsername ? (
                            <button
                              onClick={() => onUntimeoutUser?.(msg.targetUsername!)}
                              className="action-button mod-action"
                              title="Undo moderation action"
                              style={{ display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid currentColor', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', marginTop: '2px' }}
                            >
                              Undo
                            </button>
                          ) : null
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
                              onClick={() => handleCopy(msg)}
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
                                        <button
                                          onClick={() => onTimeoutUser?.(msg.userId || '', 600, msg.author)}
                                          onContextMenu={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setTimeoutMenu({
                                              x: e.clientX,
                                              y: e.clientY,
                                              userId: msg.userId || '',
                                              username: msg.author
                                            });
                                          }}
                                          className="action-button mod-action"
                                          title="Timeout (10m) - Right-click for more"
                                          style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                                        >
                                          <MdHourglassEmpty size={12} />
                                        </button>
                                      )}
                                      {!isUnmoderatable && (
                                        <button
                                          onClick={() => onBanUser?.(msg.userId || '', msg.author)}
                                          className="action-button mod-action"
                                          title="Ban user"
                                          style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                                        >
                                          <MdBlock size={12} />
                                        </button>
                                      )}
                                      {!isUnmoderatable && (
                                        <button
                                          onClick={() => onWarnUser?.(msg.author)}
                                          className="action-button mod-action"
                                          title="Warn user"
                                          style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                                        >
                                          <MdWarning size={12} />
                                        </button>
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
                        <div className="deleted-notice">
                          Deleted by a moderator
                        </div>
                      )}
                    </div>
                  </div>
                </React.Fragment>
              );
            })
          )}
        </div>
      )}
      {!isAtBottom && !unifiedChatSlot && (
        <button
          onClick={() => {
            if (messagesContainerRef.current) {
              messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
              setIsAtBottom(true);
              setNewMessagesCount(0);
              setPreviousMessageCount(filteredMessages.length);
            }
          }}
          className="go-to-bottom-button"
          title="Go to latest messages"
        >
          {newMessagesCount > 0 ? `New Messages (${newMessagesCount})` : 'New Messages'}
        </button>
      )}
      {emoteTooltip ? createPortal(
        <div
          className="chat-emote-tooltip"
          style={{
            position: 'fixed',
            left: emoteTooltip.x,
            top: emoteTooltip.y,
            transform: 'translateY(-100%) translateY(-10px)',
            zIndex: 9999,
            pointerEvents: 'none',
          }}
        >
          <img src={emoteTooltip.url} alt={emoteTooltip.name} />
          <div className="chat-emote-tooltip-name">{emoteTooltip.name}</div>
        </div>,
        document.body
      ) : null}
      {timeoutMenu && createPortal(
        <div
          className="mod-context-menu"
          onContextMenu={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: timeoutMenu.y,
            right: window.innerWidth - timeoutMenu.x,
            left: 'auto',
            zIndex: 9999,
          }}
        >
          <div className="mod-context-menu-header">Timeout {timeoutMenu.username}</div>
          <button onClick={() => { onTimeoutUser?.(timeoutMenu.userId, 10, timeoutMenu.username); setTimeoutMenu(null); }}>
            10 Seconds
          </button>
          <button onClick={() => { onTimeoutUser?.(timeoutMenu.userId, 600, timeoutMenu.username); setTimeoutMenu(null); }}>
            10 Minutes
          </button>
          <button onClick={() => { onTimeoutUser?.(timeoutMenu.userId, 86400, timeoutMenu.username); setTimeoutMenu(null); }}>
            1 Day
          </button>
        </div>,
        document.body
      )
      }
      {messageMenu && createPortal(
        <div
          className="context-menu message-context-menu"
          onContextMenu={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: messageMenu.y, left: messageMenu.x, zIndex: 9999 }}
        >
          <div className="context-menu-header">@{messageMenu.message.author}</div>
          {/* Build menu items programmatically so we can sort when compactActions is enabled */}
          {
            (() => {
              const items: Array<{ key: string; label: string; onClick: () => void } > = [];
              if (onReply) items.push({ key: 'reply', label: 'Reply', onClick: () => { onReply(messageMenu.message); setMessageMenu(null); } });
              items.push({ key: 'copy', label: 'Copy message', onClick: () => { handleCopy(messageMenu.message); setMessageMenu(null); } });

              if (isModerator && modModeActive) {
                const isBroadcaster = Boolean(messageMenu.message.badges && messageMenu.message.badges['broadcaster']);
                const isModeratorMsg = Boolean(messageMenu.message.badges && messageMenu.message.badges['moderator']);
                const isUnmoderatable = isBroadcaster || isModeratorMsg || messageMenu.message.isCurrentUser;
                if (!isUnmoderatable) {
                  items.push({ key: 'delete', label: 'Delete', onClick: () => { onDeleteMessage?.(messageMenu.message.id); setMessageMenu(null); } });
                  items.push({ key: 'timeout', label: 'Timeout (10m)', onClick: () => { onTimeoutUser?.(messageMenu.message.userId || '', 600, messageMenu.message.author); setMessageMenu(null); } });
                  items.push({ key: 'ban', label: 'Ban', onClick: () => { onBanUser?.(messageMenu.message.userId || '', messageMenu.message.author); setMessageMenu(null); } });
                  items.push({ key: 'warn', label: 'Warn', onClick: () => { onWarnUser?.(messageMenu.message.author); setMessageMenu(null); } });
                }
              }

              if (compactActions) {
                items.sort((a, b) => a.label.localeCompare(b.label));
              }

              return items.map((it) => (
                <button key={it.key} onClick={it.onClick} className="context-menu-item">{it.label}</button>
              ));
            })()
          }
        </div>,
        document.body,
      )}
    </div >
  );
});

export default memo(ChatDisplay);
