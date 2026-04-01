import React from 'react';
import { MdStars, MdAutorenew, MdCardGiftcard, MdRedeem } from 'react-icons/md';
import { GiHeartBeats } from 'react-icons/gi';

const EVENT_CONFIG: Record<string, { title: string; color: string }> = {
    cheer:        { title: 'Cheer',                        color: '#FFB700' },
    subscription: { title: 'Subscription',                 color: '#9147FF' },
    resub:        { title: 'Resub',                        color: '#9147FF' },
    subgift:      { title: 'Subgift',                      color: '#9147FF' },
    redemption:   { title: 'Channel Points Redemption',    color: '#9147FF' },
};

interface TwitchEventIconProps {
    messageType?: string;
    /** Icon size in pixels (default: 14) */
    size?: number;
}

/**
 * Renders the coloured icon that signals a special Twitch chat event
 * (cheer, sub, resub, subgift, channel-points redemption).
 * Returns null for regular chat messages.
 */
export default function TwitchEventIcon({ messageType, size = 14 }: TwitchEventIconProps) {
    if (!messageType) return null;
    const cfg = EVENT_CONFIG[messageType];
    if (!cfg) return null;

    let icon: React.ReactNode;
    switch (messageType) {
        case 'cheer':        icon = <GiHeartBeats size={size} />; break;
        case 'subscription': icon = <MdStars      size={size} />; break;
        case 'resub':        icon = <MdAutorenew  size={size} />; break;
        case 'subgift':      icon = <MdCardGiftcard size={size} />; break;
        case 'redemption':   icon = <MdRedeem     size={size} />; break;
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
}
