import React from 'react';

export const EVENT_CONFIG: Record<string, { title: string; color: string; bg: string }> = {
    cheer:                { title: 'Cheer',                        color: '#FFB700', bg: 'rgba(255, 183, 0, 0.12)' },
    subscription:         { title: 'New Subscription',             color: '#bf94ff', bg: 'rgba(145, 71, 255, 0.15)' },
    resub:                { title: 'Resubscription',               color: '#bf94ff', bg: 'rgba(145, 71, 255, 0.15)' },
    subgift:              { title: 'Gift Subscription',            color: '#bf94ff', bg: 'rgba(145, 71, 255, 0.15)' },
    redemption:           { title: 'Channel Points Redemption',    color: '#c9a2ff', bg: 'rgba(145, 71, 255, 0.15)' },
    'first-time-chatter': { title: 'First Time Chatter',           color: '#60b8ff', bg: 'rgba(56, 139, 253, 0.12)' },
    raid:                 { title: 'Raid',                         color: '#4ade80', bg: 'rgba(74, 222, 128, 0.10)' },
};

interface TwitchEventLabelProps {
    messageType?: string;
    /** Optional reward title to append for redemption events */
    rewardTitle?: string;
}

/**
 * Renders a small text label at the top of special Twitch chat events
 * (cheer, sub, resub, subgift, channel-points redemption).
 * Returns null for regular chat messages.
 */
export default function TwitchEventIcon({ messageType, rewardTitle }: TwitchEventLabelProps) {
    if (!messageType) return null;
    const cfg = EVENT_CONFIG[messageType];
    if (!cfg) return null;

    const label = messageType === 'redemption' && rewardTitle
        ? `${cfg.title}: ${rewardTitle}`
        : cfg.title;

    return (
        <div
            className="twitch-event-label"
            style={{
                color: cfg.color,
                background: cfg.bg,
                borderColor: cfg.color,
            }}
        >
            {label}
        </div>
    );
}
