import React, { useState, useEffect, useMemo, memo } from 'react';
import { MdStars, MdAutorenew, MdCardGiftcard, MdRefresh, MdReply, MdContentCopy, MdRedeem } from 'react-icons/md';
import { GiHeartBeats } from 'react-icons/gi';
import { FaUsers } from 'react-icons/fa';
import type { ChatMessage, Platform } from '../lib/types';
import { parseMessageWithEmotes } from '../lib/emotes';

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
  /** When provided (unified chat mode), renders this instead of the normal messages area */
  unifiedChatSlot?: React.ReactNode;
}

function ChatDisplay({
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
  unifiedChatSlot,
}: ChatDisplayProps) {
  const [filteredMessages, setFilteredMessages] = useState<ChatMessage[]>([]);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [newMessagesCount, setNewMessagesCount] = useState(0);
  const [previousMessageCount, setPreviousMessageCount] = useState(0);
  const messagesContainerRef = React.useRef<HTMLDivElement>(null);
  const authorColorById = useMemo(() => {
    const map = new Map<string, string>();
    messages.forEach((message) => {
      if (message.authorColor) {
        map.set(message.id, message.authorColor);
      }
    });
    return map;
  }, [messages]);

  useEffect(() => {
    let filtered = messages;

    if (selectedPlatforms.length === 0) {
      setFilteredMessages(filtered);
    } else {
      filtered = filtered.filter((msg) => selectedPlatforms.includes(msg.platform));
      setFilteredMessages(filtered);
    }

    // Update new messages count when not at bottom
    if (!isAtBottom) {
      const newCount = filtered.length - previousMessageCount;
      if (newCount > 0) {
        setNewMessagesCount(newCount);
      }
    }
  }, [messages, selectedPlatforms, isAtBottom, previousMessageCount]);

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

  // Handle emote tooltip on hover
  useEffect(() => {
    const handleEmoteHover = (e: Event) => {
      const target = e.target as HTMLImageElement;

      if (!target.classList.contains('chat-emote')) return;

      if (e.type === 'mouseenter') {
        const tooltipUrl = target.getAttribute('data-tooltip-url');
        const emoteName = target.getAttribute('data-emote-name') || 'Emote';

        if (tooltipUrl) {
          const tooltip = document.createElement('div');
          tooltip.className = 'chat-emote-tooltip';
          tooltip.id = 'emote-tooltip';

          const img = document.createElement('img');
          img.src = tooltipUrl;
          img.alt = emoteName;
          tooltip.appendChild(img);

          const nameDiv = document.createElement('div');
          nameDiv.className = 'chat-emote-tooltip-name';
          nameDiv.textContent = emoteName;
          tooltip.appendChild(nameDiv);

          document.body.appendChild(tooltip);

          // Position tooltip near the mouse
          const rect = target.getBoundingClientRect();
          tooltip.style.left = (rect.left + window.scrollX) + 'px';
          tooltip.style.top = (rect.top + window.scrollY - tooltip.offsetHeight - 10) + 'px';
        }
      } else if (e.type === 'mouseleave') {
        const tooltip = document.getElementById('emote-tooltip');
        if (tooltip) {
          tooltip.remove();
        }
      }
    };

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
  }, []);


  // Helper to render message icon for special events
  const renderMessageIcon = (msg: ChatMessage) => {
    if (!msg.messageType) return null;

    const iconConfig: Record<string, { title: string; color: string }> = {
      cheer: { title: 'Cheer', color: '#FFB700' },
      subscription: { title: 'Subscription', color: '#9147FF' },
      resub: { title: 'Resub', color: '#9147FF' },
      subgift: { title: 'Subgift', color: '#9147FF' },
      redemption: { title: 'Channel Points Redemption', color: '#9147FF' },
    };

    const config = iconConfig[msg.messageType];
    if (!config) return null;

    let iconElement;
    switch (msg.messageType) {
      case 'cheer':
        iconElement = <GiHeartBeats size={16} />;
        break;
      case 'subscription':
        iconElement = <MdStars size={16} />;
        break;
      case 'resub':
        iconElement = <MdAutorenew size={16} />;
        break;
      case 'subgift':
        iconElement = <MdCardGiftcard size={16} />;
        break;
      case 'redemption':
        iconElement = <MdRedeem size={16} />;
        break;
      default:
        return null;
    }

    return (
      <span
        title={config.title}
        style={{
          marginRight: '6px',
          display: 'inline-flex',
          alignItems: 'center',
          color: config.color,
          filter: `drop-shadow(0 0 2px ${config.color})`,
        }}
      >
        {iconElement}
      </span>
    );
  };

  // Helper to render badges
  const renderBadges = (msg: ChatMessage) => {
    // Prefer detailed badge info if available (contains titles/descriptions)
    if (msg.badgeDetails && Object.keys(msg.badgeDetails).length > 0) {
      return (
        <div className="message-badges" style={{ display: 'flex', alignItems: 'center', marginRight: '4px', gap: '2px' }}>
          {Object.entries(msg.badgeDetails).map(([name, detail]) => (
            <img
              key={name}
              src={detail.url}
              alt={detail.title}
              className="badge"
              title={detail.title}
              loading="eager"
              style={{
                width: '18px',
                height: '18px',
                verticalAlign: 'middle'
              }}
            />
          ))}
        </div>
      );
    }

    // Fallback for platform-agnostic or historical badges
    if (!msg.badges || Object.keys(msg.badges).length === 0) return null;

    return (
      <div className="message-badges" style={{ display: 'flex', alignItems: 'center', marginRight: '4px', gap: '2px' }}>
        {Object.entries(msg.badges).map(([name, badgeUrl]) => {
          if (!badgeUrl) return null;

          return (
            <img
              key={`${name}`}
              src={badgeUrl}
              alt={name}
              className="badge"
              title={name}
              loading="eager"
              style={{
                width: '18px',
                height: '18px',
                verticalAlign: 'middle'
              }}
            />
          );
        })}
      </div>
    );
  };

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
              {sidebarVisible ? '◀' : '▶'}
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
                LIVE
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
          style={{ '--chat-font-size': `${fontSize}px` } as React.CSSProperties}
        >
          {filteredMessages.length === 0 ? (
            <div className="no-messages">
              <p>No messages yet. Start chatting!</p>
            </div>
          ) : (
            filteredMessages.map((msg) => {
              const isMentioned = currentUserDisplayName && msg.content.includes(currentUserDisplayName);
              const messageClasses = [
                'message',
                msg.messageType || 'chat',
                msg.isPreloaded ? 'preloaded' : '',
                msg.isBot ? 'bot' : '',
                ((msg.mentionsUser || isMentioned) && !msg.isBot) ? 'mention' : ''
              ].filter(Boolean).join(' ');

              return (
                <div key={msg.id} className={messageClasses}>
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
                  <div className="message-single-line">
                    <span className="timestamp">
                      {msg.timestamp.toLocaleTimeString()}
                    </span>
                    {msg.authorAvatar && (
                      <img
                        src={msg.authorAvatar}
                        alt={msg.author}
                        className="avatar"
                      />
                    )}
                    {renderMessageIcon(msg)}
                    {renderBadges(msg)}
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
                        onClick={() => {
                          if (navigator.clipboard) {
                            navigator.clipboard.writeText(msg.content).then(() => {
                              onCopyMessage?.();
                            }).catch((err) => {
                              console.error('Failed to copy:', err);
                            });
                          } else {
                            // Fallback for environments without clipboard API
                            const textArea = document.createElement('textarea');
                            textArea.value = msg.content;
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
                        }}
                        className="action-button"
                        title="Copy message"
                        style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <MdContentCopy size={12} />
                      </button>
                    </div>
                  </div>
                </div>
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
    </div>
  );
}

export default memo(ChatDisplay);
