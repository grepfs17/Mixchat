import { createPortal } from 'react-dom';

interface EmoteTooltipProps {
    url: string;
    name: string;
    x: number;
    y: number;
}

export function EmoteTooltip({ url, name, x, y }: EmoteTooltipProps) {
    return createPortal(
        <div
            className="chat-emote-tooltip"
            style={{
                position: 'fixed',
                left: x,
                top: y,
                transform: 'translateY(-100%) translateY(-10px)',
                zIndex: 9999,
                pointerEvents: 'none',
            }}
        >
            <img src={url} alt={name} />
            <div className="chat-emote-tooltip-name">{name}</div>
        </div>,
        document.body
    );
}
