import { createPortal } from "react-dom";

interface EmoteTooltipProps {
  url: string;
  name: string;
  source: string;
  x: number;
  y: number;
}

export default function EmoteTooltip({
  url,
  name,
  source,
  x,
  y,
}: EmoteTooltipProps) {
  return createPortal(
    <div
      className="chat-emote-tooltip"
      style={{
        position: "fixed",
        left: x,
        top: y,
        transform: "translateY(-100%) translateY(-10px)",
        zIndex: 9999,
        pointerEvents: "none",
      }}
    >
      <img src={url} alt={name} />
      <div className="chat-emote-tooltip-name">{name}</div>
      <div className="chat-emote-tooltip-source">{source}</div>
    </div>,
    document.body,
  );
}
