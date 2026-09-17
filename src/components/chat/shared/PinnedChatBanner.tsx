import { useMemo } from "react";
import { FaThumbtack } from "react-icons/fa";
import {
  parseMessageWithEmotes,
  useEmoteMapVersion,
} from "../../../lib/emotes";
import "../../../styles/chat/PinnedChatBanner.css";
import "../../../styles/chat/BannerShell.css";
import BannerShell from "./BannerShell";
import type { PinnedChatHighlightState } from "./bannerTypes";

export type { PinnedChatHighlightState } from "./bannerTypes";

interface PinnedChatBannerProps {
  highlight: PinnedChatHighlightState;
  onDismiss: () => void;
}

/** Twitch-styled banner rendering the streamer's currently-pinned message
 *  above the chat. Behaves like a sticky highlight: persists until the user
 *  double-clicks the close button or the streamer unpins the message.
 *
 *  The message body is rendered through the same `parseMessageWithEmotes`
 *  helper used by the regular chat line, but without Twitch emote position
 *  data (the GQL `pinnedChatMessages` endpoint only returns plain text). That
 *  still resolves 7TV / BTTV / FFZ emotes, @mentions, autolinked URLs, and
 *  Unicode emoji via Twemoji. Output is sanitised by DOMPurify before
 *  insertion. */
export default function PinnedChatBanner({
  highlight,
  onDismiss,
}: PinnedChatBannerProps) {
  const senderStyle = useMemo(
    () => (highlight.senderColor ? { color: highlight.senderColor } : undefined),
    [highlight.senderColor],
  );
  // The pinned-message payload from GQL is plain text only — no Twitch
  // emote positions — so we go through the third-party emote + link +
  // @mention path of `parseMessageWithEmotes` by passing no twitchEmotes.
  // Subscribe to the emote map version so a banner that rendered before the
  // 7TV/BTTV/FFZ/Twitch maps finished loading re-parses (and re-renders its
  // emotes) once a source resolves — the banner can persist for hours, so it
  // must not stay stuck on the emote-less parse from page load.
  const emoteVersion = useEmoteMapVersion();
  const messageHtml = useMemo(
    () => parseMessageWithEmotes(highlight.message),
    [highlight.message, emoteVersion],
  );

  return (
    <BannerShell
      tone="pinned"
      ariaLive="polite"
      closeAriaLabel="Dismiss pinned message"
      badge={<span className="pinned-banner-badge">PINNED</span>}
      icon={<FaThumbtack className="pinned-banner-icon" size={12} />}
      title={
        <span className="pinned-banner-sender" style={senderStyle}>
          {highlight.senderDisplayName}
        </span>
      }
      onDismiss={onDismiss}
    >
      <div
        className="pinned-banner-message"
        dangerouslySetInnerHTML={{ __html: messageHtml }}
      />
    </BannerShell>
  );
}
