import { useEffect, useRef, useState, memo, useImperativeHandle, forwardRef, useCallback, useMemo } from 'react';
import type { ChatMessage, ChatFont, Platform } from '../../../lib/types';
import { FONT_FAMILY_MAP, MAX_DISPLAYED_MESSAGES } from '../../../lib/types';
import { useChatTouchGestures } from '../../../hooks/useChatTouchGestures';
import { useChatAutoScroll } from '../../../hooks/useChatAutoScroll';
import { TwitchMessageItem } from './TwitchMessageItem';
import { YouTubeMessageItem } from './YouTubeMessageItem';
import MessageMenu from '../shared/MessageMenu';
import TimeoutMenu from '../shared/TimeoutMenu';
import EmoteTooltip from '../shared/EmoteTooltip';
import ChatterHistoryOverlay from '../shared/ChatterHistoryOverlay';
import ScrollToBottomButton from '../shared/ScrollToBottomButton';
import type { UnifiedEntry, MessagePart, YTMessage } from './types';
import { getKey, getTime } from './types';

interface UnifiedChatProps {
    twitchMessages: ChatMessage[];
    ytMessages: YTMessage[];
    channelName: string;
    ytConnectionState?: { connected: boolean; loading: boolean; error: string | null };
    twitchConnected?: boolean;
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
    compactActions?: boolean;
    splitChatEnabled?: boolean;
    ignoredUsers?: string[];
}

export interface UnifiedChatHandle {
    scrollToBottom: () => void;
}

const UnifiedChat = forwardRef<UnifiedChatHandle, UnifiedChatProps>(function UnifiedChat({
    twitchMessages,
    ytMessages,
    channelName,
    ytConnectionState,
    twitchConnected,
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
    compactActions = false,
    splitChatEnabled = false,
    ignoredUsers = [],
}: UnifiedChatProps, ref: React.ForwardedRef<UnifiedChatHandle>) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [emoteTooltip, setEmoteTooltip] = useState<{ url: string; name: string; source: string; x: number; y: number } | null>(null);
    const [timeoutMenu, setTimeoutMenu] = useState<{ x: number; y: number; userId: string; username: string } | null>(null);
    const [messageMenu, setMessageMenu] = useState<{ x: number; y: number; entry: UnifiedEntry } | null>(null);
    const [chatterHistory, setChatterHistory] = useState<{ author: string; platform: Platform; authorAvatar?: string } | null>(null);

    const handleViewHistory = (author: string, platform: Platform = 'twitch', authorAvatar?: string) => {
        setChatterHistory({ author, platform, authorAvatar });
    };

    const handleUsernameClick = (e: React.MouseEvent, author: string, platform: Platform, authorAvatar?: string) => {
        e.preventDefault();
        e.stopPropagation();
        handleViewHistory(author, platform, authorAvatar);
    };

    // Close menus when clicking elsewhere
    useEffect(() => {
        const handleClick = () => { setTimeoutMenu(null); setMessageMenu(null); };
        if (timeoutMenu || messageMenu) {
            window.addEventListener('click', handleClick);
            window.addEventListener('contextmenu', handleClick);
        }
        return () => {
            window.removeEventListener('click', handleClick);
            window.removeEventListener('contextmenu', handleClick);
        };
    }, [timeoutMenu, messageMenu]);

    const ignoredSet = useMemo(() => new Set(ignoredUsers.map((u) => u.toLowerCase())), [ignoredUsers]);

    // Merge and sort messages
    const entries: UnifiedEntry[] = (() => {
        const tw: UnifiedEntry[] = twitchMessages
            .filter((m) => !ignoredSet.has(m.author.toLowerCase()))
            .map((m) => ({ source: 'twitch' as const, msg: m }));
        const yt: UnifiedEntry[] = ytMessages
            .filter((m) => !ignoredSet.has(m.author.toLowerCase()))
            .map((m) => ({ source: 'youtube' as const, msg: m }));
        const merged = [...tw, ...yt].sort((a, b) => getTime(a) - getTime(b));
        return merged.length > MAX_DISPLAYED_MESSAGES ? merged.slice(-MAX_DISPLAYED_MESSAGES) : merged;
    })();

    const { isAtBottom, newMessagesCount, scrollToBottom } = useChatAutoScroll({
        containerRef,
        messages: entries,
    });

    const scrollToMessage = useCallback((targetId: string) => {
        const container = containerRef.current;
        if (!container) return;
        const el = container.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(targetId)}"]`);
        if (!el) return;
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.classList.add('message-highlight');
        setTimeout(() => el.classList.remove('message-highlight'), 2000);
    }, []);

    useImperativeHandle(ref, () => ({ scrollToBottom }));

    // Emote tooltip
    useEffect(() => {
        const handleEmoteHover = (e: Event) => {
            const target = e.target as HTMLElement;
            if (e.type === 'mouseover') {
                if (target.tagName === 'IMG' && target.classList.contains('chat-emote')) {
                    const tooltipUrl = target.getAttribute('data-tooltip-url');
                    const emoteName = target.getAttribute('data-emote-name') || 'Emote';
                    const emoteSource = target.getAttribute('data-emote-source') || 'Twitch';
                    if (tooltipUrl) {
                        const rect = target.getBoundingClientRect();
                        setEmoteTooltip({ url: tooltipUrl, name: emoteName, source: emoteSource, x: rect.left, y: rect.top });
                    }
                }
            } else if (e.type === 'mouseout') {
                if (target.classList.contains('chat-emote')) {
                    const relatedTarget = (e as MouseEvent).relatedTarget as Node | null;
                    if (!relatedTarget || !(relatedTarget as HTMLElement)?.closest?.('.chat-emote')) {
                        setEmoteTooltip(null);
                    }
                }
            }
        };
        const el = containerRef.current;
        if (el) {
            el.addEventListener('mouseover', handleEmoteHover);
            el.addEventListener('mouseout', handleEmoteHover);
        }
        return () => {
            if (el) {
                el.removeEventListener('mouseover', handleEmoteHover);
                el.removeEventListener('mouseout', handleEmoteHover);
            }
        };
    }, []);

    // Touch gestures
    const { handleTouchStart, handleTouchEnd, handleTouchMove, handleCopy } = useChatTouchGestures<UnifiedEntry>({
        onReply: onReply ? (entry) => { if (entry.source === 'twitch') onReply(entry.msg as ChatMessage); } : undefined,
        onLongPress: (entry) => setMessageMenu({ x: window.innerWidth / 2, y: window.innerHeight / 2, entry }),
        onCopyMessage,
        getContent: (entry) => {
            if (entry.source === 'twitch') return (entry.msg as ChatMessage).content;
            return (entry.msg as YTMessage).parts.map((p: MessagePart) => (p.type === 'text' ? (p.text ?? '') : (p.emojiText ?? p.alt ?? ''))).join('');
        },
        canReply: (entry) => entry.source === 'twitch',
    });

    const ytState = ytConnectionState;
    const showStatusBar = ytState !== undefined || twitchConnected !== undefined;

    return (
        <div className="unified-chat-wrapper">
            {showStatusBar && (
                <div className="chat-status-bar">
                    <span className={`platform-status${twitchConnected ? ' platform-status--connected' : ' platform-status--disconnected'}`}>
                        <span className="platform-status-dot" />
                        <span className="platform-status-text">Twitch</span>
                    </span>
                    {ytState && (
                        <span className={`platform-status${ytState.connected ? ' platform-status--connected' : ytState.loading ? ' platform-status--loading' : ytState.error ? ' platform-status--error' : ' platform-status--disconnected'}`}>
                            <span className={`platform-status-dot${ytState.loading ? ' platform-status-dot--loading' : ''}`} />
                            <span className="platform-status-text">
                                {ytState.connected ? 'YouTube' : ytState.loading ? 'YouTube...' : ytState.error ? `YouTube: ${ytState.error}` : 'YouTube'}
                            </span>
                        </span>
                    )}
                </div>
            )}
            <div
                ref={containerRef}
                className={`messages-container unified-messages-container${splitChatEnabled ? ' split-chat' : ''}`}
                style={{ '--chat-font-size': `${fontSize}px`, '--chat-font-family': FONT_FAMILY_MAP[chatFont] } as React.CSSProperties}
            >
                {entries.length === 0 && (
                    <div className="no-messages"><p>No messages yet. Start chatting!</p></div>
                )}
                {entries.map((entry, index) => {
                    if (entry.source === 'twitch') {
                        return (
                            <TwitchMessageItem
                                key={getKey(entry)}
                                entry={entry}
                                index={index}
                                entries={entries}
                                isModerator={isModerator}
                                modModeActive={modModeActive}
                                compactActions={compactActions}
                                currentUserDisplayName={currentUserDisplayName}
                                onReply={onReply}
                                onCopyMessage={onCopyMessage}
                                onDeleteMessage={onDeleteMessage}
                                onBanUser={onBanUser}
                                onTimeoutUser={onTimeoutUser}
                                onUntimeoutUser={onUntimeoutUser}
                                onWarnUser={onWarnUser}
                                onTimeoutMenu={(x, y, userId, username) => setTimeoutMenu({ x, y, userId, username })}
                                onMessageMenu={(x, y, e) => setMessageMenu({ x, y, entry: e })}
                                onViewHistory={(author, avatar) => handleViewHistory(author, 'twitch', avatar)}
                                onUsernameClick={(e, author, avatar) => handleUsernameClick(e, author, 'twitch', avatar)}
                                onTouchStart={handleTouchStart}
                                onTouchEnd={handleTouchEnd}
                                onTouchMove={handleTouchMove}
                                onScrollToMessage={scrollToMessage}
                            />
                        );
                    }
                    return (
                        <YouTubeMessageItem
                            key={getKey(entry)}
                            entry={entry}
                            index={index}
                            onTouchStart={handleTouchStart}
                            onTouchEnd={handleTouchEnd}
                            onTouchMove={handleTouchMove}
                            onUsernameClick={(e, author, avatar) => handleUsernameClick(e, author, 'youtube', avatar)}
                        />
                    );
                })}
            </div>

            {!isAtBottom && (
                <ScrollToBottomButton
                    count={newMessagesCount}
                    onClick={scrollToBottom}
                />
            )}

            {emoteTooltip && <EmoteTooltip {...emoteTooltip} />}

            {messageMenu && (
                <MessageMenu
                    x={messageMenu.x}
                    y={messageMenu.y}
                    entry={messageMenu.entry}
                    isModerator={isModerator}
                    modModeActive={modModeActive}
                    compactActions={compactActions}
                    onReply={onReply}
                    onCopy={handleCopy}
                    onDeleteMessage={onDeleteMessage}
                    onTimeoutUser={onTimeoutUser}
                    onBanUser={onBanUser}
                    onWarnUser={onWarnUser}
                    onViewHistory={(author, avatar) => handleViewHistory(author, messageMenu.entry.source, avatar)}
                    onClose={() => setMessageMenu(null)}
                />
            )}

            {chatterHistory && (
                <ChatterHistoryOverlay
                    author={chatterHistory.author}
                    platform={chatterHistory.platform}
                    authorAvatar={chatterHistory.authorAvatar}
                    channel={channelName}
                    isModerator={isModerator}
                    onTimeoutUser={onTimeoutUser}
                    onBanUser={onBanUser}
                    onWarnUser={onWarnUser}
                    onClose={() => setChatterHistory(null)}
                />
            )}

            {timeoutMenu && (
                <TimeoutMenu
                    userId={timeoutMenu.userId}
                    username={timeoutMenu.username}
                    x={timeoutMenu.x}
                    y={timeoutMenu.y}
                    onTimeout={(userId, seconds, username) => onTimeoutUser?.(userId, seconds, username)}
                    onClose={() => setTimeoutMenu(null)}
                />
            )}
        </div>
    );
});

export default memo(UnifiedChat);
