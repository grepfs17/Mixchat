import React, { useMemo, useCallback } from "react";
import {
  describeEffects,
  tokenizeThirdPartyEmotesForYoutube,
  useDisabledEmotes,
  useEmoteMapVersion,
  type EmoteEffect,
  type YoutubeEmoteToken,
} from "../lib/emotes";
import { escapeHtml, renderUnicodeEmojis, parseUrlWord } from "../lib/emotes/utils";
import TwitchLinkPreview from "./chat/TwitchLinkPreview";
import { parseTwitchUrl } from "../lib/twitchLink";

export interface YTMessagePart {
  type: "text" | "emoji" | "twitch-link";
  text?: string;
  url?: string;
  alt?: string;
  emojiText?: string;
  isCustomEmoji?: boolean;
  /** Required when type === "twitch-link". Twich parts used by the preview card. */
  twitchUrl?: string;
}

interface YTMessagePartsProps {
  parts: YTMessagePart[];
  /**
   * - `'unified'` used inside UnifiedChat. Emoji get `chat-emote` class.
   * - `'standalone'` used inside YouTubeChat. Emoji get `yt-emoji` class.
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

/**
 * Resolve BTTV/FFZ modifier effects into classes and styles. Geometry uses
 * the image's inline style. Filter/motion use a `.emote-mod` wrapper so
 * animations can't clobber the transform. `slide` renders a repeating
 * background on the wrapper.
 */
function resolveEffectStyle(
  effects: EmoteEffect[] | undefined,
  url: string,
): {
  wrapperClass?: string;
  style: React.CSSProperties;
  wrapperStyle?: React.CSSProperties;
} {
  const style: React.CSSProperties = { ...emoteImgStyle };
  if (!effects?.length) return { style };
  const info = describeEffects(effects);
  if (!info) return { style };

  if (info.width) style.width = info.width;
  if (info.transform) style.transform = info.transform;
  if (info.background) style.opacity = 0;

  const wrapperStyle: React.CSSProperties = {};
  let wrapperClass = "emote-mod";

  if (info.filter) {
    (wrapperStyle as Record<string, string>)["--ffz-effect-filters"] =
      info.filter;
    wrapperStyle.filter = "var(--ffz-effect-filters)";
  }
  if (info.transformOrigin) wrapperStyle.transformOrigin = info.transformOrigin;
  if (info.animation) wrapperStyle.animation = info.animation;
  if (info.background) {
    wrapperClass = "emote-mod emote-mod--slide";
    wrapperStyle.backgroundImage = `url("${url}")`;
    wrapperStyle.backgroundSize = "100% auto";
    wrapperStyle.backgroundRepeat = "repeat";
    wrapperStyle.lineHeight = 0;
    (wrapperStyle as Record<string, string>)["--ffz-width"] =
      `${info.slideWidthEm}em`;
    (wrapperStyle as Record<string, string>)["--ffz-speed-x"] =
      info.slideSpeed ?? "";
  }

  const hasWrapper = Object.keys(wrapperStyle).length > 0;
  return {
    wrapperClass: hasWrapper ? wrapperClass : undefined,
    style,
    wrapperStyle: hasWrapper ? wrapperStyle : undefined,
  };
}

/**
 * Skips the split+walk when text has no URL-shaped words. May over-match,
 * but must never miss a word `parseUrlWord` would linkify.
 */
const URL_DETECT_REGEX = /(^|\s)(https?:\/\/|www\.)/i;

/**
 * Renders plain text with Unicode emoji converted to Twemoji <img> markup.
 *
 * Emoji are NOT post-processed by mutating the mounted DOM: twemoji.parse
 * replaces React-created text nodes, so the next re-render throws
 * `NotFoundError: ... insertBefore ... is not a child of this node`. Instead
 * the escaped string is passed as static markup via dangerouslySetInnerHTML
 * (never diffed), matching the Twitch HTML renderer.
 */
function EmojiText({ text }: { text: string }) {
  // twemoji.parse leaves a string untouched when it contains no emoji, so
  // comparing against the escaped input doubles as the emoji check and keeps
  // emoji-free words as plain (React-escaped) text.
  const escaped = escapeHtml(text);
  const html = renderUnicodeEmojis(escaped);
  if (html === escaped) return <>{text}</>;
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * Renders a word as an http(s):// or www. link, otherwise plain text.
 * Shared by both rendering paths so they linkify identically.
 */
function LinkifiedWord({ word }: { word: string }) {
  const href = parseUrlWord(word);
  if (!href) return <EmojiText text={word} />;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="yt-message-link"
    >
      <EmojiText text={word} />
    </a>
  );
}

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

  const renderImage = (
    src: string,
    name: string,
    provider: string,
    author: string | undefined,
    effects: EmoteEffect[] | undefined,
  ) => {
    const { wrapperClass, style, wrapperStyle } = resolveEffectStyle(
      effects,
      src,
    );
    const img = (
      <img
        src={src}
        alt={name}
        title={name}
        data-tooltip-url={src}
        data-emote-name={name}
        data-emote-source={provider}
        data-emote-author={author}
        className={className}
        loading="lazy"
        style={style}
      />
    );
    return wrapperClass ? (
      <span className={wrapperClass} style={wrapperStyle}>
        {img}
      </span>
    ) : (
      img
    );
  };

  const img = renderImage(
    token.url,
    token.name,
    token.provider,
    token.author,
    token.effects,
  );
  if (!token.overlays?.length) return img;
  return (
    <span className="emote-overlay-container">
      {img}
      {token.overlays.map((ov, i) => (
        <span className="emote-overlay" key={`${ov.name}-${i}`}>
          {renderImage(ov.url, ov.name, "7TV", undefined, ov.effects)}
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
  // Subscribe to emote map changes so the memo invalidates when
  // 7TV/BTTV/FFZ/Twitch maps reload.
  const emoteVersion = useEmoteMapVersion();
  // Cached disabled-emote set, refreshed on `emotes-reloaded` and cross-tab
  // localStorage updates.
  const disabledEmotes = useDisabledEmotes();

  const renderText = useCallback(
    (text: string, key: React.Key): React.ReactNode => {
      if (!renderThirdPartyEmotes) {
        // Fast path: verbatim text unless a URL-shaped word is present, in
        // which case split on whitespace (keeping it) and linkify URL words.
        if (!URL_DETECT_REGEX.test(text)) {
          return (
            <React.Fragment key={key}>
              <EmojiText text={text} />
            </React.Fragment>
          );
        }
        return (
          <React.Fragment key={key}>
            {text.split(/(\s+)/).map((word, i) => (
              <LinkifiedWord key={`u-${i}`} word={word} />
            ))}
          </React.Fragment>
        );
      }
      const tokens = tokenizeThirdPartyEmotesForYoutube(
        text,
        disabledEmotes,
      );
      if (tokens.length === 0)
        return <React.Fragment key={key}>{text}</React.Fragment>;
      const out: React.ReactNode[] = [];
      // The tokenizer splits on whitespace and skips empty words. We restore
      // a single space between non-empty tokens to match the original text.
      let needSpace = false;
      for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];
        if (tok.type === "text") {
          out.push(
            <React.Fragment key={`${key}-t-${i}`}>
              {needSpace ? " " : ""}
              <LinkifiedWord word={tok.text ?? ""} />
            </React.Fragment>,
          );
          needSpace = Boolean(tok.text);
        } else {
          out.push(
            <React.Fragment key={`${key}-e-${tok.name ?? tok.text ?? i}`}>
              {needSpace ? " " : ""}
              <ThirdPartyEmoteNode token={tok} variant={variant} />
            </React.Fragment>,
          );
          needSpace = true;
        }
      }
      return <React.Fragment key={key}>{out}</React.Fragment>;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [renderThirdPartyEmotes, variant, disabledEmotes, emoteVersion],
  );

  const rendered = useMemo(() => {
    const content: React.ReactNode[] = [];
    const previews: React.ReactNode[] = [];
    parts.forEach((part, i) => {
      if (part.type === "twitch-link") {
        const url = part.twitchUrl || part.text || "";
        const parsed = parseTwitchUrl(url);
        if (!parsed) {
          // Defensive fallback: parts only become 'twitch-link' after a
          // successful parseTwitchUrl, so this branch shouldn't occur.
          previews.push(
            <a
              key={`tw-${i}`}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="twitch-link-fallback"
            >
              {url}
            </a>,
          );
          return;
        }
        previews.push(
          <TwitchLinkPreview key={`tw-${i}-${parsed.href}`} url={url} parts={parsed} />,
        );
        return;
      }
      if (part.type === "emoji") {
        content.push(
          variant === "unified" ? (
            <img
              key={`e-${i}`}
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
              key={`e-${i}`}
              src={part.url}
              alt={part.alt || part.emojiText || "🙂"}
              title={part.emojiText || part.alt}
              className={`yt-emoji ${part.isCustomEmoji ? "custom" : "standard"}`}
              loading="lazy"
            />
          ),
        );
        return;
      }
      // Keys use the original part index, so partitioning keeps them unique
      // and stable across re-renders.
      content.push(renderText(part.text ?? "", `t-${i}`));
    });
    // Twitch-link previews render after all other parts so they always sit
    // at the bottom of the message, never mid-text where the URL appeared.
    return [...content, ...previews];
  }, [parts, variant, renderText]);

  return <span>{rendered}</span>;
}
