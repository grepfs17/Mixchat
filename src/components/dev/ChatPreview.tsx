import { useEffect, useMemo, useState } from "react";
import {
  ModerationContext,
  type ModerationContextValue,
} from "../../contexts/ModerationContext";
import { TwitchMessageContent } from "../chat/shared/TwitchMessageContent";
import { YouTubeMessageContent } from "../chat/shared/YouTubeMessageContent";
import PinnedChatBanner from "../chat/shared/PinnedChatBanner";
import HypeTrainBanner from "../chat/shared/HypeTrainBanner";
import PollBanner from "../chat/shared/PollBanner";
import PredictionBanner from "../chat/shared/PredictionBanner";
import CelebrationBanner from "../chat/shared/CelebrationBanner";
import { applyTheme } from "../../lib/themes";
import {
  FONT_FAMILY_MAP,
  THEME_OPTIONS,
  type ChatTheme,
  type TwitchMessage,
} from "../../lib/types";
import type { YTMessage } from "../chat/unified/types";
import type {
  CelebrationState,
  HypeTrainState,
  PinnedChatHighlightState,
  PollState,
  PredictionState,
} from "../chat/shared/bannerTypes";
import "../../styles/DevChatPreview.css";

/* ------------------------------------------------------------------ */
/* Fabricated media helpers (data URIs, no network requests)          */
/* ------------------------------------------------------------------ */

function svgUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function avatarUri(label: string, bg: string): string {
  const initial = label.charAt(0).toUpperCase();
  return svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="20" fill="${bg}"/><text x="20" y="26" font-family="sans-serif" font-size="18" font-weight="700" fill="#ffffff" text-anchor="middle">${initial}</text></svg>`,
  );
}

function badgeUri(label: string, bg: string): string {
  return svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"><rect width="18" height="18" rx="3" fill="${bg}"/><text x="9" y="13" font-family="sans-serif" font-size="9" font-weight="700" fill="#ffffff" text-anchor="middle">${label}</text></svg>`,
  );
}

const BADGES: Record<string, string> = {
  broadcaster: badgeUri("B", "#e91916"),
  moderator: badgeUri("M", "#00ad03"),
  vip: badgeUri("V", "#e005b9"),
  subscriber: badgeUri("S", "#9146ff"),
  prime: badgeUri("P", "#008cff"),
  turbo: badgeUri("T", "#9146ff"),
};

function badgeSet(...names: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of names) out[n] = BADGES[n];
  return out;
}

/* ------------------------------------------------------------------ */
/* Fabricated message data                                             */
/* ------------------------------------------------------------------ */

let seq = 0;
function twitch(partial: Partial<TwitchMessage> & { author: string }): TwitchMessage {
  seq += 1;
  return {
    id: `tw-${seq}`,
    platform: "twitch",
    content: "",
    timestamp: new Date(2026, 0, 1, 12, 0, seq),
    authorColor: "#a970ff",
    userId: `u-${seq}`,
    ...partial,
  };
}

function yt(
  partial: Partial<YTMessage> & { author: string },
): YTMessage {
  seq += 1;
  return {
    id: `yt-${seq}`,
    parts: [],
    timestamp: new Date(2026, 0, 1, 12, 0, seq),
    ...partial,
  };
}

const CHAT_TWITCH: Array<{ label: string; msg: TwitchMessage }> = [
  {
    label: "Normal",
    msg: twitch({
      author: "pixel_panda",
      content: "Hello everyone! How is the stream going? 🙂",
      authorColor: "#a970ff",
    }),
  },
  {
    label: "Current user",
    msg: twitch({
      author: "you_here",
      userName: "you_here",
      content: "I just joined the stream!",
      authorColor: "#3b82f6",
      isCurrentUser: true,
    }),
  },
  {
    label: "Badges + bot",
    msg: twitch({
      author: "Nightbot",
      content: "Commands: !song, !queue, !lurk",
      authorColor: "#00ad03",
      isBot: true,
      badges: badgeSet("moderator"),
    }),
  },
  {
    label: "Broadcaster",
    msg: twitch({
      author: "Streamer",
      content: "Welcome in, chat!",
      authorColor: "#e91916",
      badges: badgeSet("broadcaster"),
    }),
  },
  {
    label: "Mention",
    msg: twitch({
      author: "loyal_viewer",
      content: "@you_here welcome back!",
      mentionsUser: true,
      authorColor: "#f472b6",
    }),
  },
  {
    label: "Reply",
    msg: twitch({
      author: "chatter_two",
      content: "I agree with that take",
      authorColor: "#38bdf8",
      replyTo: {
        id: "tw-original",
        author: "pixel_panda",
        content: "this level is impossible",
      },
    }),
  },
  {
    label: "Long / wrapping",
    msg: twitch({
      author: "essay_writer",
      content:
        "Here is a deliberately long message so we can check how the author name, badges and timestamp behave when the text wraps onto several lines in the chat column.",
      badges: badgeSet("subscriber"),
      authorColor: "#facc15",
    }),
  },
  {
    label: "Deleted",
    msg: twitch({
      author: "rule_breaker",
      content: "this message was removed",
      isDeleted: true,
      authorColor: "#94a3b8",
    }),
  },
  {
    label: "Shared chat",
    msg: twitch({
      author: "from_other_channel",
      content: "hello from the shared chat!",
      authorColor: "#4ade80",
      sourceChannelId: "98765432",
      sourceChannelLogin: "partner_channel",
      sourceChannelAvatar: avatarUri("P", "#4ade80"),
    }),
  },
];

const EVENTS_TWITCH: Array<{ label: string; msg: TwitchMessage }> = [
  {
    label: "Highlight",
    msg: twitch({
      author: "highlighted_user",
      content: "This message was highlighted by the streamer",
      messageType: "highlight",
      authorColor: "#fbbf24",
    }),
  },
  {
    label: "Subscription",
    msg: twitch({
      author: "new_sub",
      content: "subscribed for 1 month (Prime)",
      messageType: "subscription",
      authorColor: "#bf94ff",
    }),
  },
  {
    label: "Resub",
    msg: twitch({
      author: "loyal_sub",
      content: "subscribed for 12 months (Tier 2)",
      messageType: "resub",
      authorColor: "#bf94ff",
    }),
  },
  {
    label: "Gift sub",
    msg: twitch({
      author: "generous_gifter",
      content: "gifted 5 subs to the community!",
      messageType: "subgift",
      authorColor: "#bf94ff",
    }),
  },
  {
    label: "Cheer",
    msg: twitch({
      author: "bit_cheerer",
      content: "Cheer100 great stream!",
      messageType: "cheer",
      authorColor: "#FFB700",
    }),
  },
  {
    label: "Raid",
    msg: twitch({
      author: "raider",
      content: "raided with 250 viewers!",
      messageType: "raid",
      authorColor: "#4ade80",
    }),
  },
  {
    label: "Watch streak",
    msg: twitch({
      author: "streaker",
      content: "watched 5 streams in a row",
      messageType: "watch-streak",
      authorColor: "#f472b6",
    }),
  },
  {
    label: "Announcement",
    msg: twitch({
      author: "Streamer",
      content: "Announcement: stream is moving to 8 PM tonight",
      messageType: "announcement",
      authorColor: "#38bdf8",
      badges: badgeSet("broadcaster"),
    }),
  },
  {
    label: "Channel points",
    msg: twitch({
      author: "point_spender",
      content: "redeemed Hydrate!",
      messageType: "redemption",
      rewardTitle: "Hydrate!",
      rewardCost: 250,
      authorColor: "#c9a2ff",
    }),
  },
  {
    label: "Reward gift",
    msg: twitch({
      author: "gift_giver",
      content: "gifted a reward to the channel",
      messageType: "reward-gift",
      rewardTitle: "VIP for a day",
      authorColor: "#c9a2ff",
    }),
  },
  {
    label: "First message",
    msg: twitch({
      author: "first_timer",
      content: "first time here, loving the vibes!",
      isFirstMessage: true,
      authorColor: "#2dd4bf",
    }),
  },
  {
    label: "Notice",
    msg: twitch({
      author: "twitch",
      content: "This room is now in followers-only mode.",
      messageType: "notice",
      authorColor: "#94a3b8",
    }),
  },
  {
    label: "Timeout",
    msg: twitch({
      author: "mod",
      content: "user was timed out for 600 seconds",
      messageType: "timeout",
      targetUsername: "spammer",
      authorColor: "#f87171",
    }),
  },
  {
    label: "Ban",
    msg: twitch({
      author: "mod",
      content: "user was permanently banned",
      messageType: "ban",
      targetUsername: "rule_breaker",
      authorColor: "#ef4444",
    }),
  },
  {
    label: "AutoMod",
    msg: twitch({
      author: "suspicious_link",
      content: "check out this totally legit link",
      messageType: "automod",
      authorColor: "#f97316",
    }),
  },
  {
    label: "Message effect",
    msg: twitch({
      author: "power_user",
      content: "this message has a power-up effect!",
      powerUpType: "message_effect",
      authorColor: "#00d4aa",
    }),
  },
  {
    label: "Celebration",
    msg: twitch({
      author: "big_cheerer",
      content: "CELEBRATION!",
      powerUpType: "celebration",
      authorColor: "#ff6b9d",
    }),
  },
  {
    label: "Gigantified emote",
    msg: twitch({
      author: "emote_fan",
      content: "PogChamp",
      isGigantifiedEmote: true,
      authorColor: "#00d4aa",
    }),
  },
];

const preloaded: TwitchMessage = twitch({
  author: "history_bot",
  content: "older preloaded message",
  isPreloaded: true,
  authorColor: "#94a3b8",
});

const CHAT_YOUTUBE: Array<{ label: string; msg: YTMessage }> = [
  {
    label: "Normal",
    msg: yt({
      author: "yt_viewer",
      authorAvatar: avatarUri("Y", "#ff0000"),
      parts: [{ type: "text", text: "Hello from YouTube! 👋" }],
    }),
  },
  {
    label: "Member",
    msg: yt({
      author: "yt_member",
      authorAvatar: avatarUri("M", "#0f9d58"),
      authorIsMember: true,
      badges: { member: BADGES.subscriber },
      parts: [{ type: "text", text: "Love the stream!" }],
    }),
  },
  {
    label: "Moderator",
    msg: yt({
      author: "yt_mod",
      authorAvatar: avatarUri("D", "#0f9d58"),
      authorIsModerator: true,
      authorChannelId: "yt-mod-1",
      parts: [{ type: "text", text: "Keep it friendly in here." }],
    }),
  },
  {
    label: "Deleted",
    msg: yt({
      author: "yt_removed",
      authorAvatar: avatarUri("X", "#6b7280"),
      isDeleted: true,
      deletedByText: "Message deleted by a moderator",
      parts: [],
    }),
  },
  {
    label: "Optimistic",
    msg: yt({
      author: "you_here",
      authorAvatar: avatarUri("Y", "#3b82f6"),
      optimistic: true,
      parts: [{ type: "text", text: "sending to YouTube..." }],
    }),
  },
];

const EVENTS_YOUTUBE: Array<{ label: string; msg: YTMessage }> = [
  {
    label: "Super Chat",
    msg: yt({
      author: "big_spender",
      authorAvatar: avatarUri("B", "#1e88e5"),
      superchat: { amount: "$5.00", color: "#1e88e5" },
      parts: [{ type: "text", text: "Great content, keep it up!" }],
    }),
  },
  {
    label: "Membership",
    msg: yt({
      author: "new_member",
      authorAvatar: avatarUri("N", "#0f9d58"),
      messageType: "membership",
      superchat: { amount: "$4.99", color: "#0f9d58" },
      parts: [{ type: "text", text: "became a member!" }],
    }),
  },
  {
    label: "Gift purchase",
    msg: yt({
      author: "gift_buyer",
      authorAvatar: avatarUri("G", "#9c27b0"),
      messageType: "gift-purchase",
      giftCount: 5,
      parts: [],
    }),
  },
  {
    label: "Gift received",
    msg: yt({
      author: "gift_receiver",
      authorAvatar: avatarUri("G", "#4caf50"),
      messageType: "gift-redemption",
      recipientName: "gift_receiver",
      parts: [],
    }),
  },
  {
    label: "Raid / redirect",
    msg: yt({
      author: "raider_yt",
      authorAvatar: avatarUri("R", "#ff9800"),
      messageType: "redirect",
      parts: [{ type: "text", text: "joined from another live stream" }],
    }),
  },
  {
    label: "Automod",
    msg: yt({
      author: "held_user",
      authorAvatar: avatarUri("H", "#fbbf24"),
      messageType: "automod",
      authorChannelId: "yt-held-1",
      parts: [{ type: "text", text: "held for review by automod" }],
    }),
  },
  {
    label: "Removed",
    msg: yt({
      author: "removed_user",
      authorAvatar: avatarUri("R", "#ef4444"),
      messageType: "removed",
      isDeleted: true,
      deletedByText: "Message removed by author",
      parts: [],
    }),
  },
  {
    label: "Raid host",
    msg: yt({
      author: "host_channel",
      authorAvatar: avatarUri("H", "#4ade80"),
      messageType: "raidHost",
      parts: [{ type: "text", text: "is now hosting this channel" }],
    }),
  },
];

/* ------------------------------------------------------------------ */
/* Fabricated banner data                                              */
/* ------------------------------------------------------------------ */

const PINNED: PinnedChatHighlightState = {
  channel: "mixchat",
  messageId: "pinned-1",
  senderLogin: "mod_sue",
  senderDisplayName: "mod_sue",
  senderColor: "#7dd3fc",
  message: "Welcome to the stream! Check !commands and have fun 🎉",
  pinnedAt: new Date(2026, 0, 1, 12, 0, 0),
};

const HYPE_TRAIN: HypeTrainState = {
  level: 3,
  progress: 720,
  goal: 1000,
  totalPoints: 4820,
  topContributors: [
    { displayName: "pixel_panda", points: 1500 },
    { displayName: "loyal_viewer", points: 980 },
    { displayName: "chatter_two", points: 640 },
  ],
  endsAt: new Date(Date.now() + 5 * 60 * 1000),
};

const POLL: PollState = {
  id: "poll-1",
  title: "What should we play next?",
  choices: [
    { id: "c1", title: "Minecraft", votes: 120 },
    { id: "c2", title: "Elden Ring", votes: 84 },
    { id: "c3", title: "Smash Bros", votes: 41 },
  ],
  totalVotes: 245,
  endsAt: new Date(Date.now() + 3 * 60 * 1000),
  status: "ACTIVE",
};

const PREDICTION_ACTIVE: PredictionState = {
  id: "pred-1",
  title: "Will the boss go down this try?",
  outcomes: [
    {
      id: "o1",
      title: "Yes",
      color: "blue",
      users: 42,
      channelPoints: 12000,
    },
    {
      id: "o2",
      title: "No",
      color: "pink",
      users: 18,
      channelPoints: 4200,
    },
  ],
  totalPoints: 16200,
  totalUsers: 60,
  status: "active",
  endsAt: new Date(Date.now() + 2 * 60 * 1000),
};

const PREDICTION_RESOLVED: PredictionState = {
  ...PREDICTION_ACTIVE,
  id: "pred-2",
  status: "resolved",
  winningOutcomeId: "o1",
};

const CELEBRATION: CelebrationState = {
  id: "celeb-1",
  userName: "big_cheerer",
  userDisplayName: "big_cheerer",
  bitsUsed: 500,
  totalBitsUsed: 1500,
  messageEffectId: null,
  endsAt: new Date(Date.now() + 2 * 60 * 1000),
};

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

const noop = () => {};
const noopTwitch = (_msg: TwitchMessage) => {};
const noopContext = (
  _e: React.MouseEvent,
  _msg: TwitchMessage,
) => {};

function TwitchRow({
  label,
  msg,
  index,
  previousMsg,
  children,
}: {
  label: string;
  msg: TwitchMessage;
  index: number;
  previousMsg?: TwitchMessage | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="dev-preview-row">
      <span className="dev-preview-row-label">{label}</span>
      <div className="dev-preview-row-content">
        <TwitchMessageContent
          msg={msg}
          index={index}
          previousMsg={previousMsg ?? null}
          currentUserDisplayName="you_here"
          onCopy={noopTwitch}
          onTimeoutMenu={noop}
          onContextMenu={noopContext}
          onScrollToMessage={noop}
          onTouchStart={noopTwitch}
          onTouchEnd={noopTwitch}
          onTouchMove={noop}
        >
          {children}
        </TwitchMessageContent>
      </div>
    </div>
  );
}

function YouTubeRow({
  label,
  msg,
  index,
}: {
  label: string;
  msg: YTMessage;
  index: number;
}) {
  return (
    <div className="dev-preview-row">
      <span className="dev-preview-row-label">{label}</span>
      <div className="dev-preview-row-content">
        <YouTubeMessageContent
          msg={msg}
          index={index}
          showPlatformTag
          variant="unified"
          renderThirdPartyEmotes={false}
        />
      </div>
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="dev-preview-card">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Main preview                                                        */
/* ------------------------------------------------------------------ */

export default function ChatPreview() {
  const [theme, setTheme] = useState<ChatTheme>("default");
  const [fontSize, setFontSize] = useState(14);
  const [modMode, setModMode] = useState(false);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const moderationValue: ModerationContextValue = useMemo(
    () => ({
      isModerator: modMode,
      modModeActive: modMode,
      compactActions: false,
      keepModActionsVisible: false,
      modActionsFirst: false,
      doubleClickConfirmModActions: false,
      isYouTubeModerator: modMode,
      youtubeModModeActive: modMode,
      youtubeVideoId: "dQw4w9WgXcQ",
      youtubeOwnChannelId: null,
      onDeleteMessage: noop,
      onBanUser: noop,
      onTimeoutUser: noop,
      onUntimeoutUser: noop,
      onWarnUser: noop,
      onPinMessage: noop,
      onDeleteYouTubeMessage: noop,
      onBanYouTubeUser: noop,
      onTimeoutYouTubeUser: noop,
      onSetModMode: noop,
    }),
    [modMode],
  );

  const sharedChatMarker = (
    <span
      title="From partner_channel's chat (Shared Chat)"
      style={{
        display: "inline-flex",
        width: 16,
        height: 16,
        borderRadius: "50%",
        border: "2px solid #4ade80",
        marginRight: 4,
        flexShrink: 0,
        alignSelf: "center",
      }}
    />
  );

  return (
    <ModerationContext.Provider value={moderationValue}>
      <div
        className="dev-preview"
        style={
          {
            "--chat-font-size": `${fontSize}px`,
            "--chat-font-family": FONT_FAMILY_MAP.inter,
          } as React.CSSProperties
        }
      >
        <header className="dev-preview-header">
          <div>
            <h1 className="dev-preview-title">Chat styling preview</h1>
            <p className="dev-preview-subtitle">
              Dev-only. Every message type, event and banner rendered with the
              real components.
            </p>
          </div>
          <div className="dev-preview-controls">
            <label className="dev-preview-control">
              Theme
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value as ChatTheme)}
              >
                {THEME_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="dev-preview-control">
              Font {fontSize}px
              <input
                type="range"
                min={12}
                max={20}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
              />
            </label>
            <label className="dev-preview-control">
              <input
                type="checkbox"
                checked={modMode}
                onChange={(e) => setModMode(e.target.checked)}
              />
              Mod tools
            </label>
          </div>
        </header>

        <div className="dev-preview-grid">
          <SectionCard title="Twitch · chat">
            <div className="dev-preview-list">
              {CHAT_TWITCH.map((row, i) => (
                <TwitchRow
                  key={row.msg.id}
                  label={row.label}
                  msg={row.msg}
                  index={i}
                  previousMsg={i > 0 ? CHAT_TWITCH[i - 1].msg : null}
                >
                  {row.label === "Shared chat" ? sharedChatMarker : undefined}
                </TwitchRow>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Twitch · events">
            <div className="dev-preview-list">
              {EVENTS_TWITCH.map((row, i) => (
                <TwitchRow
                  key={row.msg.id}
                  label={row.label}
                  msg={row.msg}
                  index={i}
                  previousMsg={i > 0 ? EVENTS_TWITCH[i - 1].msg : null}
                />
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Twitch · live marker">
            <div className="dev-preview-list">
              <TwitchRow
                label="Live divider"
                msg={CHAT_TWITCH[0].msg}
                index={1}
                previousMsg={preloaded}
              />
            </div>
            <p className="dev-preview-note">
              A message that follows preloaded history renders the “Live”
              divider.
            </p>
          </SectionCard>

          <SectionCard title="YouTube · chat">
            <div className="dev-preview-list">
              {CHAT_YOUTUBE.map((row, i) => (
                <YouTubeRow
                  key={row.msg.id}
                  label={row.label}
                  msg={row.msg}
                  index={i}
                />
              ))}
            </div>
          </SectionCard>

          <SectionCard title="YouTube · events">
            <div className="dev-preview-list">
              {EVENTS_YOUTUBE.map((row, i) => (
                <YouTubeRow
                  key={row.msg.id}
                  label={row.label}
                  msg={row.msg}
                  index={i}
                />
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Chat status bar">
            <div className="dev-preview-statusbar">
              <span className="platform-status platform-status--connected">
                <span className="platform-status-dot" />
                <span className="platform-status-text">Twitch</span>
              </span>
              <span className="platform-status platform-status--connected">
                <span className="platform-status-dot" />
                <span className="platform-status-text">YouTube Live</span>
              </span>
              <span className="platform-status platform-status--loading">
                <span className="platform-status-dot platform-status-dot--loading" />
                <span className="platform-status-text">
                  YouTube: Reconnecting…
                </span>
              </span>
              <span className="platform-status platform-status--error">
                <span className="platform-status-dot" />
                <span className="platform-status-text">YouTube: error</span>
              </span>
            </div>
          </SectionCard>

          <SectionCard title="Overlay stack · pinned & hype">
            <div className="dev-preview-stack">
              <PinnedChatBanner highlight={PINNED} onDismiss={noop} />
              <HypeTrainBanner hypeTrain={HYPE_TRAIN} onDismiss={noop} />
            </div>
            <p className="dev-preview-note">
              Banners and streamer-tool bars share the same edge margin, so
              their width lines up.
            </p>
          </SectionCard>

          <SectionCard title="Overlay stack · polls">
            <div className="dev-preview-stack">
              <PollBanner poll={POLL} onDismiss={noop} />
            </div>
          </SectionCard>

          <SectionCard title="Overlay stack · predictions">
            <div className="dev-preview-stack">
              <PredictionBanner
                prediction={PREDICTION_ACTIVE}
                onDismiss={noop}
              />
              <PredictionBanner
                prediction={PREDICTION_RESOLVED}
                onDismiss={noop}
              />
            </div>
          </SectionCard>

          <SectionCard title="Overlay stack · celebration">
            <div className="dev-preview-stack">
              <CelebrationBanner celebration={CELEBRATION} onDismiss={noop} />
            </div>
          </SectionCard>
        </div>
      </div>
    </ModerationContext.Provider>
  );
}
