import type { APIRoute } from "astro";
import { YTNodes } from "youtubei.js";
import { getInnertube } from "../../lib/youtube";
import { checkRateLimit } from "../../lib/rateLimit";
import { isPlayabilityError } from "./youtube-stream-chat.playability";
import { IS_TWITCH_ONLY, twitchOnlyResponse } from "../../lib/constants";

interface MessagePart {
  type: "text" | "emoji";
  text?: string;
  url?: string;
  alt?: string;
  emojiText?: string;
  isCustomEmoji?: boolean;
}

interface ChatMessage {
  id: string;
  author: string;
  authorChannelId?: string;
  authorAvatar?: string;
  badges?: Record<string, string>;
  parts: MessagePart[];
  timestamp: Date;
  messageType?: string;
  giftCount?: number;
  recipientName?: string;
  isDeleted?: boolean;
  deletedByText?: string;
  authorIsModerator?: boolean;
  authorIsOwner?: boolean;
  authorIsMember?: boolean;
  /** Username of the target when this message is a synthetic system note
   *  about a moderator-driven removal (e.g. "X was removed from the chat"). */
  targetUsername?: string;
  superchat?: {
    amount: string;
    color: string;
    sticker?: {
      url?: string;
      alt?: string;
    };
  };
}

/** Maximum number of concurrent YouTube live chat sessions held in memory. */
const MAX_ACTIVE_SESSIONS = parseInt(process.env.YT_MAX_SESSIONS || "200", 10);

/** Maximum idle time (ms) before a session is reaped. */
const MAX_IDLE_MS = 10 * 60_000;

/**
 * Maximum number of messages retained per session for replay to newly
 * connected clients. Mirrors the client's default chat cap.
 */
const MAX_SESSION_MESSAGES = 300;

/** Cooldown after a 403 block. */
const CHAT_FAILURE_COOLDOWN_MS = parseInt(
  process.env.YT_CHAT_COOLDOWN_MS || "60000",
  10,
);
const blockedChatFailures = new Map<string, number>();

/**
 * Transient YouTube blocks (proxy 503s / bot checks) are recoverable after
 * a short backoff — unlike hard 403s, the underlying session is still good,
 * so we reconnect the LiveChat in place instead of tearing it down.
 */
const TRANSIENT_BLOCK_BASE_MS = 30_000;
const TRANSIENT_BLOCK_MAX_MS = 5 * 60_000;
const TRANSIENT_BLOCK_MAX_ATTEMPTS = 8;

/** videoId -> { until, attempt } backoff state for transient blocks. */
const transientChatFailures = new Map<
  string,
  { until: number; attempt: number }
>();

/**
 * True when a LiveChat error is a *recoverable* YouTube block — typically a
 * proxy 503 ("YouTube temporarily blocked"), a bot-check response that
 * youtubei.js fails to parse as a chat continuation, or a transient rate
 * limit. Unlike 403s (which force a session cleanup), these clear up after
 * a short backoff, so the chat can reconnect in place.
 */
export function isTransientChatBlock(msg: string): boolean {
  return (
    /incremental continuation/.test(msg) ||
    /temporarily blocked/i.test(msg) ||
    /YouTube blocked/i.test(msg) ||
    /\b503\b/.test(msg) ||
    /\b429\b/.test(msg) ||
    /Request failed with status code (?:503|429)/.test(msg)
  );
}

/** Cancel a pending transient-block reconnect for a session. */
function clearChatRestart(session: ChatSession, videoId: string): void {
  if (session.restartTimer) {
    clearTimeout(session.restartTimer);
    session.restartTimer = null;
  }
  transientChatFailures.delete(videoId);
}

/**
 * Cooldown for terminal playability errors (video unavailable, private,
 * removed, etc.). These don't change with retries, so we cache the failure
 * for a few minutes to stop hammering YouTube.
 */
const PLAYABILITY_ERROR_COOLDOWN_MS = parseInt(
  process.env.YT_PLAYABILITY_COOLDOWN_MS || "100000",
  10,
);
const playabilityErrors = new Map<string, { message: string; until: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, expiresAt] of blockedChatFailures) {
    if (now > expiresAt) blockedChatFailures.delete(key);
  }
  for (const [key, entry] of playabilityErrors) {
    if (now > entry.until) playabilityErrors.delete(key);
  }
}, 120_000);

setInterval(() => {
  reapIdleSessions();
}, 60_000);

// SSE client waiting for messages
interface SSEClient {
  id: string;
  controller: ReadableStreamDefaultController;
  lastMessageId: string | null;
  connectedAt: number;
}

const SESSION_GRACE_PERIOD_MS = 30_000;

// Shared session for a videoId
interface ChatSession {
  chat: any;
  messages: ChatMessage[];
  seenIds: Set<string>;
  /**
   * Reverse index channelId -> most recent display name observed for that
   * channel. Used to render "X was removed from the chat" system notes when
   * a moderator removes a user's messages — YouTube's stream action only
   * carries the channel id, so we have to recover the author's display name
   * from the messages we've already seen.
   */
  authorByChannel: Map<string, string>;/**
 * Cooldown so we only emit one system removal note per "(videoId, channelId)"
 * pair. InnerTube sometimes re-publishes the same moderator removal action
 * (e.g. on session reconnect or replay), which would otherwise spam the
 * chat with duplicates of the same system message. Dedupe is keyed on the
 * event identity (no TTL) — once a removal note has been emitted for a
 * `(actionKind, channelId)`, the same pair will not fire again for the
 * lifetime of the chat session.
 */
  recentRemovals: Set<string>;
  /**
   * Cooldown so duplicate host-handoff banners (which can fire repeatedly
   * for the same event across reconnects and InnerTube polls) only
   * translate to a single chat-list announcement per event pair. Like
   * `recentRemovals`, dedupe is keyed on the event identity with no TTL
   * for the lifetime of the chat session.
   */
  recentHostHandoffs: Set<string>;
  /** Sticky map of message ids marked deleted; survives buffer shifts. */
  deletedIds: Map<string, string>;
  clients: Map<string, SSEClient>;
  lastUpdate: number;
  destroyTimer: ReturnType<typeof setTimeout> | null;
  /** Pending timer for an in-place reconnect after a transient block. */
  restartTimer: ReturnType<typeof setTimeout> | null;
  ready: Promise<void>;
}

const activeLiveChats = new Map<string, ChatSession>();

function shutdownActiveSessions() {
  for (const [key, session] of activeLiveChats) {
    clearChatRestart(session, key);
    for (const client of session.clients.values()) {
      try {
        client.controller.close();
      } catch {}
    }
    try {
      session.chat?.stop();
    } catch {}
  }
  console.log(
    `[YouTube Chat] Graceful shutdown — stopped ${activeLiveChats.size} sessions`,
  );
  activeLiveChats.clear();
}
process.on("SIGTERM", shutdownActiveSessions);
process.on("SIGINT", shutdownActiveSessions);

// SSE helpers
function sseEvent(data: string, event?: string, id?: string): string {
  let out = "";
  if (event) out += `event: ${event}\n`;
  if (id) out += `id: ${id}\n`;
  out += `data: ${data}\n\n`;
  return out;
}

function broadcast(
  session: ChatSession,
  event: string,
  data: unknown,
  msgId?: string,
) {
  const payload = JSON.stringify(data);
  const deadClients: string[] = [];
  for (const [clientId, client] of session.clients) {
    try {
      client.controller.enqueue(sseEvent(payload, event, msgId));
    } catch {
      deadClients.push(clientId);
    }
  }
  for (const id of deadClients) {
    session.clients.delete(id);
  }
}
// Parsers
function ARGBtoHex(argb: number): string {
  const unsigned = argb >>> 0;
  const hex = (unsigned & 0xffffff).toString(16).padStart(6, "0");
  return `#${hex}`;
}

/**
 * Synthesize a system message announcing a moderator-driven user removal.
 * YouTube's InnerTube action stream surfaces `RemoveChatItemByAuthorAction`
 * and `MarkChatItemsByAuthorAsDeletedAction` for every moderator who removes
 * a user's messages — ourselves, an in-stream bot, or any other moderator
 * connected to the chat. The action doesn't distinguish ban vs. timeout so
 * we label it generically; the action is observable in the messageType.
 *
 * The server scrolls the existing `messages` buffer for the most recent
 * author display name tied to the affected channel id so the note has a
 * human-readable target ("tofumushu was removed from the chat").
 */
/**
 * Session-scoped dedupe gate for synthetic system notes. Returns true the
 * FIRST time it's called for a given key within the chat session, and
 * false on every subsequent call — regardless of how much wall-clock time
 * has passed. This is what guarantees that an InnerTube re-poll, a
 * reconnect, or a delayed replay of the same moderator action ONLY
 * produces ONE chat-list announcement per session, instead of one per
 * poll cycle.
 *
 * Exported via the test bridge so unit tests can assert the gate is
 * reentrant but not re-emitting.
 */
export function shouldEmitSystemNote(
  dedupeSet: Set<string>,
  key: string,
): boolean {
  if (dedupeSet.has(key)) return false;
  dedupeSet.add(key);
  return true;
}

export function createSystemRemovalMessage(
  authorName: string | undefined,
  channelId: string | undefined,
  channelIdToAuthor: Map<string, string>,
  actionKind: "removed" | "deleted",
): ChatMessage {
  const resolvedName =
    authorName ||
    (channelId ? channelIdToAuthor.get(channelId) : undefined) ||
    "A user";
  const label =
    actionKind === "deleted"
      ? `${resolvedName}'s messages were removed by a moderator`
      : `${resolvedName} was removed from the chat`;
  return {
    id: `system-${actionKind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    author: "System",
    authorChannelId: undefined,
    authorAvatar: undefined,
    badges: {},
    parts: [{ type: "text", text: label }],
    timestamp: new Date(),
    messageType: actionKind === "deleted" ? "mod-hidden" : "removed",
    targetUsername: resolvedName,
    authorIsModerator: false,
    authorIsOwner: false,
    authorIsMember: false,
  };
}

function parseRuns(runs: any[]): MessagePart[] {
  const parts: MessagePart[] = [];
  for (const run of runs) {
    if (run.emoji) {
      const emoji = run.emoji;
      const name = emoji.shortcuts?.[0] || emoji.emoji_id || "emoji";
      const url = Array.isArray(emoji.image) ? emoji.image[0]?.url : undefined;
      const isCustom = !!(emoji.is_custom ?? emoji.isCustomEmoji);
      if (!isCustom) {
        if (emoji.emoji_id) parts.push({ type: "text", text: emoji.emoji_id });
        continue;
      }
      if (!url) continue;
      parts.push({
        type: "emoji",
        url,
        alt: name,
        emojiText: name,
        isCustomEmoji: true,
      });
    } else {
      parts.push({ type: "text", text: run.text || "" });
    }
  }
  return parts;
}

function parseMessageRuns(msg: any): MessagePart[] {
  const message = msg.message || msg.header_subtext;
  if (!message?.runs) return [];
  return parseRuns(message.runs);
}

function parseTimestamp(msg: any): Date {
  const raw = parseInt(msg.timestamp || msg.timestamp_usec || "0");
  const asMs = new Date(raw);
  const asUs = new Date(raw / 1000);
  const now = new Date();
  return Math.abs(now.getTime() - asMs.getTime()) <
    Math.abs(now.getTime() - asUs.getTime())
    ? asMs
    : asUs;
}

function getBadgeLabel(badge: any): string {
  if (!badge) return "";
  if (typeof badge.label === "string") return badge.label;
  if (typeof badge.tooltip === "string") return badge.tooltip;
  if (typeof badge.icon_type === "string") return badge.icon_type;
  return "";
}

function getBadgeIconUrl(badge: any): string | undefined {
  if (!badge) return undefined;
  if (Array.isArray(badge.custom_thumbnail) && badge.custom_thumbnail[0]) {
    const first = badge.custom_thumbnail[0];
    if (Array.isArray(first?.thumbnails) && first.thumbnails[0]?.url) {
      return first.thumbnails[0].url;
    }
    if (first?.url) return first.url;
  }
  if (Array.isArray(badge.thumbnails) && badge.thumbnails[0]?.url) {
    return badge.thumbnails[0].url;
  }
  return undefined;
}

export function parseBadges(msg: any): Record<string, string> {
  const badges: Record<string, string> = {};
  if (msg.author?.badges) {
    for (const badge of msg.author.badges) {
      const url = getBadgeIconUrl(badge);
      if (url) {
        const label = getBadgeLabel(badge) || "badge";
        badges[label] = url;
      }
    }
  }
  return badges;
}

export function isAuthorModerator(msg: any): boolean {
  // youtubei.js exposes Author.is_moderator and LiveChatAuthorBadge.icon_type
  // for the authoritative moderator signal. Match the same rule used by
  // isAuthorOwner (icon_type === "OWNER" only) to avoid false positives from
  // community badges whose label happens to contain "moderator".
  if (!msg.author) return false;
  if (msg.author.is_moderator) return true;
  if (!msg.author.badges) return false;
  return msg.author.badges.some((b: any) => b?.icon_type === "MODERATOR");
}

export function isAuthorOwner(msg: any): boolean {
  // NOTE: A *verified* author is NOT the broadcaster. The live-chat owner badge
  // is identified by its icon type ("OWNER"); youtubei.js exposes no is_owner
  // flag. Treating verified/verified-artist as owner caused non-mods (any
  // verified channel) to be flagged as the broadcaster.
  if (!msg.author?.badges) return false;
  return msg.author.badges.some((b: any) => {
    if (b?.icon_type === "OWNER") return true;
    return getBadgeLabel(b).toLowerCase() === "owner";
  });
}

function isAuthorMember(msg: any): boolean {
  // The YouTube member badge is identified by its icon_type ("MEMBER" for new
  // streams, "SPONSOR" for legacy). Channel-level membership cannot be derived
  // from regular chat events — only from the badges YouTube attaches to the
  // author's row in the live chat panel.
  if (!msg.author?.badges) return false;
  return msg.author.badges.some((b: any) => {
    if (!b) return false;
    if (b.icon_type === "MEMBER" || b.icon_type === "SPONSOR") return true;
    const label = getBadgeLabel(b).toLowerCase();
    return label === "member" || label === "sponsor";
  });
}

/**
 * Extracts plain text from a youtubei.js `Text` node (used for
 * `deleted_state_message` on MarkChatItemAsDeletedAction and friends).
 * The Text node exposes `.toString()` for simple text and `.runs` for
 * styled segments; we concatenate both for a safe fallback.
 */
function extractDeletedByText(textNode: any): string | undefined {
  if (!textNode) return undefined;
  try {
    if (typeof textNode.toString === "function") {
      const s = textNode.toString();
      if (s && typeof s === "string") return s;
    }
  } catch {}
  if (Array.isArray(textNode.runs)) {
    const out = textNode.runs
      .map((r: any) => (typeof r?.text === "string" ? r.text : ""))
      .join("");
    if (out) return out;
  }
  if (typeof textNode.text === "string") return textNode.text;
  return undefined;
}

/**
 * Detects a "deleted" chat item delivered in the body of an
 * AddChatItemAction or ReplaceChatItemAction. InnerTube sometimes ships
 * a moderator-deleted message as a fresh LiveChatTextMessage whose
 * `message` text is the "deleted by" placeholder. When that pattern is
 * present we return the text; otherwise undefined.
 */
function detectDeletedReplacementText(item: any): string | undefined {
  if (!item) return undefined;
  // LiveChatTextMessage carries its content on `message` (a Text node).
  const text = extractDeletedByText(item.message);
  if (!text) return undefined;
  const lower = text.toLowerCase();
  if (
    lower.startsWith("message deleted by") ||
    lower.startsWith("message removed by") ||
    lower === "this message was deleted by the author." ||
    lower.includes("deleted by")
  ) {
    return text;
  }
  return undefined;
}

function parseTextMessageBase(item: any): ChatMessage {
  return {
    id: item.id,
    author: item.author?.name?.toString() || "Unknown",
    authorChannelId: item.author?.id,
    authorAvatar: Array.isArray(item.author?.thumbnails)
      ? item.author.thumbnails[0]?.url
      : undefined,
    badges: parseBadges(item),
    parts: parseMessageRuns(item),
    timestamp: parseTimestamp(item),
    authorIsModerator: isAuthorModerator(item) || undefined,
    authorIsOwner: isAuthorOwner(item) || undefined,
    authorIsMember: isAuthorMember(item) || undefined,
  };
}

function parseChatItem(item: any): ChatMessage | null {
  if (item.is(YTNodes.LiveChatTextMessage)) {
    return parseTextMessageBase(item);
  }
  if (item.is(YTNodes.LiveChatPaidMessage)) {
    return {
      ...parseTextMessageBase(item),
      superchat: {
        amount: item.purchase_amount?.toString() || "Unknown",
        color: ARGBtoHex(
          item.body_background_color ||
            item.header_background_color ||
            item.card_background_color ||
            0,
        ),
      },
    };
  }
  if (item.is(YTNodes.LiveChatPaidSticker)) {
    const stickerUrl =
      item.sticker?.thumbnails?.[0]?.url || item.sticker?.image?.[0]?.url;
    return {
      id: item.id,
      author: item.author?.name?.toString() || "Unknown",
      authorChannelId: item.author?.id,
      authorAvatar: Array.isArray(item.author?.thumbnails)
        ? item.author.thumbnails[0]?.url
        : undefined,
      badges: parseBadges(item),
      parts: [],
      timestamp: parseTimestamp(item),
      authorIsModerator: isAuthorModerator(item) || undefined,
      authorIsOwner: isAuthorOwner(item) || undefined,
      authorIsMember: isAuthorMember(item) || undefined,
      superchat: {
        amount: item.purchase_amount?.toString() || "Unknown",
        color: ARGBtoHex(
          item.background_color || item.money_chip_background_color || 0,
        ),
        ...(stickerUrl && {
          sticker: {
            url: stickerUrl,
            alt: (item.author?.name?.toString() || "System") + " sticker",
          },
        }),
      },
    };
  }
  if (item.is(YTNodes.LiveChatMembershipItem)) {
    return {
      ...parseTextMessageBase(item),
      messageType: "membership",
      superchat: {
        amount: item.header_subtext?.toString() || "Member",
        color: "#0f9d58",
      },
    };
  }
  if (item.is(YTNodes.LiveChatSponsorshipsGiftPurchaseAnnouncement)) {
    return parseGiftPurchaseAnnouncement(item);
  }
  if (item.is(YTNodes.LiveChatSponsorshipsGiftRedemptionAnnouncement)) {
    return parseGiftRedemptionAnnouncement(item);
  }
  if (item.is(YTNodes.LiveChatAutoModMessage)) {
    return parseAutoModMessage(item);
  }
  return null;
}

function parseAutoModMessage(item: any): ChatMessage | null {
  // Parse the held message content from auto_moderated_item.
  // It can be any chat item type — try recursive parsing first.
  const heldItem = item.auto_moderated_item;
  let held: ChatMessage | null = null;
  if (heldItem) {
    if (typeof heldItem.is === "function") {
      held = parseChatItem(heldItem);
    }
    if (!held && heldItem.author) {
      // Fallback: parse basic fields directly from the held item
      held = parseTextMessageBase(heldItem);
    }
  }

  const headerText =
    item.header_text?.toString() || "Held for review";

  // Extract moderation button endpoints so the moderation API can
  // invoke approve/deny later. Store them on the message for the
  // per-session automod map.
  const buttons: { text: string; is_disabled: boolean }[] =
    Array.isArray(item.moderation_buttons)
      ? item.moderation_buttons.map((b: any) => ({
          text: typeof b.text === "string" ? b.text : "",
          is_disabled: Boolean(b.is_disabled),
        }))
      : [];

  // Store the raw LiveChatAutoModMessage on the session for later
  // moderation API access (approve/deny). The session's automodMap
  // will be populated by the caller (in chat-update / start).
  const msg: ChatMessage & { automodItem?: any; automodButtons?: typeof buttons } = {
    id: item.id,
    author: held?.author || "System",
    authorChannelId: held?.authorChannelId,
    authorAvatar: held?.authorAvatar,
    badges: {},
    parts: held?.parts || [
      { type: "text", text: headerText },
    ],
    timestamp: item.timestamp
      ? new Date(item.timestamp)
      : held?.timestamp || new Date(),
    messageType: "automod",
    automodItem: item,
    automodButtons: buttons,
  };

  return msg;
}

function parseBannerRedirect(banner: any, headerText?: string): ChatMessage | null {
  const contents = banner.contents;
  if (!contents?.is?.(YTNodes.LiveChatBannerRedirect)) return null;

  const parts: MessagePart[] = [];
  if (headerText) {
    parts.push({ type: "text", text: headerText });
  }
  if (contents.banner_message?.runs) {
    parts.push(...parseRuns(contents.banner_message.runs));
  } else if (contents.banner_message?.toString()) {
    parts.push({ type: "text", text: contents.banner_message.toString() });
  }

  const authorAvatar = Array.isArray(contents.author_photo)
    ? contents.author_photo[0]?.url
    : undefined;

  return {
    id: banner.action_id || `redirect-${Date.now()}`,
    author: "System",
    authorAvatar,
    parts,
    timestamp: new Date(),
    messageType: "redirect",
    superchat: {
      amount: contents.inline_action_button?.text || "Redirect",
      color: "#ff9800",
    },
  };
}

/**
 * Synthesize a single-line "Raid host joined: [X]" system note from a
 * host-handoff-style banner. Returns null if the banner is a plain
 * redirect NOTIFY (e.g. community rules) rather than an actual channel
 * hand-off — those should only land as a `redirect` chat-list entry.
 *
 * YouTube doesn't expose a single dedicated YTNode for cross-stream
 * "raid"-style hand-offs, so we detect by structural cues of a redirect
 * to another channel:
 *   - Action button present (redirects through a CTA)
 *   - Author photo present (typical of a channel-card banner)
 *   - Banner text mentions "host", "hosted", "redirect", "joined", or
 *     banner_type indicates a redirect
 * The first two cover every observed InnerTube hand-off banner in the
 * wild; the third is a fallback for localization variants.
 */
export function parseHostHandoffBanner(
  banner: any,
  headerText?: string,
): ChatMessage | null {
  const contents = banner?.contents;
  if (!contents?.is?.(YTNodes.LiveChatBannerRedirect)) return null;

  const hasAuthorPhoto = Array.isArray(contents.author_photo) &&
    contents.author_photo.length > 0;
  const hasActionButton = Boolean(contents.inline_action_button);
  const bannerType =
    typeof banner.banner_type === "string" ? banner.banner_type.toLowerCase() : "";
  // Build a lowercase view of the text for the keyword scan, then keep
  // an original-cased view for the host-name extraction below so we
  // preserve "SunBurst" rather than regressing to "sunburst".
  const rawCombined = [
    headerText ?? "",
    contents.banner_message?.toString?.() ?? "",
    banner.header?.text?.toString?.() ?? "",
  ].join(" ");
  const combinedText = rawCombined.toLowerCase();

  const keywordMatch = /host|raid|joined from|now hosting|hand ?off|redirect/.test(
    combinedText,
  );
  const bannerTypeMatch = bannerType.includes("redirect");

  const looksLikeHandoff =
    (hasAuthorPhoto && hasActionButton) || bannerTypeMatch || keywordMatch;
  if (!looksLikeHandoff) return null;

  // Resolve the host's display name.
  // 1. inline_action_button.text often contains the host channel name on
  //    YouTube's redirect banners ("Watch X's stream", "View X").
  // 2. The action button's `accessibility_text` (tooltip) sometimes carries
  //    the channel name verbatim.
  // 3. Fall back to "another channel" so we always have a friendly label.
  const actionText = contents.inline_action_button?.text?.toString?.() || "";
  const actionTooltip =
    contents.inline_action_button?.accessibility_text?.toString?.() || "";
  const buttonUrl =
    typeof contents.inline_action_button?.url === "string"
      ? contents.inline_action_button.url
      : "";
  // Try to pull a channel handle out of a /@handle/ route from the URL.
  let hostName = "";
  if (buttonUrl) {
    const m = buttonUrl.match(/@([\w.-]+)/);
    if (m) hostName = m[1];
  }
  if (!hostName) {
    const m = actionText.match(/(?:join|view|watch|go to)\s+([^!,.?]+)/i);
    if (m) hostName = m[1].trim();
  }
  if (!hostName && actionTooltip) {
    hostName = actionTooltip.trim();
  }
  if (!hostName) {
    // Match both "hosting X" and "hosted by X". Use a char class stop
    // list so we trim after the first non-identifier char (apostrophes,
    // spaces, punctuation).
    const m1 = rawCombined.match(/hosting\s+([\w.-]+)/i);
    const m2 = m1
      ? null
      : rawCombined.match(/hosted\s+(?:by\s+)?([\w.-]+)/i);
    const m = m1 ?? m2;
    if (m) hostName = m[1].trim();
  }
  if (!hostName) {
    hostName = "another channel";
  }

  const label =
    hostName === "another channel"
      ? "A new raid joined the chat"
      : `Joining raid from ${hostName}`;

  const authorAvatar = Array.isArray(contents.author_photo)
    ? contents.author_photo[0]?.url
    : undefined;

  return {
    id: `system-raidHost-${banner.action_id || Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    author: "System",
    authorChannelId: undefined,
    authorAvatar,
    badges: {},
    parts: [{ type: "text", text: label }],
    timestamp: new Date(),
    messageType: "raidHost",
    targetUsername: hostName,
    authorIsModerator: false,
    authorIsOwner: false,
    authorIsMember: false,
  };
}

// Session management

/** Look up an auto-mod message by videoId + messageId for the moderation API. */
export function getAutomodItem(
  videoId: string,
  messageId: string,
): any | undefined {
  const session = activeLiveChats.get(videoId);
  if (!session) return undefined;
  const msg = session.messages.find(
    (m: any) => m.id === messageId && (m as any).automodItem,
  );
  return msg ? (msg as any).automodItem : undefined;
}

function reapIdleSessions() {
  const nowMs = Date.now();
  for (const [key, session] of activeLiveChats) {
    if (nowMs - session.lastUpdate > MAX_IDLE_MS) {
      clearChatRestart(session, key);
      for (const client of session.clients.values()) {
        try {
          client.controller.close();
        } catch {}
      }
      try {
        session.chat?.stop();
      } catch {}
      activeLiveChats.delete(key);
      console.log("[YouTube Chat] Reaped idle session for", key);
    }
  }
}

async function ensureChatSession(videoId: string): Promise<ChatSession> {
  // Return existing session
  let session = activeLiveChats.get(videoId);
  if (session) {
    session.lastUpdate = Date.now();
    return session;
  }

  // Check 403 cooldown
  const blockedUntil = blockedChatFailures.get(videoId);
  if (blockedUntil && blockedUntil > Date.now()) {
    throw new Error("BLOCKED");
  }
  if (blockedUntil) blockedChatFailures.delete(videoId);

  // Check playability-error cooldown (video unavailable, private, etc.)
  const playability = playabilityErrors.get(videoId);
  if (playability && playability.until > Date.now()) {
    throw new Error(`PLAYABILITY: ${playability.message}`);
  }
  if (playability) playabilityErrors.delete(videoId);

  // Evict LRU if at capacity
  if (activeLiveChats.size >= MAX_ACTIVE_SESSIONS) {
    let oldestKey = "";
    let oldestTime = Infinity;
    for (const [key, s] of activeLiveChats) {
      if (s.lastUpdate < oldestTime) {
        oldestTime = s.lastUpdate;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      const old = activeLiveChats.get(oldestKey)!;
      for (const c of old.clients.values()) {
        try {
          c.controller.close();
        } catch {}
      }
      try {
        old.chat?.stop();
      } catch {}
      activeLiveChats.delete(oldestKey);
    }
  }

  const messages: ChatMessage[] = [];
  const seenIds = new Set<string>();
  const authorByChannel = new Map<string, string>();
  /**
   * Session-scoped dedupe sets. `Set<string>` is enough since membership
   * is the only signal we need — once an event identity lands here, it
   * never re-emits, regardless of how often InnerTube re-publishes the
   * underlying action. The set is freed when the session is reaped.
   */
  const recentRemovals = new Set<string>();
  const recentHostHandoffs = new Set<string>();
  /**
   * Sticky set of message ids that have been marked deleted (by a moderator
   * or by the author). Survives the FIFO shift of the bounded `messages`
   * buffer, so a deleted message is never re-broadcast if InnerTube
   * re-publishes it after the buffer has cycled past it.
   */
  const deletedIds = new Map<string, string>();

  const parse = (item: any): ChatMessage | null => parseChatItem(item);

  // Build/extend the channelId -> display name index whenever a new message
  // is admitted. Called both from the initial-data replay and the live
  // chat-update stream so the moderator-removal summary can recover a
  // human-readable name.
  const indexAuthor = (msg: ChatMessage) => {
    if (msg.authorChannelId && msg.author) {
      authorByChannel.set(msg.authorChannelId, msg.author);
    }
  };

  /**
   * Emit a synthetic "X was removed from the chat" system note through the
   * SSE stream. This fires for every moderator-driven removal of an
   * author's messages (ours or anyone else's). Dedupe is keyed on the
   * `(actionKind, channelId)` event identity with no TTL — once a
   * removal note has been emitted for a pair, it will not re-emit for
   * the lifetime of the chat session, so re-polls / reconnects that
   * replay the same action can't spam chat with duplicate notes.
   */
  const emitRemovalSystemMessage = (
    channelId: string | undefined,
    authorName: string | undefined,
    actionKind: "removed" | "deleted",
  ) => {
    if (!channelId) return;
    const dedupeKey = `${actionKind}:${channelId}`;
    if (!shouldEmitSystemNote(recentRemovals, dedupeKey)) return;

    const systemMsg = createSystemRemovalMessage(
      authorName,
      channelId,
      authorByChannel,
      actionKind,
    );
    if (!seenIds.has(systemMsg.id)) {
      seenIds.add(systemMsg.id);
      messages.push(systemMsg);
      if (messages.length > MAX_SESSION_MESSAGES) {
        const removed = messages.shift()!;
        seenIds.delete(removed.id);
      }
    }
    broadcast(session!, "message", systemMsg, systemMsg.id);
  };

  /**
   * Emit a synthetic "Joining raid from [X]" system note through the SSE
   * stream when a host/redirect banner is detected. Dedupe is keyed on
   * `(targetUsername, banner.action_id)` with no TTL — once a handoff
   * note has been emitted for a (host, banner) pair, it will not re-emit
   * for the lifetime of the chat session, so subsequent polls of the
   * InnerTube chat-update stream that replay the same banner can't spam
   * chat with duplicate announcements.
   */
  const emitHostHandoffSystemMessage = (
    banner: any,
    systemMsg: ChatMessage,
  ): boolean => {
    const dedupeKey = `${systemMsg.targetUsername || "host"}:${banner?.action_id || "no-id"}`;
    if (!shouldEmitSystemNote(recentHostHandoffs, dedupeKey)) return false;

    if (!seenIds.has(systemMsg.id)) {
      seenIds.add(systemMsg.id);
      messages.push(systemMsg);
      if (messages.length > MAX_SESSION_MESSAGES) {
        const removed = messages.shift()!;
        seenIds.delete(removed.id);
      }
    }
    broadcast(session!, "message", systemMsg, systemMsg.id);
    return true;
  };

  // ── startChat(): build, wire, and start the LiveChat for this video. ──
  // The chat.on(...) handlers below belong to this closure; starting a chat
  // is just calling it again. That lets a transient block reconnect in
  // place — the message buffer, dedupe sets, and SSE clients all survive by
  // reusing the same session state.
  const startChat = async (): Promise<{ chat: any; ready: Promise<void> }> => {
    const yt = await getInnertube();
    let info;
    try {
      info = await yt.getInfo(videoId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isPlayabilityError(msg)) {
        playabilityErrors.set(videoId, {
          message: msg,
          until: Date.now() + PLAYABILITY_ERROR_COOLDOWN_MS,
        });
      }
      throw err;
    }
    const chat = info.getLiveChat();

    let resolveReady: () => void;
    const ready = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });

  chat.on("start", (initialData: any) => {
    console.log(
      `[YouTube Chat] Live chat started for video ${videoId}, viewer: ${initialData?.viewer_name || "Guest"}`,
    );
    if (initialData?.actions) {
      for (const action of initialData.actions) {
        if (!action?.is) continue;
        if (action.is(YTNodes.AddChatItemAction)) {
          const item = action.as(YTNodes.AddChatItemAction)?.item;
          if (!item) continue;
          const msg = parse(item);
          if (!msg) continue;
          if (deletedIds.has(msg.id)) {
            broadcast(session!, "delete", {
              messageId: msg.id,
              deletedByText: deletedIds.get(msg.id),
            });
            continue;
          }
          const deletedByText = detectDeletedReplacementText(item);
          if (deletedByText) {
            deletedIds.set(msg.id, deletedByText);
            broadcast(session!, "delete", {
              messageId: msg.id,
              deletedByText,
            });
            continue;
          }
          if (!seenIds.has(msg.id)) {
            seenIds.add(msg.id);
            messages.push(msg);
            indexAuthor(msg);
            if (messages.length > MAX_SESSION_MESSAGES) {
              const removed = messages.shift()!;
              seenIds.delete(removed.id);
            }
          }
          continue;
        }
        if (action.is(YTNodes.MarkChatItemAsDeletedAction)) {
          const targetId = action.target_item_id;
          if (!targetId) continue;
          const text = extractDeletedByText(action.deleted_state_message);
          const deletedByText = text ?? "Message deleted by a moderator";
          deletedIds.set(targetId, deletedByText);
          const idx = messages.findIndex((m) => m.id === targetId);
          if (idx !== -1) {
            messages[idx] = { ...messages[idx], isDeleted: true, deletedByText };
          }
          broadcast(session!, "delete", {
            messageId: targetId,
            deletedByText: text,
          });
          continue;
        }
        if (action.is(YTNodes.MarkChatItemsByAuthorAsDeletedAction)) {
          const channelId = action.external_channel_id;
          if (!channelId) continue;
          const text = extractDeletedByText(action.deleted_state_message);
          const deletedByText = text ?? "Message deleted by a moderator";
          for (const m of messages) {
            if (m.authorChannelId !== channelId) continue;
            deletedIds.set(m.id, deletedByText);
            messages[messages.indexOf(m)] = { ...m, isDeleted: true, deletedByText };
            broadcast(session!, "delete", { messageId: m.id, deletedByText });
          }
          // Skip system note during start replay: prevents re-emit on session recreation.
          continue;
        }
        if (action.is(YTNodes.RemoveChatItemByAuthorAction)) {
          const channelId = action.external_channel_id;
          if (!channelId) continue;
          for (const m of messages) {
            if (m.authorChannelId !== channelId) continue;
            deletedIds.set(m.id, "Message removed");
            messages[messages.indexOf(m)] = { ...m, isDeleted: true, deletedByText: "Message removed" };
            broadcast(session!, "delete", { messageId: m.id, deletedByText: "Message removed" });
          }
          // Skip system note during start replay: prevents re-emit on session recreation.
          continue;
        }
        if (action.is(YTNodes.RemoveChatItemAction)) {
          const targetId = action.target_item_id;
          if (!targetId) continue;
          const text = "Message removed";
          const existingText = deletedIds.get(targetId);
          const resolvedText = existingText ?? text;
          deletedIds.set(targetId, resolvedText);
          const idx = messages.findIndex((m) => m.id === targetId);
          if (idx !== -1) {
            messages[idx] = { ...messages[idx], isDeleted: true, deletedByText: resolvedText };
          }
          broadcast(session!, "delete", { messageId: targetId, deletedByText: resolvedText });
          continue;
        }
        if (action.is(YTNodes.ReplaceChatItemAction)) {
          const targetId = action.target_item_id;
          const replacement = action.replacement_item;
          if (!targetId || !replacement) continue;
          const text = detectDeletedReplacementText(replacement);
          if (text) {
            deletedIds.set(targetId, text);
            const idx = messages.findIndex((m) => m.id === targetId);
            if (idx !== -1) {
              messages[idx] = { ...messages[idx], isDeleted: true, deletedByText: text };
            }
            broadcast(session!, "delete", {
              messageId: targetId,
              deletedByText: text,
            });
          }
          continue;
        }
        if (action.is(YTNodes.AddBannerToLiveChatCommand)) {
          const banner = action.banner;
          if (!banner) continue;
          const headerText = banner.header?.text?.toString();
          const msg = parseBannerRedirect(banner, headerText);
          if (!msg) continue;
          if (!seenIds.has(msg.id)) {
            seenIds.add(msg.id);
            messages.push(msg);
            indexAuthor(msg);
            if (messages.length > MAX_SESSION_MESSAGES) {
              const removed = messages.shift()!;
              seenIds.delete(removed.id);
            }
          }
          // Skip host-handoff note during start replay: prevents re-emit on session recreation.
          continue;
        }
      }
    }
    // On a session reconnect, the start replay carries messages posted
    // while the connection was down — resync existing clients so the gap
    // isn't lost (the client merges + de-dupes by message id).
    if (session && session.clients.size > 0) {
      broadcast(session, "connected", {
        messages: session.messages,
        count: session.messages.length,
      });
    }
    resolveReady();
  });

  chat.on("chat-update", (action: any) => {
    if (!action?.is) return;
    try {
      if (action.is(YTNodes.AddChatItemAction)) {
        const item = action.as(YTNodes.AddChatItemAction)?.item;
        if (!item) return;
        const msg = parse(item);
        if (!msg) return;
        if (deletedIds.has(msg.id)) {
          // Re-published after a delete. Don't re-broadcast; if any client
          // missed the original delete, send one now so they stay in sync.
          broadcast(session!, "delete", {
            messageId: msg.id,
            deletedByText: deletedIds.get(msg.id),
          });
          return;
        }
        // InnerTube sometimes delivers a deleted message as a fresh
        // LiveChatTextMessage whose `message` text is the "deleted by"
        // placeholder and whose `author` is the moderator. Detect that
        // shape and treat it as a delete event so the client tombstone
        // sticks.
        const deletedByText = detectDeletedReplacementText(item);
        if (deletedByText) {
          deletedIds.set(msg.id, deletedByText);
          const idx = messages.findIndex((m) => m.id === msg.id);
          if (idx !== -1) {
            messages[idx] = { ...messages[idx], isDeleted: true, deletedByText };
          }
          broadcast(session!, "delete", { messageId: msg.id, deletedByText });
          return;
        }
        if (!seenIds.has(msg.id)) {
          seenIds.add(msg.id);
          messages.push(msg);
          indexAuthor(msg);
          if (messages.length > MAX_SESSION_MESSAGES) {
            const removed = messages.shift()!;
            seenIds.delete(removed.id);
            // The shifted message is still in deletedIds if it was
            // marked deleted — leave the sticky entry in place.
          }
          broadcast(session!, "message", msg, msg.id);
        }
        return;
      }
      if (action.is(YTNodes.RemoveChatItemAction)) {
        // User deleted their own message, YouTube auto-mod removed it, or a
        // moderator deleted it via the Data API. There is no
        // deleted_state_message — the item is simply removed. Use a neutral
        // label since the source of the deletion is unknown. The check on
        // deletedIds is forward-looking: if a future API path pre-populates
        // a better label (e.g. the moderation endpoint marking the message
        // before InnerTube delivers this action), we'll use it.
        const targetId = action.target_item_id;
        if (!targetId) return;
        const text = "Message removed";
        const existingText = deletedIds.get(targetId);
        const resolvedText = existingText ?? text;
        deletedIds.set(targetId, resolvedText);
        const idx = messages.findIndex((m) => m.id === targetId);
        if (idx !== -1) {
          messages[idx] = { ...messages[idx], isDeleted: true, deletedByText: resolvedText };
        }
        broadcast(session!, "delete", { messageId: targetId, deletedByText: resolvedText });
        return;
      }
      if (action.is(YTNodes.MarkChatItemAsDeletedAction)) {
        const targetId = action.target_item_id;
        if (!targetId) return;
        const text = extractDeletedByText(action.deleted_state_message);
        deletedIds.set(targetId, text ?? "Message deleted by a moderator");
        const idx = messages.findIndex((m) => m.id === targetId);
        if (idx !== -1) {
          messages[idx] = {
            ...messages[idx],
            isDeleted: true,
            deletedByText: text,
          };
        }
        broadcast(session!, "delete", {
          messageId: targetId,
          deletedByText: text,
        });
        return;
      }
      if (action.is(YTNodes.MarkChatItemsByAuthorAsDeletedAction)) {
        const channelId = action.external_channel_id;
        if (!channelId) return;
        const text = extractDeletedByText(action.deleted_state_message);
        const deletedByText = text ?? "Message deleted by a moderator";
        for (const m of messages) {
          if (m.authorChannelId !== channelId) continue;
          deletedIds.set(m.id, deletedByText);
          const idx = messages.indexOf(m);
          if (idx !== -1) {
            messages[idx] = { ...m, isDeleted: true, deletedByText };
          }
          broadcast(session!, "delete", { messageId: m.id, deletedByText });
        }
        emitRemovalSystemMessage(channelId, undefined, "deleted");
        return;
      }
      if (action.is(YTNodes.RemoveChatItemByAuthorAction)) {
        // Silently removes all messages from an author (ban/timeout). No
        // deleted_state_message — just wipe them. Use the same label as
        // RemoveChatItemAction for consistency. In addition, synthesize a
        // system "X was removed from the chat" note so every connected
        // client (including viewers who can't see deletions directly)
        // sees that a moderator action occurred.
        const channelId = action.external_channel_id;
        if (!channelId) return;
        for (const m of messages) {
          if (m.authorChannelId !== channelId) continue;
          deletedIds.set(m.id, "Message removed");
          const idx = messages.indexOf(m);
          if (idx !== -1) {
            messages[idx] = { ...m, isDeleted: true, deletedByText: "Message removed" };
          }
          broadcast(session!, "delete", { messageId: m.id, deletedByText: "Message removed" });
        }
        emitRemovalSystemMessage(channelId, undefined, "removed");
        return;
      }
      if (action.is(YTNodes.ReplaceChatItemAction)) {
        const targetId = action.target_item_id;
        const replacement = action.replacement_item;
        if (!targetId || !replacement) return;
        const text = detectDeletedReplacementText(replacement);
        if (text) {
          deletedIds.set(targetId, text);
          const idx = messages.findIndex((m) => m.id === targetId);
          if (idx !== -1) {
            messages[idx] = { ...messages[idx], isDeleted: true, deletedByText: text };
          }
          broadcast(session!, "delete", { messageId: targetId, deletedByText: text });
        }
        return;
      }
      if (action.is(YTNodes.AddBannerToLiveChatCommand)) {
        const banner = action.banner;
        if (!banner) return;
        const headerText = banner.header?.text?.toString();
        const msg = parseBannerRedirect(banner, headerText);
        if (!msg) return;
        if (!seenIds.has(msg.id)) {
          seenIds.add(msg.id);
          messages.push(msg);
          if (messages.length > MAX_SESSION_MESSAGES) {
            const removed = messages.shift()!;
            seenIds.delete(removed.id);
          }
          broadcast(session!, "message", msg, msg.id);
        }
        // Additionally, if the banner looks like a channel hand-off,
        // emit a dedicated "RAID HOST" system note so the chat
        // announces the joining group as one clear line. The note
        // arrives in the SSE stream after the redirect banner line,
        // giving connected viewers a clean handoff summary scroll.
        const hostHandoff = parseHostHandoffBanner(banner, headerText);
        if (hostHandoff) {
          emitHostHandoffSystemMessage(banner, hostHandoff);
        }
        return;
      }
      // Log unhandled action types to help discover new YouTube chat actions
      console.debug(
        "[YouTube Chat] Unhandled chat-update action type:",
        action.type || action.constructor?.name || "unknown",
      );
    } catch (e) {
      console.warn(
        "[YouTube Chat] Failed to parse chat-update action:",
        e instanceof Error ? e.message : String(e),
      );
    }
  });

  chat.on("end", () => {
    console.log(`[YouTube Chat] Live stream ended for video ${videoId}`);
    try {
      chat.stop();
    } catch {}
    const s = activeLiveChats.get(videoId);
    // Ignore events from a LiveChat that was already replaced on reconnect.
    if (!s || s.chat !== chat) return;
    // A transient block surfaces as an error followed by a synthetic "end"
    // — the error handler is reconnecting this session in place, so the
    // teardown below must not run.
    if (transientChatFailures.has(videoId)) return;
    clearChatRestart(s, videoId);
    if (s) {
      for (const c of s.clients.values()) {
        try {
          c.controller.enqueue(
            sseEvent(JSON.stringify({ reason: "ended" }), "end"),
          );
        } catch {}
        try {
          c.controller.close();
        } catch {}
      }
      activeLiveChats.delete(videoId);
    }
  });

  chat.on("error", (err: any) => {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("YouTube LiveChat error:", errMsg);

    const s = activeLiveChats.get(videoId);
    // Ignore events from a LiveChat that was already replaced on reconnect.
    if (!s || s.chat !== chat) return;

    if (errMsg.includes("403")) {
      blockedChatFailures.set(videoId, Date.now() + CHAT_FAILURE_COOLDOWN_MS);
      console.error(
        "[YouTube Chat] Blocked for",
        videoId,
        "— cleaning up session ( Innertube left intact for other videos )",
      );
      clearChatRestart(s, videoId);
      for (const c of s.clients.values()) {
        try {
          c.controller.enqueue(
            sseEvent(
              JSON.stringify({ error: "YouTube blocked this request" }),
              "error",
            ),
          );
        } catch {}
        try {
          c.controller.close();
        } catch {}
      }
      try {
        chat.stop();
      } catch {}
      activeLiveChats.delete(videoId);
      return;
    }

    // Transient block (proxy 503 / bot check): reconnect in place with
    // backoff instead of tearing the session down. The SSE stream stays
    // open — tell connected clients so they can surface a status.
    if (isTransientChatBlock(errMsg)) {
      for (const c of s.clients.values()) {
        try {
          c.controller.enqueue(
            sseEvent(JSON.stringify({ status: "reconnecting" }), "notice"),
          );
        } catch {}
      }
      armTransientReconnect();
      return;
    }

    // Non-403 error: wait 30s then clean up
    clearChatRestart(s, videoId);
    setTimeout(() => {
      const current = activeLiveChats.get(videoId);
      if (current?.chat === chat) {
        for (const c of current.clients.values()) {
          try {
            c.controller.enqueue(
              sseEvent(
                JSON.stringify({ error: "Chat connection lost" }),
                "error",
              ),
            );
          } catch {}
          try {
            c.controller.close();
          } catch {}
        }
        try {
          chat.stop();
        } catch {}
        activeLiveChats.delete(videoId);
      }
    }, 30000);
  });

    console.log(`[YouTube Chat] Starting live chat for video ${videoId}`);
    chat.start();

    return { chat, ready };
  };
  // ── end startChat() ─────────────────────────────────────────────────

  /**
   * Reconnect planner for transient YouTube blocks (proxy 503 / bot
   * checks). The block usually clears within seconds, so instead of
   * tearing the session down (which disconnects every SSE client and
   * loses buffered history), we back off and rebuild just the LiveChat,
   * swapping it into the existing session.
   */
  const armTransientReconnect = () => {
    const s = session;
    if (!s) return;
    if (activeLiveChats.get(videoId) !== s) return;
    // A reconnect is already scheduled for this episode — hold until it
    // runs (or fails there and escalates).
    if (s.restartTimer) return;

    const attempt = (transientChatFailures.get(videoId)?.attempt ?? 0) + 1;
    if (attempt > TRANSIENT_BLOCK_MAX_ATTEMPTS) {
      console.error(
        `[YouTube Chat] Giving up on reconnecting ${videoId} after ${TRANSIENT_BLOCK_MAX_ATTEMPTS} attempts`,
      );
      clearChatRestart(s, videoId);
      for (const c of s.clients.values()) {
        try {
          c.controller.enqueue(
            sseEvent(
              JSON.stringify({
                error: "YouTube chat temporarily unavailable",
              }),
              "error",
            ),
          );
        } catch {}
        try {
          c.controller.close();
        } catch {}
      }
      try {
        s.chat?.stop();
      } catch {}
      activeLiveChats.delete(videoId);
      return;
    }

    const backoff = Math.min(
      TRANSIENT_BLOCK_BASE_MS * 2 ** (attempt - 1),
      TRANSIENT_BLOCK_MAX_MS,
    );
    transientChatFailures.set(videoId, {
      until: Date.now() + backoff,
      attempt,
    });
    console.warn(
      `[YouTube Chat] Transient block for ${videoId} — reconnecting in ${Math.round(backoff / 1000)}s (attempt ${attempt}/${TRANSIENT_BLOCK_MAX_ATTEMPTS})`,
    );

    s.restartTimer = setTimeout(() => {
      s.restartTimer = null;
      void (async () => {
        if (activeLiveChats.get(videoId) !== s) return;
        // No viewers left to serve — let the session idle out and be reaped.
        if (s.clients.size === 0) {
          transientChatFailures.delete(videoId);
          return;
        }
        try {
          const oldChat = s.chat;
          const { chat: nextChat, ready: nextReady } = await startChat();
          try {
            oldChat?.stop();
          } catch {}
          s.chat = nextChat;
          s.ready = nextReady;
          s.lastUpdate = Date.now();
          transientChatFailures.delete(videoId);
          console.log(
            `[YouTube Chat] Reconnected live chat for video ${videoId}`,
          );
          // Let connected clients know the chat is back (they then get the
          // "connected" resync once the new connection's start replay lands).
          broadcast(s, "notice", { status: "reconnected" });
        } catch (err2) {
          const msg2 = err2 instanceof Error ? err2.message : String(err2);
          if (isPlayabilityError(msg2)) {
            // The stream ended while we were retrying — real teardown.
            console.warn(
              `[YouTube Chat] Stream ${videoId} ended during reconnect: ${msg2}`,
            );
            clearChatRestart(s, videoId);
            for (const c of s.clients.values()) {
              try {
                c.controller.enqueue(
                  sseEvent(JSON.stringify({ reason: "ended" }), "end"),
                );
              } catch {}
              try {
                c.controller.close();
              } catch {}
            }
            try {
              s.chat?.stop();
            } catch {}
            if (activeLiveChats.get(videoId) === s) {
              activeLiveChats.delete(videoId);
            }
            return;
          }
          // Still blocked — escalate to the next backoff step.
          armTransientReconnect();
        }
      })();
    }, backoff);
  };

  const { chat, ready } = await startChat();

  session = {
    chat,
    messages,
    seenIds,
    authorByChannel,
    recentRemovals,
    recentHostHandoffs,
    deletedIds,
    clients: new Map(),
    lastUpdate: Date.now(),
    destroyTimer: null,
    restartTimer: null,
    ready,
  };
  activeLiveChats.set(videoId, session);
  return session;
}

// SSE endpoint
export const GET: APIRoute = async ({ request, url }) => {
  if (IS_TWITCH_ONLY) return twitchOnlyResponse();

  const clientAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  if (!checkRateLimit(`${clientAddress}:youtube-stream-chat`, 60, 60_000)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "60" },
    });
  }

  const videoId = url.searchParams.get("videoId");
  if (!videoId) {
    return new Response(
      JSON.stringify({ error: "videoId query parameter is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  if (!/^[\w-]{11}$/.test(videoId)) {
    return new Response(JSON.stringify({ error: "Invalid videoId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  reapIdleSessions();

  let session: ChatSession;
  try {
    session = await ensureChatSession(videoId);
  } catch (err: any) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    if (rawMsg === "BLOCKED") {
      return new Response(
        JSON.stringify({
          error: "Live chat temporarily unavailable due to repeated failures",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }
    if (rawMsg.startsWith("PLAYABILITY: ")) {
      const innerMsg = rawMsg.slice("PLAYABILITY: ".length);
      return new Response(
        JSON.stringify({
          error: `Live chat is not available for this video (${innerMsg})`,
          videoId,
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }
    if (rawMsg.includes("status code 403") || rawMsg.includes("403")) {
      return new Response(
        JSON.stringify({
          error:
            "Live chat temporarily unavailable due to YouTube blocking (403)",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }
    if (isPlayabilityError(rawMsg)) {
      // Fallback for the rare case where isPlayabilityError matches but we
      // didn't pre-cache the entry (e.g. someone added a new pattern).
      playabilityErrors.set(videoId, {
        message: rawMsg,
        until: Date.now() + PLAYABILITY_ERROR_COOLDOWN_MS,
      });
      return new Response(
        JSON.stringify({
          error: `Live chat is not available for this video (${rawMsg})`,
          videoId,
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }
    if (isTransientChatBlock(rawMsg)) {
      // Transient YouTube block (proxy 503 / bot check) during session
      // setup — retryable; the client will back off and reconnect.
      return new Response(
        JSON.stringify({
          error:
            "Live chat temporarily unavailable (YouTube is blocking requests)",
        }),
        {
          status: 503,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "30",
          },
        },
      );
    }
    console.error("[YouTube Chat] Error setting up chat for", videoId, rawMsg);
    return new Response(
      JSON.stringify({ error: "Failed to connect to YouTube chat" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const clientId = `${videoId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const client: SSEClient = {
        id: clientId,
        controller,
        lastMessageId: null,
        connectedAt: Date.now(),
      };
      session.clients.set(clientId, client);
      session.lastUpdate = Date.now();

      // Cancel pending destroy if a new client arrived during grace period
      if (session.destroyTimer) {
        clearTimeout(session.destroyTimer);
        session.destroyTimer = null;
      }

      // Send initial batch after chat session is ready
      try {
        await Promise.race([
          session.ready,
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error("start timeout")), 10000),
          ),
        ]);
      } catch {
        // If start event never fires or times out, proceed with whatever messages we have
      }

      if (session.messages.length > 0) {
        controller.enqueue(
          sseEvent(
            JSON.stringify({
              messages: session.messages,
              count: session.messages.length,
            }),
            "connected",
          ),
        );
      } else {
        controller.enqueue(
          sseEvent(JSON.stringify({ messages: [], count: 0 }), "connected"),
        );
      }

      // Heartbeat every 15s to keep proxies/CDN from closing idle HTTP/2 streams
      heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(
            sseEvent(JSON.stringify({ ping: true }), "heartbeat"),
          );
        } catch {
          // Stream already closed
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
          }
        }
      }, 15000);

      console.log(
        `[YouTube Chat] SSE client connected: ${clientId} (${session.clients.size} total for ${videoId})`,
      );
    },
    cancel() {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      session.clients.delete(clientId);
      session.lastUpdate = Date.now();
      console.log(
        `[YouTube Chat] SSE client disconnected: ${clientId} (${session.clients.size} remaining for ${videoId})`,
      );

      if (session.clients.size === 0) {
        console.log(
          `[YouTube Chat] No clients left for ${videoId} — grace period ${SESSION_GRACE_PERIOD_MS / 1000}s`,
        );
        session.destroyTimer = setTimeout(() => {
          const s = activeLiveChats.get(videoId);
          if (s && s.clients.size === 0) {
            console.log(
              `[YouTube Chat] Grace period expired for ${videoId} — stopping chat session`,
            );
            try {
              s.chat?.stop();
            } catch {}
            activeLiveChats.delete(videoId);
          }
        }, SESSION_GRACE_PERIOD_MS);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
};

function parseGiftPurchaseAnnouncement(msg: any): ChatMessage {
  const giftCount = msg.gift_memberships?.count || msg.gift_count || 1;
  const amount =
    msg.purchase_amount?.toString() ||
    `${giftCount} gift${giftCount > 1 ? "s" : ""}`;
  const authorName =
    msg.header?.author_name?.toString() ||
    msg.author?.name?.toString() ||
    "Unknown";
  const authorChannelId = msg.author_external_channel_id || msg.author?.id;
  const authorAvatar = Array.isArray(msg.header?.author_photo)
    ? msg.header.author_photo[0]?.url
    : undefined;

  return {
    id: msg.id,
    author: authorName,
    authorChannelId,
    authorAvatar,
    badges: parseBadges(msg),
    parts: [],
    timestamp: parseTimestamp(msg),
    messageType: "gift-purchase",
    authorIsModerator: isAuthorModerator(msg) || undefined,
    authorIsOwner: isAuthorOwner(msg) || undefined,
    authorIsMember: isAuthorMember(msg) || undefined,
    superchat: {
      amount,
      color: "#9c27b0",
    },
    giftCount,
  };
}

function parseGiftRedemptionAnnouncement(msg: any): ChatMessage {
  const base = parseTextMessageBase(msg);
  const recipientName =
    msg.recipient?.name?.toString() || msg.header_subtext?.toString() || "";

  return {
    ...base,
    messageType: "gift-redemption",
    recipientName,
    superchat: {
      amount: "Gift received",
      color: "#4caf50",
    },
  };
}

function parseLiveChatMessage(msg: any): ChatMessage {
  const parts: MessagePart[] = [];
  const message = msg.message || msg.header_subtext;

  if (message && message.runs) {
    for (const run of message.runs) {
      if (run.emoji) {
        const emoji = run.emoji;
        const name = emoji.shortcuts?.[0] || emoji.emoji_id || "emoji";
        const url = Array.isArray(emoji.image)
          ? emoji.image[0]?.url
          : undefined;
        const isCustom = !!emoji.is_custom;

        if (!isCustom) {
          if (emoji.emoji_id)
            parts.push({ type: "text", text: emoji.emoji_id });
          continue;
        }

        if (!url) continue;

        parts.push({
          type: "emoji",
          url,
          alt: name,
          emojiText: name,
          isCustomEmoji: true,
        });
      } else {
        parts.push({ type: "text", text: run.text || "" });
      }
    }
  }

  const badges: Record<string, string> = {};
  if (msg.author?.badges) {
    for (const badge of msg.author.badges) {
      if (badge.thumbnails && badge.thumbnails[0]) {
        badges[badge.label || "badge"] = badge.thumbnails[0].url;
      }
    }
  }

  const rawTimestamp = parseInt(msg.timestamp || msg.timestamp_usec || "0");
  const asMillisecondsDirectly = new Date(rawTimestamp);
  const asUsToMs = new Date(rawTimestamp / 1000);
  const now = new Date();
  const msTimeDiff = Math.abs(now.getTime() - asMillisecondsDirectly.getTime());
  const usTimeDiff = Math.abs(now.getTime() - asUsToMs.getTime());
  const timestamp = msTimeDiff < usTimeDiff ? asMillisecondsDirectly : asUsToMs;

  return {
    id: msg.id,
    author: msg.author?.name?.toString() || "Unknown",
    authorChannelId: msg.author?.id,
    authorAvatar: Array.isArray(msg.author?.thumbnails)
      ? msg.author.thumbnails[0]?.url
      : undefined,
    badges,
    parts,
    timestamp,
    authorIsModerator: isAuthorModerator(msg) || undefined,
    authorIsOwner: isAuthorOwner(msg) || undefined,
    authorIsMember: isAuthorMember(msg) || undefined,
  };
}
