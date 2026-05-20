import { MdReply, MdContentCopy, MdDelete, MdHourglassEmpty, MdBlock, MdWarning } from 'react-icons/md';
import type { ChatMessage } from '../../../lib/types';
import { parseMessageWithEmotes } from '../../../lib/emotes';
import { getReadableUsernameColor } from '../../../lib/chatColors';
import MessageBadges from '../../MessageBadges';
import TwitchEventIcon, { EVENT_CONFIG } from '../../TwitchEventIcon';
import { PlatformTag } from './PlatformTag';
import type { UnifiedEntry } from './types';

interface TwitchMessageItemProps {
    entry: UnifiedEntry;
    index: number;
    entries: UnifiedEntry[];
    isModerator: boolean;
    modModeActive: boolean;
    compactActions: boolean;
    currentUserDisplayName?: string;
    onReply?: (msg: ChatMessage) => void;
    onCopyMessage?: () => void;
    onDeleteMessage?: (id: string) => void;
    onBanUser?: (userId: string, displayName?: string) => void;
    onTimeoutUser?: (userId: string, seconds: number, displayName?: string) => void;
    onUntimeoutUser?: (userName: string) => void;
    onWarnUser?: (userName: string) => void;
    onViewHistory?: (author: string) => void;
    onUsernameClick?: (e: React.MouseEvent, author: string) => void;
    onTimeoutMenu: (x: number, y: number, userId: string, username: string) => void;
    onMessageMenu: (x: number, y: number, entry: UnifiedEntry) => void;
    onTouchStart: (entry: UnifiedEntry) => void;
    onTouchEnd: (entry: UnifiedEntry) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onScrollToMessage?: (id: string) => void;
}

export function TwitchMessageItem({
    entry,
    index,
    entries,
    isModerator,
    modModeActive,
    compactActions,
    currentUserDisplayName,
    onReply,
    onCopyMessage,
    onDeleteMessage,
    onBanUser,
    onTimeoutUser,
    onUntimeoutUser,
    onWarnUser,
    onViewHistory,
    onUsernameClick,
    onTimeoutMenu,
    onMessageMenu,
    onTouchStart,
    onTouchEnd,
    onTouchMove,
    onScrollToMessage,
}: TwitchMessageItemProps) {
    const msg = entry.msg as ChatMessage;
    const isMentioned = currentUserDisplayName && msg.content.includes(currentUserDisplayName);
    const prevEntry = index > 0 ? entries[index - 1] : null;
    const prevWasPreloaded = prevEntry?.source === 'twitch' && (prevEntry.msg as ChatMessage).isPreloaded;
    const isFirstLive = !msg.isPreloaded && prevWasPreloaded;
    const parityClass = (index % 2 === 0) ? 'even' : 'odd';
    const messageClasses = [
        'message',
        msg.messageType,
        msg.isPreloaded ? 'preloaded' : '',
        msg.isDeleted ? 'deleted' : '',
        msg.isBot ? 'bot' : '',
        ((msg.mentionsUser || isMentioned) && !msg.isBot) ? 'mention' : '',
        parityClass,
    ].filter(Boolean).join(' ');

    const isBroadcaster = Boolean(msg.badges && msg.badges['broadcaster']);
    const isModeratorMsg = Boolean(msg.badges && msg.badges['moderator']);
    const isUnmoderatable = isBroadcaster || isModeratorMsg || msg.isCurrentUser;

    const eventStyle = (() => {
        const cfg = msg.messageType ? EVENT_CONFIG[msg.messageType] : undefined;
        return cfg ? { '--event-color': cfg.color, '--event-bg': cfg.bg } as React.CSSProperties : undefined;
    })();

    return (
        <>
            {isFirstLive && <div className="live-start-marker"><span>Live</span></div>}
            <div
                className={messageClasses}
                data-message-id={msg.id}
                style={eventStyle}
                onTouchStart={() => onTouchStart(entry)}
                onTouchEnd={() => onTouchEnd(entry)}
                onTouchMove={onTouchMove}
                onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onMessageMenu(e.clientX, e.clientY, entry);
                }}
            >
                {msg.replyTo && (
                    <div
                        className="reply-info reply-info-clickable"
                        onClick={() => onScrollToMessage?.(msg.replyTo!.id)}
                        title="Jump to original message"
                    >
                        <span>
                            response to{' '}
                            <span style={{ color: '#94a3b8' }}>@{msg.replyTo.author}</span>
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
                    <PlatformTag source="twitch" />
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
                        onClick={(e) => onUsernameClick?.(e, msg.author)}
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
                                                            onTimeoutMenu(e.clientX, e.clientY, msg.userId || '', msg.author);
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
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>
                {msg.isDeleted && (
                    <div className="deleted-notice">Deleted by a moderator</div>
                )}
            </div>
        </>
    );
}
