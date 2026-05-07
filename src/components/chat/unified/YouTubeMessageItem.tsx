import { getColorFromName } from '../../../lib/chatColors';
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

export function YouTubeMessageItem({
    entry,
    index,
    onTouchStart,
    onTouchEnd,
    onTouchMove,
}: YouTubeMessageItemProps) {
    const msg = entry.msg as YTMessage;

    // Gift purchase
    if (msg.messageType === 'gift-purchase' && msg.superchat) {
        return (
            <div
                key={entry.source + ':' + msg.id}
                className="yt-superchat yt-gift-purchase"
                style={{ backgroundColor: msg.superchat.color }}
                onTouchStart={() => onTouchStart(entry)}
                onTouchEnd={() => onTouchEnd(entry)}
                onTouchMove={onTouchMove}
            >
                <div className="yt-superchat-header">
                    {msg.authorAvatar && <img src={msg.authorAvatar} alt={msg.author} className="avatar" />}
                    <div className="yt-superchat-info">
                        <div className="yt-superchat-author">
                            <PlatformTag source="youtube" />
                            {msg.author}
                        </div>
                        <div className="yt-superchat-amount">
                            <span className="gift-icon">🎁</span>
                            Bought {msg.giftCount || 1} gift{msg.giftCount !== 1 ? 's' : ''}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Gift redemption
    if (msg.messageType === 'gift-redemption' && msg.superchat) {
        return (
            <div
                key={entry.source + ':' + msg.id}
                className="yt-superchat yt-gift-redemption"
                style={{ backgroundColor: msg.superchat.color }}
                onTouchStart={() => onTouchStart(entry)}
                onTouchEnd={() => onTouchEnd(entry)}
                onTouchMove={onTouchMove}
            >
                <div className="yt-superchat-header">
                    {msg.authorAvatar && <img src={msg.authorAvatar} alt={msg.author} className="avatar" />}
                    <div className="yt-superchat-info">
                        <div className="yt-superchat-author">
                            <PlatformTag source="youtube" />
                            {msg.author}
                        </div>
                        <div className="yt-superchat-amount">
                            <span className="gift-icon">🎉</span>
                            Received a gift membership
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Superchat
    if (msg.superchat) {
        return (
            <div
                key={entry.source + ':' + msg.id}
                className="yt-superchat"
                style={{ backgroundColor: msg.superchat.color }}
                onTouchStart={() => onTouchStart(entry)}
                onTouchEnd={() => onTouchEnd(entry)}
                onTouchMove={onTouchMove}
            >
                <div className="yt-superchat-header">
                    {msg.authorAvatar && <img src={msg.authorAvatar} alt={msg.author} className="avatar" />}
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

    // Normal message
    const parityClass = (index % 2 === 0) ? 'even' : 'odd';
    return (
        <div
            key={entry.source + ':' + msg.id}
            className={`message${msg.optimistic ? ' yt-optimistic' : ''} ${parityClass}`}
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
}
