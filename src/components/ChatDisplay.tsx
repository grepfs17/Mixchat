import React, { useState, useEffect, useMemo, memo, useCallback, useImperativeHandle, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { MdRefresh, MdReply, MdContentCopy } from 'react-icons/md';
import { FaUsers, FaBars, FaTimes } from 'react-icons/fa';
import type { ChatMessage, Platform, ChatFont } from '../lib/types';
import { FONT_FAMILY_MAP } from '../lib/types';
import { parseMessageWithEmotes } from '../lib/emotes';
import MessageBadges from './MessageBadges';
import TwitchEventIcon from './TwitchEventIcon';
import { EVENT_CONFIG } from './TwitchEventIcon';

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
}: ChatDisplayProps, ref: React.ForwardedRef<ChatDisplayHandle>) {
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [newMessagesCount, setNewMessagesCount] = useState(0);
  const [previousMessageCount, setPreviousMessageCount] = useState(0);
  const [emoteTooltip, setEmoteTooltip] = useState<{ url: string; name: string; x: number; y: number } | null>(null);
  const messagesContainerRef = React.useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    scrollToBottom: () => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        setIsAtBottom(true);
        setNewMessagesCount(0);
      }
    },
  }));

  const touchLongPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchLastTapTime = React.useRef<number>(0);
  const touchStartTime = React.useRef<number>(0);
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

  const copyMessage = useCallback((message: ChatMessage) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(message.content).then(() => {
        onCopyMessage?.();
      }).catch((err) => {
        console.error('Failed to copy:', err);
      });
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = message.content;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        onCopyMessage?.();
      } catch (err) {
        console.error('Failed to copy:', err);
      }
      document.body.removeChild(textArea);
    }
  }, [onCopyMessage]);

  const handleMessageTouchStart = useCallback((msg: ChatMessage) => {
    touchStartTime.current = Date.now();
    if (onReply) {
      touchLongPressTimer.current = setTimeout(() => {
        touchLongPressTimer.current = null;
        onReply(msg);
      }, 500);
    }
  }, [onReply]);

  const handleMessageTouchEnd = useCallback((msg: ChatMessage) => {
    const elapsed = Date.now() - touchStartTime.current;
    if (touchLongPressTimer.current) {
      clearTimeout(touchLongPressTimer.current);
      touchLongPressTimer.current = null;
    }
    if (elapsed < 250) {
      const now = Date.now();
      if (now - touchLastTapTime.current < 300) {
        copyMessage(msg);
        touchLastTapTime.current = 0;
      } else {
        touchLastTapTime.current = now;
      }
    }
  }, [copyMessage]);

  const handleMessageTouchMove = useCallback(() => {
    if (touchLongPressTimer.current) {
      clearTimeout(touchLongPressTimer.current);
      touchLongPressTimer.current = null;
    }
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
                OFFLINE
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
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <MdRefresh size={14} style={{ animation: isRefreshingEmotes ? 'spin 1s linear infinite' : 'none' }} />
              {isRefreshingEmotes ? 'Reloading...' : 'Reload Emotes'}
            </button>
          )}
          {isLoading && <span className="loading-indicator">●</span>}
        </div>
      </div>

      {unifiedChatSlot ? (
        unifiedChatSlot
      ) : (
        <div
          className="messages-container"
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
              const messageClasses = [
                'message',
                msg.messageType || 'chat',
                msg.isPreloaded ? 'preloaded' : '',
                msg.isDeleted ? 'deleted' : '',
                msg.isBot ? 'bot' : '',
                ((msg.mentionsUser || isMentioned) && !msg.isBot) ? 'mention' : ''
              ].filter(Boolean).join(' ');

              return (
                <React.Fragment key={msg.id}>
                {isFirstLive && <div className="live-start-marker"><span>Live</span></div>}
                <div
                  className={messageClasses}
                  style={(() => {
                    const cfg = msg.messageType ? EVENT_CONFIG[msg.messageType] : undefined;
                    return cfg ? { '--event-color': cfg.color, '--event-bg': cfg.bg } as React.CSSProperties : undefined;
                  })()}
                  onTouchStart={() => handleMessageTouchStart(msg)}
                  onTouchEnd={() => handleMessageTouchEnd(msg)}
                  onTouchMove={handleMessageTouchMove}
                >
                  {msg.replyTo && (
                    <div className="reply-info">
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
                    <div className="message-actions">
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
                        onClick={() => copyMessage(msg)}
                        className="action-button"
                        title="Copy message"
                        style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <MdContentCopy size={12} />
                      </button>
                    </div>
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
    </div>
  );
});

export default memo(ChatDisplay);
