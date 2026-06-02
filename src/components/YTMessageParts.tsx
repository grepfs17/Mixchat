import React from "react";

interface MessagePart {
  type: "text" | "emoji";
  text?: string;
  url?: string;
  alt?: string;
  emojiText?: string;
  isCustomEmoji?: boolean;
}

interface YTMessagePartsProps {
  parts: MessagePart[];
  /**
   * - `'unified'` used inside UnifiedChat; emoji get `chat-emote` class.
   * - `'standalone'` used inside YouTubeChat; emoji get `yt-emoji` class.
   */
  variant?: "unified" | "standalone";
}

/**
 * Renders a YouTube message parts array (mixed text + emoji).
 * Shared by UnifiedChat and YouTubeChat.
 */
export default function YTMessageParts({
  parts,
  variant = "standalone",
}: YTMessagePartsProps) {
  return (
    <>
      {parts.map((part, i) =>
        part.type === "emoji" ? (
          variant === "unified" ? (
            <img
              key={i}
              src={part.url}
              alt={part.alt || part.emojiText || "🙂"}
              title={part.emojiText || part.alt}
              className="chat-emote"
              data-tooltip-url={part.url}
              data-emote-name={part.alt || part.emojiText || "Emoji"}
              data-emote-source="YouTube"
              style={{
                width: part.isCustomEmoji ? "28px" : "18px",
                height: part.isCustomEmoji ? "28px" : "18px",
                verticalAlign: "middle",
                margin: "0 1px",
                objectFit: "contain",
                cursor: "pointer",
              }}
            />
          ) : (
            <img
              key={i}
              src={part.url}
              alt={part.alt || part.emojiText || "🙂"}
              title={part.emojiText || part.alt}
              className={`yt-emoji ${part.isCustomEmoji ? "custom" : "standard"}`}
              loading="lazy"
            />
          )
        ) : (
          <React.Fragment key={i}>{part.text}</React.Fragment>
        ),
      )}
    </>
  );
}
