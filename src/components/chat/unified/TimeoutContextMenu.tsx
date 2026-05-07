import { createPortal } from 'react-dom';

interface TimeoutContextMenuProps {
    x: number;
    y: number;
    userId: string;
    username: string;
    onTimeout: (userId: string, seconds: number, username: string) => void;
    onClose: () => void;
}

export function TimeoutContextMenu({ x, y, userId, username, onTimeout, onClose }: TimeoutContextMenuProps) {
    return createPortal(
        <div
            className="mod-context-menu"
            onContextMenu={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            style={{
                position: 'fixed',
                top: y,
                right: window.innerWidth - x,
                left: 'auto',
                zIndex: 9999,
            }}
        >
            <div className="mod-context-menu-header">Timeout {username}</div>
            <button onClick={() => { onTimeout(userId, 10, username); onClose(); }}>
                10 Seconds
            </button>
            <button onClick={() => { onTimeout(userId, 600, username); onClose(); }}>
                10 Minutes
            </button>
            <button onClick={() => { onTimeout(userId, 86400, username); onClose(); }}>
                1 Day
            </button>
        </div>,
        document.body
    );
}
