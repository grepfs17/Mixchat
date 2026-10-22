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

/** Sticky banner for the streamer's pinned message. It persists until the user
 *  double-clicks close or the streamer unpins.
 *
 *  GQL only returns plain text (no Twitch emote positions), so the body goes
 *  through `parseMessageWithEmotes` without twitchEmotes, still resolving
 *  7TV/BTTV/FFZ emotes, mentions, links, and Twemoji, sanitised by DOMPurify. */
export default function PinnedChatBanner({
  highlight,
  onDismiss,
}: PinnedChatBannerProps) {
  const senderStyle = useMemo(
    () => (highlight.senderColor ? { color: highlight.senderColor } : undefined),
    [highlight.senderColor],
  );
  // Subscribe to the emote map version so a banner rendered before the
  // 7TV/BTTV/FFZ/Twitch maps load re-parses its emotes once a source
  // resolves, pinned banners can persist for hours.
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
