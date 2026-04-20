import React, { useEffect, useRef, useState, memo, useImperativeHandle, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { MdReply, MdContentCopy } from 'react-icons/md';
import { MdDelete, MdHourglassEmpty, MdBlock, MdWarning } from 'react-icons/md';
import { FaTwitch, FaYoutube } from 'react-icons/fa';
import type { ChatMessage, ChatFont } from '../lib/types';
import { FONT_FAMILY_MAP } from '../lib/types';
import { parseMessageWithEmotes } from '../lib/emotes';
import { getColorFromName } from '../lib/chatColors';
import MessageBadges from './MessageBadges';
import TwitchEventIcon from './TwitchEventIcon';
import YTMessageParts from './YTMessageParts';
import { useChatTouchGestures } from '../hooks/useChatTouchGestures';


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
    optimistic?: boolean;
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

interface UnifiedChatProps {
    twitchMessages: ChatMessage[];
    ytMessages: YTMessage[];
    onReply?: (message: ChatMessage) => void;
    onCopyMessage?: () => void;
    currentUserDisplayName?: string;
    fontSize?: number;
    chatFont?: ChatFont;
    isModerator?: boolean;
    modModeActive?: boolean;
    onToggleModMode?: () => void;
    onDeleteMessage?: (messageId: string) => void;
    onBanUser?: (userId: string, displayName?: string) => void;
    onTimeoutUser?: (userId: string, seconds: number, displayName?: string) => void;
    onUntimeoutUser?: (userName: string) => void;
    onWarnUser?: (userName: string) => void;
}

const MAX_MESSAGES = 300;

// Small platform icon rendered before the username
function PlatformTag({ source }: { source: 'twitch' | 'youtube' }) {
    return (
        <span
            title={source === 'twitch' ? 'Twitch' : 'YouTube'}
            className={`platform-tag ${source}`}
        >
            {source === 'twitch' ? <FaTwitch size={12} /> : <FaYoutube size={12} />}
        </span>
    );
}

export interface UnifiedChatHandle {
    scrollToBottom: () => void;
}

const UnifiedChat = forwardRef<UnifiedChatHandle, UnifiedChatProps>(function UnifiedChat({
    twitchMessages,
    ytMessages,
    onReply,
    onCopyMessage,
    currentUserDisplayName,
    fontSize = 14,
    chatFont = 'inter' as ChatFont,
    isModerator = false,
    modModeActive = false,
    onDeleteMessage,
    onBanUser,
    onTimeoutUser,
    onUntimeoutUser,
    onWarnUser,
}: UnifiedChatProps, ref: React.ForwardedRef<UnifiedChatHandle>) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isAtBottom, setIsAtBottom] = useState(true);
    const [newMessagesCount, setNewMessagesCount] = useState(0);
    const prevCountRef = useRef(0);
    const [emoteTooltip, setEmoteTooltip] = useState<{ url: string; name: string; x: number; y: number } | null>(null);
    const [timeoutMenu, setTimeoutMenu] = useState<{ x: number; y: number; userId: string; username: string } | null>(null);

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

    useImperativeHandle(ref, () => ({
        scrollToBottom: () => {
            if (containerRef.current) {
                containerRef.current.scrollTop = containerRef.current.scrollHeight;
                setIsAtBottom(true);
                setNewMessagesCount(0);
            }
        },
    }));

    // Merge Twitch and YouTube messages into one list sorted by time
    const entries: UnifiedEntry[] = React.useMemo(() => {
        const tw: UnifiedEntry[] = twitchMessages.map((m) => ({ source: 'twitch' as const, msg: m }));
        const yt: UnifiedEntry[] = ytMessages.map((m) => ({ source: 'youtube' as const, msg: m }));
        const merged = [...tw, ...yt].sort((a, b) => getTime(a) - getTime(b));
        return merged.length > MAX_MESSAGES ? merged.slice(-MAX_MESSAGES) : merged;
    }, [twitchMessages, ytMessages]);

    // Auto-scroll to bottom when new messages arrive (only if already at bottom)
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

    // Increment new-messages badge when user is scrolled away
    useEffect(() => {
        if (!isAtBottom) {
            const diff = entries.length - prevCountRef.current;
            if (diff > 0) setNewMessagesCount((p) => p + diff);
        } else {
            prevCountRef.current = entries.length;
        }
    }, [entries.length, isAtBottom]);

    // Emote tooltip via React state + portal (consistent with ChatDisplay)
    useEffect(() => {
        const handleEmoteHover = (e: Event) => {
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
        };

        const el = containerRef.current;
        if (el) {
            el.addEventListener('mouseenter', handleEmoteHover, true);
            el.addEventListener('mouseleave', handleEmoteHover, true);
        }
        return () => {
            if (el) {
                el.removeEventListener('mouseenter', handleEmoteHover, true);
                el.removeEventListener('mouseleave', handleEmoteHover, true);
            }
        };
    }, []);
    const { handleTouchStart, handleTouchEnd, handleTouchMove } = useChatTouchGestures<UnifiedEntry>({
        onReply: onReply
            ? (entry) => { if (entry.source === 'twitch') onReply(entry.msg as ChatMessage); }
            : undefined,
        onCopyMessage,
        getContent: (entry) => {
            if (entry.source === 'twitch') return (entry.msg as ChatMessage).content;
            return (entry.msg as YTMessage).parts
                .map((p) => (p.type === 'text' ? (p.text ?? '') : (p.emojiText ?? p.alt ?? '')))
                .join('');
        },
        // Only Twitch messages support replies
        canReply: (entry) => entry.source === 'twitch',
    });
    return (
        <div className="unified-chat-wrapper">
            <div
                ref={containerRef}
                className="messages-container unified-messages-container"
                style={{ '--chat-font-size': `${fontSize}px`, '--chat-font-family': FONT_FAMILY_MAP[chatFont] } as React.CSSProperties}
            >
                {entries.length === 0 && (
                    <div className="no-messages">
                        <p>No messages yet. Start chatting!</p>
                    </div>
                )}

                {entries.map((entry, index) => {
                    if (entry.source === 'twitch') {
                        const msg = entry.msg as ChatMessage;
                        const isMentioned = currentUserDisplayName && msg.content.includes(currentUserDisplayName);
                        const prevEntry = index > 0 ? entries[index - 1] : null;
                        const prevWasPreloaded = prevEntry?.source === 'twitch' && (prevEntry.msg as ChatMessage).isPreloaded;
                        const isFirstLive = !msg.isPreloaded && prevWasPreloaded;
                        const messageClasses = [
                            'message',
                            msg.messageType,
                            msg.isPreloaded ? 'preloaded' : '',
                            msg.isDeleted ? 'deleted' : '',
                            msg.isBot ? 'bot' : '',
                            ((msg.mentionsUser || isMentioned) && !msg.isBot) ? 'mention' : ''
                        ].filter(Boolean).join(' ');

                        return (
                            <React.Fragment key={getKey(entry)}>
                                {isFirstLive && <div className="live-start-marker"><span>Live</span></div>}
                                <div
                                    className={messageClasses}
                                    onTouchStart={() => handleTouchStart(entry)}
                                    onTouchEnd={() => handleTouchEnd(entry)}
                                    onTouchMove={handleTouchMove}
                                >
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
                                        <TwitchEventIcon messageType={msg.messageType} size={14} />
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
                                            dangerouslySetInnerHTML={{ __html: parseMessageWithEmotes(msg.content, msg.emotes) }}
                                        />
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
                                                        onClick={() => {
                                                            if (navigator.clipboard) {
                                                                navigator.clipboard.writeText(msg.content).then(() => onCopyMessage?.()).catch(() => { });
                                                            }
                                                        }}
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
                                        {msg.isDeleted && (
                                            <div className="deleted-notice">
                                                Deleted by a moderator
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </React.Fragment>
                        );
                    }

                    // YouTube message
                    const msg = entry.msg as YTMessage;
                    if (msg.superchat) {
                        return (
                            <div key={getKey(entry)} className="yt-superchat" style={{ backgroundColor: msg.superchat.color }}
                                onTouchStart={() => handleTouchStart(entry)}
                                onTouchEnd={() => handleTouchEnd(entry)}
                                onTouchMove={handleTouchMove}
                            >
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
                                        <YTMessageParts parts={msg.parts} variant="unified" />
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
                        <div key={getKey(entry)} className={`message${msg.optimistic ? ' yt-optimistic' : ''}`}
                            onTouchStart={() => handleTouchStart(entry)}
                            onTouchEnd={() => handleTouchEnd(entry)}
                            onTouchMove={handleTouchMove}
                        >
                            <div className="message-single-line">
                                <span className="timestamp">
                                    {(msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp))
                                        .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                                <PlatformTag source="youtube" />
                                {msg.authorAvatar && (
                                    <img src={msg.authorAvatar} alt={msg.author} className="avatar" />
                                )}
                                <MessageBadges
                                    badges={msg.badges}
                                    style={{ marginRight: '4px' }}
                                    lazy
                                />
                                <span className="author" style={{ color: getColorFromName(msg.author) }}>
                                    {msg.author}
                                </span>
                                <span className="message-separator">:</span>
                                <span className="message-text">
                                    <YTMessageParts parts={msg.parts} variant="unified" />
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

            {/* Emote tooltip portal */}
            {emoteTooltip && createPortal(
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
            )}
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
            )}
        </div>
    );
});

export default memo(UnifiedChat);
