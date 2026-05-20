import type { ChatMessage } from '../../../lib/types';
import type { UnifiedEntry, YTMessage } from './types';
import { ContextMenuShell } from '../shared/ContextMenuShell';

interface MessageContextMenuProps {
    x: number;
    y: number;
    entry: UnifiedEntry;
    isModerator: boolean;
    modModeActive: boolean;
    compactActions: boolean;
    onReply?: (msg: ChatMessage) => void;
    onCopyMessage?: () => void;
    onDeleteMessage?: (id: string) => void;
    onTimeoutUser?: (userId: string, seconds: number, displayName?: string) => void;
    onBanUser?: (userId: string, displayName?: string) => void;
    onWarnUser?: (userName: string) => void;
    onClose: () => void;
}

export function MessageContextMenu({
    x,
    y,
    entry,
    isModerator,
    modModeActive,
    compactActions,
    onReply,
    onCopyMessage,
    onDeleteMessage,
    onTimeoutUser,
    onBanUser,
    onWarnUser,
    onClose,
}: MessageContextMenuProps) {
    const items: Array<{ key: string; label: string; onClick: () => void }> = [];

    if (entry.source === 'twitch' && onReply) {
        items.push({
            key: 'reply',
            label: 'Reply',
            onClick: () => { onReply(entry.msg as ChatMessage); onClose(); },
        });
    }
    items.push({
        key: 'copy',
        label: 'Copy message',
        onClick: () => { onCopyMessage?.(); onClose(); },
    });

    if (isModerator && modModeActive && entry.source === 'twitch') {
        const msg = entry.msg as ChatMessage;
        const isBroadcaster = Boolean(msg.badges?.['broadcaster']);
        const isModeratorMsg = Boolean(msg.badges?.['moderator']);
        if (!isBroadcaster && !isModeratorMsg && !msg.isCurrentUser) {
            items.push({ key: 'delete', label: 'Delete', onClick: () => { onDeleteMessage?.(msg.id); onClose(); } });
            items.push({ key: 'timeout', label: 'Timeout (10m)', onClick: () => { onTimeoutUser?.(msg.userId || '', 600, msg.author); onClose(); } });
            items.push({ key: 'ban', label: 'Ban', onClick: () => { onBanUser?.(msg.userId || '', msg.author); onClose(); } });
            items.push({ key: 'warn', label: 'Warn', onClick: () => { onWarnUser?.(msg.author); onClose(); } });
        }
    }

    if (compactActions) items.sort((a, b) => a.label.localeCompare(b.label));

    const author = entry.source === 'twitch'
        ? `@${(entry.msg as ChatMessage).author}`
        : `${(entry.msg as YTMessage).author}`;

    return (
        <ContextMenuShell x={x} y={y} extraClass="message-context-menu">
            <div className="context-menu-header">{author}</div>
            {items.map((it) => (
                <button key={it.key} onClick={it.onClick} className="context-menu-item">{it.label}</button>
            ))}
        </ContextMenuShell>
    );
}
