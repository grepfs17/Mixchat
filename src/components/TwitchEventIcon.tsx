import React from 'react';

export const EVENT_CONFIG: Record<string, { title: string; color: string; bg: string }> = {
    cheer: { title: 'Cheer', color: '#FFB700', bg: 'rgba(255, 183, 0, 0.12)' },
    subscription: { title: 'New Subscription', color: '#bf94ff', bg: 'rgba(145, 71, 255, 0.15)' },
    resub: { title: 'Resubscription', color: '#bf94ff', bg: 'rgba(145, 71, 255, 0.15)' },
    subgift: { title: 'Gift Subscription', color: '#bf94ff', bg: 'rgba(145, 71, 255, 0.15)' },
    redemption: { title: 'Channel Points Redemption', color: '#c9a2ff', bg: 'rgba(145, 71, 255, 0.15)' },
    highlight: { title: 'Highlighted Message', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.12)' },
    raid: { title: 'Raid', color: '#4ade80', bg: 'rgba(74, 222, 128, 0.10)' },
    'watch-streak': { title: 'Watch Streak', color: '#f472b6', bg: 'rgba(244, 114, 182, 0.12)' },
    notice: { title: 'Info', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.1)' },
    timeout: { title: 'Timeout', color: '#f87171', bg: 'rgba(248, 113, 113, 0.12)' },
    ban: { title: 'Ban', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)' },
    untimeout: { title: 'Untimeout', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.10)' },
    unban: { title: 'Unban', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.10)' },
    announcement: { title: 'Announcement', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.12)' },
    'reward-gift': { title: 'Reward Gift', color: '#c9a2ff', bg: 'rgba(145, 71, 255, 0.15)' },
};

interface TwitchEventLabelProps {
    messageType?: string;
    /** Optional: no longer used internally; kept for API compatibility */
    rewardTitle?: string;
    size?: number;
}

/**
 * Renders a small text label at the top of special Twitch chat events
 * (cheer, sub, resub, subgift, channel-points redemption).
 * Returns null for regular chat messages.
 */
export default function TwitchEventIcon({ messageType }: TwitchEventLabelProps) {
    if (!messageType) return null;
    const cfg = EVENT_CONFIG[messageType];
    if (!cfg) return null;

    const label = cfg.title;

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
