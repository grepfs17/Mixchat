import React, { useEffect, useRef, useState, useCallback, memo } from 'react';
import { MdStars, MdAutorenew, MdCardGiftcard, MdReply, MdContentCopy } from 'react-icons/md';
import { GiHeartBeats } from 'react-icons/gi';
import { FaTwitch, FaYoutube } from 'react-icons/fa';
import type { ChatMessage } from '../lib/types';
import { parseMessageWithEmotes } from '../lib/emotes';
import '../styles/UnifiedChat.css';

// YouTube message shape — mirrors what YouTubeChat.tsx uses internally
interface MessagePart {
    type: 'text' | 'emoji';
    text?: string;
    url?: string;
    alt?: string;
    emojiText?: string;
    isCustomEmoji?: boolean;
}

export interface YTMessage {
    id: string;
    author: string;
    authorAvatar?: string;
    badges?: Record<string, string>;
    parts: MessagePart[];
    timestamp: Date;
    authorChannelId?: string;
    superchat?: {
        amount: string;
        color: string;
        sticker?: {
            url: string;
            alt: string;
        };
    };
}

// A single entry in the merged list, tagged with its platform source
type UnifiedEntry =
    | { source: 'twitch'; msg: ChatMessage }
    | { source: 'youtube'; msg: YTMessage };

function getKey(e: UnifiedEntry) {
    return e.source + ':' + e.msg.id;
}

function getTime(e: UnifiedEntry) {
    return e.msg.timestamp instanceof Date
        ? e.msg.timestamp.getTime()
        : new Date(e.msg.timestamp).getTime();
}

// Generates a consistent color from a username, same algorithm used in YouTubeChat
function getColorFromName(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = ((hash << 5) - hash) + name.charCodeAt(i);
        hash = hash & hash;
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 55%)`;
}

interface UnifiedChatProps {
    twitchMessages: ChatMessage[];
    ytMessages: YTMessage[];
    onReply?: (message: ChatMessage) => void;
    onCopyMessage?: () => void;
    currentUserDisplayName?: string;
    fontSize?: number;
}

const MAX_MESSAGES = 300;

function UnifiedChat({
    twitchMessages,
    ytMessages,
    onReply,
    onCopyMessage,
    currentUserDisplayName,
    fontSize = 14,
}: UnifiedChatProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isAtBottom, setIsAtBottom] = useState(true);
    const [newMessagesCount, setNewMessagesCount] = useState(0);
    const prevCountRef = useRef(0);

    // Merge Twitch and YouTube messages into one list sorted by time
    const entries: UnifiedEntry[] = React.useMemo(() => {
        const tw: UnifiedEntry[] = twitchMessages.map((m) => ({ source: 'twitch' as const, msg: m }));
        const yt: UnifiedEntry[] = ytMessages.map((m) => ({ source: 'youtube' as const, msg: m }));
        const merged = [...tw, ...yt].sort((a, b) => getTime(a) - getTime(b));
        return merged.length > MAX_MESSAGES ? merged.slice(-MAX_MESSAGES) : merged;
    }, [twitchMessages, ytMessages]);

    // Scroll to the bottom whenever new messages arrive (only if already at bottom)
    useEffect(() => {
        if (containerRef.current && isAtBottom) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [entries, isAtBottom]);

    // Track whether the user has scrolled away from the bottom
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const handleScroll = () => {
            const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
            setIsAtBottom(atBottom);
            if (atBottom) {
                setNewMessagesCount(0);
                prevCountRef.current = entries.length;
            }
        };

        el.addEventListener('scroll', handleScroll);
        return () => el.removeEventListener('scroll', handleScroll);
    }, [entries.length]);

    useEffect(() => {
        if (!isAtBottom) {
            const diff = entries.length - prevCountRef.current;
            if (diff > 0) setNewMessagesCount((p) => p + diff);
        } else {
            prevCountRef.current = entries.length;
        }
    }, [entries.length, isAtBottom]);

    useEffect(() => {
        if (!isAtBottom) {
            const diff = entries.length - prevCountRef.current;
            if (diff > 0) setNewMessagesCount((p) => p + diff);
        } else {
            prevCountRef.current = entries.length;
        }
    }, [entries.length, isAtBottom]);

    // Handle emote tooltip on hover
    useEffect(() => {
        const handleEmoteHover = (e: Event) => {
            const target = e.target as HTMLImageElement;

            if (!target.classList.contains('chat-emote')) return;
            // console.log('Emote hovered:', target.getAttribute('data-emote-name'));

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

        const messagesContainer = containerRef.current;
        if (messagesContainer) {
            messagesContainer.addEventListener('mouseenter', handleEmoteHover, true);
            messagesContainer.addEventListener('mouseleave', handleEmoteHover, true);
        }

        return () => {
            if (messagesContainer) {
                messagesContainer.removeEventListener('mouseenter', handleEmoteHover, true);
                messagesContainer.removeEventListener('mouseleave', handleEmoteHover, true);
            }
            // Cleanup tooltip if it exists when component unmounts
            const tooltip = document.getElementById('emote-tooltip');
            if (tooltip) tooltip.remove();
        };
    }, []);

    // Small platform icon rendered before the username
    const PlatformTag = ({ source }: { source: 'twitch' | 'youtube' }) => (
        <span
            title={source === 'twitch' ? "Twitch" : "YouTube"}
            className={`platform-tag ${source}`}
        >
            {source === 'twitch' ? <FaTwitch size={12} /> : <FaYoutube size={12} />}
        </span>
    );

    // Helpers for Twitch-specific UI elements (event icons, badges)
    const renderTwitchIcon = (msg: ChatMessage) => {
        if (!msg.messageType) return null;
        const iconConfig: Record<string, { title: string; color: string }> = {
            cheer: { title: 'Cheer', color: '#FFB700' },
            subscription: { title: 'Subscription', color: '#9147FF' },
            resub: { title: 'Resub', color: '#9147FF' },
            subgift: { title: 'Subgift', color: '#9147FF' },
        };
        const cfg = iconConfig[msg.messageType];
        if (!cfg) return null;

        let icon;
        switch (msg.messageType) {
            case 'cheer': icon = <GiHeartBeats size={14} />; break;
            case 'subscription': icon = <MdStars size={14} />; break;
            case 'resub': icon = <MdAutorenew size={14} />; break;
            case 'subgift': icon = <MdCardGiftcard size={14} />; break;
            default: return null;
        }
        return (
            <span
                title={cfg.title}
                className="twitch-event-icon"
                style={{ color: cfg.color, filter: `drop-shadow(0 0 2px ${cfg.color})` }}
            >
                {icon}
            </span>
        );
    };

    const renderTwitchBadges = (msg: ChatMessage) => {
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
                {Object.entries(msg.badges).map(([name, url]) => {
                    if (!url) return null;
                    return (
                        <img key={name} src={url} alt={name} className="badge" title={name} loading="eager"
                            style={{ width: '18px', height: '18px', verticalAlign: 'middle' }} />
                    );
                })}
            </div>
        );
    };

    const renderYTBadges = (msg: YTMessage) => {
        if (!msg.badges || Object.keys(msg.badges).length === 0) return null;
        return (
            <div className="message-badges" style={{ display: 'flex', alignItems: 'center', marginRight: '4px', gap: '2px' }}>
                {Object.entries(msg.badges).map(([name, url]) => (
                    <img key={name} src={url} alt={name} className="badge" title={name}
                        style={{ width: '18px', height: '18px', verticalAlign: 'middle' }} />
                ))}
            </div>
        );
    };

    // Render the scrollable message list with an optional "new messages" button
    return (
        <div className="unified-chat-wrapper">
            <div
                ref={containerRef}
                className="messages-container unified-messages-container"
                style={{ '--chat-font-size': `${fontSize}px` } as React.CSSProperties}
            >
                {entries.length === 0 && (
                    <div className="no-messages">
                        <p>No messages yet. Start chatting!</p>
                    </div>
                )}

                {entries.map((entry) => {
                    if (entry.source === 'twitch') {
                        const msg = entry.msg as ChatMessage;
                        const isMentioned = currentUserDisplayName && msg.content.includes(currentUserDisplayName);
                        const messageClasses = [
                            'message',
                            msg.messageType,
                            msg.isPreloaded ? 'preloaded' : '',
                            msg.isBot ? 'bot' : '',
                            ((msg.mentionsUser || isMentioned) && !msg.isBot) ? 'mention' : ''
                        ].filter(Boolean).join(' ');


                        return (
                            <div key={getKey(entry)} className={messageClasses}>
                                {msg.replyTo && (
                                    <div className="reply-info">
                                        <span>
                                            response to{' '}
                                            <span style={{ color: '#94a3b8' }}>@{msg.replyTo.author}</span>
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
                                    <span className="timestamp">{msg.timestamp.toLocaleTimeString()}</span>
                                    <PlatformTag source="twitch" />
                                    {msg.authorAvatar && <img src={msg.authorAvatar} alt={msg.author} className="avatar" />}

                                    {renderTwitchIcon(msg)}
                                    {renderTwitchBadges(msg)}
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
                                        dangerouslySetInnerHTML={{ __html: parseMessageWithEmotes(msg.content, msg.emotes) }}
                                    />
                                    <div className="message-actions">
                                        {onReply && (
                                            <button onClick={() => onReply(msg)} className="action-button" title="Reply to this message" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <MdReply size={12} />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => {
                                                if (navigator.clipboard) {
                                                    navigator.clipboard.writeText(msg.content).then(() => onCopyMessage?.()).catch(() => { });
                                                }
                                            }}
                                            className="action-button" title="Copy message" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                                        >
                                            <MdContentCopy size={12} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    // YouTube message
                    const msg = entry.msg as YTMessage;
                    if (msg.superchat) {
                        return (
                            <div key={getKey(entry)} className="yt-superchat" style={{ backgroundColor: msg.superchat.color }}>
                                <div className="yt-superchat-header">
                                    {msg.authorAvatar && (
                                        <img src={msg.authorAvatar} alt={msg.author} className="avatar" />
                                    )}
                                    <div className="yt-superchat-info">
                                        <div className="yt-superchat-author">{msg.author}</div>
                                        <div className="yt-superchat-amount">{msg.superchat.amount}</div>
                                    </div>
                                </div>
                                {(msg.parts.length > 0 || msg.superchat.sticker) && (
                                    <div className="yt-superchat-body">
                                        {msg.parts.map((part, i) =>
                                            part.type === 'emoji' ? (
                                                <img
                                                    key={i}
                                                    src={part.url}
                                                    alt={part.alt || part.emojiText || '🙂'}
                                                    title={part.emojiText || part.alt}
                                                    className="chat-emote"
                                                    data-tooltip-url={part.url}
                                                    data-emote-name={part.alt || part.emojiText || 'Emoji'}
                                                    style={{
                                                        width: part.isCustomEmoji ? '28px' : '18px',
                                                        height: part.isCustomEmoji ? '28px' : '18px',
                                                        verticalAlign: 'middle',
                                                        margin: '0 1px',
                                                        objectFit: 'contain',
                                                        cursor: 'pointer',
                                                    }}
                                                />
                                            ) : (
                                                <React.Fragment key={i}>{part.text}</React.Fragment>
                                            )
                                        )}
                                        {msg.superchat.sticker && (
                                            <img
                                                src={msg.superchat.sticker.url}
                                                alt={msg.superchat.sticker.alt}
                                                className="yt-superchat-sticker"
                                                style={{ width: '72px', height: '72px', marginTop: '4px', objectFit: 'contain' }}
                                            />
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    }

                    return (
                        <div key={getKey(entry)} className="message">
                            <div className="message-single-line">
                                <span className="timestamp">
                                    {(msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp))
                                        .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                                <PlatformTag source="youtube" />
                                {msg.authorAvatar && (
                                    <img src={msg.authorAvatar} alt={msg.author} className="avatar" />
                                )}

                                {renderYTBadges(msg)}
                                <span className="author" style={{ color: getColorFromName(msg.author) }}>
                                    {msg.author}
                                </span>
                                <span className="message-separator">:</span>
                                <span className="message-text">
                                    {msg.parts.map((part, i) =>
                                        part.type === 'emoji' ? (
                                            <img
                                                key={i}
                                                src={part.url}
                                                alt={part.alt || part.emojiText || '🙂'}
                                                title={part.emojiText || part.alt}
                                                className="chat-emote"
                                                data-tooltip-url={part.url}
                                                data-emote-name={part.alt || part.emojiText || 'Emoji'}
                                                style={{
                                                    width: part.isCustomEmoji ? '28px' : '18px',
                                                    height: part.isCustomEmoji ? '28px' : '18px',
                                                    verticalAlign: 'middle',
                                                    margin: '0 1px',
                                                    objectFit: 'contain',
                                                    cursor: 'pointer',
                                                }}
                                            />
                                        ) : (
                                            <React.Fragment key={i}>{part.text}</React.Fragment>
                                        )
                                    )}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Scroll-to-bottom button */}
            {!isAtBottom && (
                <button
                    className="go-to-bottom-button"
                    title="Go to latest messages"
                    onClick={() => {
                        if (containerRef.current) {
                            containerRef.current.scrollTop = containerRef.current.scrollHeight;
                            setIsAtBottom(true);
                            setNewMessagesCount(0);
                            prevCountRef.current = entries.length;
                        }
                    }}
                >
                    {newMessagesCount > 0 ? `New Messages (${newMessagesCount})` : 'New Messages'}
                </button>
            )}
        </div>
    );

}

export default memo(UnifiedChat);
