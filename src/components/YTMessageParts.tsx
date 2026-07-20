import React, { useMemo, useCallback, useRef, useLayoutEffect } from "react";
import {
  tokenizeThirdPartyEmotesForYoutube,
  useDisabledEmotes,
  useEmoteMapVersion,
  type YoutubeEmoteToken,
} from "../lib/emotes";
import { renderUnicodeEmojis } from "../lib/emotes/utils";

export interface YTMessagePart {
  type: "text" | "emoji";
  text?: string;
  url?: string;
  alt?: string;
  emojiText?: string;
  isCustomEmoji?: boolean;
}

interface YTMessagePartsProps {
  parts: YTMessagePart[];
  /**
   * - `'unified'` used inside UnifiedChat; emoji get `chat-emote` class.
   * - `'standalone'` used inside YouTubeChat; emoji get `yt-emoji` class.
   */
  variant?: "unified" | "standalone";
  /**
   * When true, words in `text` parts that match a known 7TV / BTTV / FFZ emote
   * name are rendered as images using the same emote set as Twitch chat.
   * Defaults to false.
   */
  renderThirdPartyEmotes?: boolean;
}

const emoteImgStyle: React.CSSProperties = {
  height: "2em",
  verticalAlign: "middle",
  margin: "0 2px",
  cursor: "pointer",
};

function ThirdPartyEmoteNode({
  token,
  variant,
}: {
  token: YoutubeEmoteToken;
  variant: "unified" | "standalone";
}) {
  if (!token.url || !token.name || !token.provider) return null;
  const className =
    variant === "unified" ? "chat-emote" : "yt-emoji yt-emoji--third-party";
  const img = (
    <img
      src={token.url}
      alt={token.name}
      title={token.name}
      data-tooltip-url={token.url}
      data-emote-name={token.name}
      data-emote-source={token.provider}
      data-emote-author={token.author}
      className={className}
      loading="lazy"
      style={emoteImgStyle}
    />
  );
  if (!token.overlays?.length) return img;
  return (
    <span className="emote-overlay-container">
      {img}
      {token.overlays.map((ov, i) => (
        <span className="emote-overlay" key={`${ov.name}-${i}`}>
          <img
            src={ov.url}
            alt={ov.name}
            title={ov.name}
            data-tooltip-url={ov.url}
            data-emote-name={ov.name}
            data-emote-source="7TV"
            className="chat-emote"
            loading="lazy"
            style={{ height: "2em", cursor: "pointer" }}
          />
        </span>
      ))}
    </span>
  );
}

/**
 * Renders a YouTube message parts array (mixed text + emoji).
 * Shared by UnifiedChat and YouTubeChat.
 */
export default function YTMessageParts({
  parts,
  variant = "standalone",
  renderThirdPartyEmotes = false,
}: YTMessagePartsProps) {
  // Subscribe to the emote map version so the memo invalidates as soon as the
  // underlying 7TV/BTTV/FFZ/Twitch maps change. `useEmoteMapVersion` is
  // implemented with `useSyncExternalStore` against the `emotes-reloaded`
  // event so it re-renders exactly when the version bumps, no manual counter
  // required.
  const emoteVersion = useEmoteMapVersion();
  // Cache the disabled-emote set; refreshed only when `emotes-reloaded` fires
  // (which `toggleDisableEmote` already does) or when another tab updates
  // the same localStorage key.
  const disabledEmotes = useDisabledEmotes();

  const renderText = useCallback(
    (text: string, key: React.Key): React.ReactNode => {
      if (!renderThirdPartyEmotes)
        return <React.Fragment key={key}>{text}</React.Fragment>;
      const tokens = tokenizeThirdPartyEmotesForYoutube(
        text,
        disabledEmotes,
      );
      if (tokens.length === 0)
        return <React.Fragment key={key}>{text}</React.Fragment>;
      const out: React.ReactNode[] = [];
      // The tokenizer splits on whitespace and skips empty words; we restore
      // a single space between non-empty tokens to match the original text.
      let needSpace = false;
      for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];
        if (tok.type === "text") {
          out.push(
            <React.Fragment key={`${key}-t-${i}`}>
              {needSpace ? " " : ""}
              {tok.text}
            </React.Fragment>,
          );
          needSpace = Boolean(tok.text);
        } else {
          out.push(
            <React.Fragment key={`${key}-e-${i}`}>
              {needSpace ? " " : ""}
              <ThirdPartyEmoteNode token={tok} variant={variant} />
            </React.Fragment>,
          );
          needSpace = true;
        }
      }
      return <React.Fragment key={key}>{out}</React.Fragment>;
    },
    [renderThirdPartyEmotes, variant, disabledEmotes, emoteVersion],
  );

  const rendered = useMemo(
    () =>
      parts.map((part, i) =>
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
          renderText(part.text ?? "", i)
        ),
      ),
    [parts, variant, renderText],
  );

  // After React renders text nodes, convert any Unicode emoji characters
  // (e.g. 🇨🇦) into Twemoji <img> tags for consistent cross-platform display.
  // Twemoji only touches text content — existing <img> elements (YouTube
  // custom emojis, 7TV/BTTV/FFZ emotes) are left untouched.
  const containerRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (containerRef.current) {
      renderUnicodeEmojis(containerRef.current);
    }
  }, [rendered]);

  return <span ref={containerRef}>{rendered}</span>;
}
