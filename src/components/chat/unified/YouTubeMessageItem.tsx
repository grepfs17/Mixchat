import { getColorFromName, getReadableUsernameColor } from '../../../lib/chatColors';
import MessageBadges from '../../MessageBadges';
import YTMessageParts from '../../YTMessageParts';
import { PlatformTag } from './PlatformTag';
import type { UnifiedEntry, YTMessage } from './types';

interface YouTubeMessageItemProps {
    entry: UnifiedEntry;
    index: number;
    onTouchStart: (entry: UnifiedEntry) => void;
    onTouchEnd: (entry: UnifiedEntry) => void;
    onTouchMove: (e: React.TouchEvent) => void;
}

const YT_EVENT_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    'membership': { label: 'MEMBER', color: '#0f9d58', bg: 'rgba(15, 157, 88, 0.15)' },
    'gift-purchase': { label: 'GIFT', color: '#9c27b0', bg: 'rgba(156, 39, 176, 0.15)' },
    'gift-redemption': { label: 'GIFT RECEIVED', color: '#4caf50', bg: 'rgba(76, 175, 80, 0.15)' },
};

export function YouTubeMessageItem({
    entry,
    index,
    onTouchStart,
    onTouchEnd,
    onTouchMove,
}: YouTubeMessageItemProps) {
    const msg = entry.msg as YTMessage;

    const getConfig = () => {
        if (msg.messageType && YT_EVENT_CONFIG[msg.messageType]) return YT_EVENT_CONFIG[msg.messageType];
        if (msg.superchat) return { label: 'SUPER CHAT', color: msg.superchat.color, bg: `${msg.superchat.color}26` };
        return null;
    };

    const config = getConfig();

    if (config) {
        const parityClass = (index % 2 === 0) ? 'even' : 'odd';
        return (
            <div
                key={entry.source + ':' + msg.id}
                className={`message yt-event ${parityClass}`}
                style={{ '--event-color': config.color, '--event-bg': config.bg } as React.CSSProperties}
                onTouchStart={() => onTouchStart(entry)}
                onTouchEnd={() => onTouchEnd(entry)}
                onTouchMove={onTouchMove}
            >
                <div className="yt-event-label" style={{ color: config.color, background: config.bg, borderColor: config.color }}>
                    {config.label}
                </div>
                <div className="message-single-line">
                    <span className="timestamp">
                        {(msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp))
                            .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <PlatformTag source="youtube" />
                    {msg.authorAvatar && <img src={msg.authorAvatar} alt={msg.author} className="avatar" />}
                    <MessageBadges badges={msg.badges} style={{ marginRight: '4px' }} lazy />
                    <span className="author" style={{ color: config.color }}>{msg.author}</span>
                    <span className="message-separator">:</span>
                    <span className="message-text">
                        {msg.messageType === 'membership' && (
                            <>
                                <span className="yt-superchat-amount-inline">{msg.superchat!.amount}</span>
                                {msg.parts.length > 0 && <YTMessageParts parts={msg.parts} variant="unified" />}
                            </>
                        )}
                        {msg.messageType === 'gift-purchase' && (
                            <>Bought {msg.giftCount || 1} gift{msg.giftCount !== 1 ? 's' : ''}</>
                        )}
                        {msg.messageType === 'gift-redemption' && (
                            <>Received a gift membership</>
                        )}
                        {msg.superchat && !msg.messageType && (
                            <>
                                <span className="yt-superchat-amount-inline">{msg.superchat.amount}</span>
                                {msg.parts.length > 0 && <YTMessageParts parts={msg.parts} variant="unified" />}
                            </>
                        )}
                    </span>
                </div>
                {msg.superchat?.sticker && (
                    <div className="yt-superchat-sticker-row">
                        <img
                            src={msg.superchat.sticker.url}
                            alt={msg.superchat.sticker.alt}
                            className="yt-superchat-sticker"
                            style={{ width: '72px', height: '72px', marginTop: '4px', objectFit: 'contain' }}
                            loading="lazy"
                        />
                    </div>
                )}
            </div>
        );
    }

    const parityClass = (index % 2 === 0) ? 'even' : 'odd';
    return (
        <div
            key={entry.source + ':' + msg.id}
            className={`message${msg.optimistic ? ' yt-optimistic' : ''}${msg.isDeleted ? ' deleted' : ''} ${parityClass}`}
            onTouchStart={() => onTouchStart(entry)}
            onTouchEnd={() => onTouchEnd(entry)}
            onTouchMove={onTouchMove}
        >
            <div className="message-single-line">
                <span className="timestamp">
                    {(msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp))
                        .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <PlatformTag source="youtube" />
                {msg.authorAvatar && <img src={msg.authorAvatar} alt={msg.author} className="avatar" />}
                <MessageBadges badges={msg.badges} style={{ marginRight: '4px' }} lazy />
                <span className="author" style={{ color: getReadableUsernameColor(getColorFromName(msg.author)) }}>
                    {msg.author}
                </span>
                <span className="message-separator">:</span>
                <span className="message-text">
                    <YTMessageParts parts={msg.parts} variant="unified" />
                </span>
            </div>
            {msg.isDeleted && (
                <div className="deleted-notice">Deleted by a moderator</div>
            )}
        </div>
    );
}
