import type { Platform, TwitchMessage } from "./types";

export const CHAT_STATS_MAX_RESULTS = 50;

export type ChatStatsWindow = "all" | "30m" | "5m" | "2m";

export interface ChatStatsWindowOption {
  id: ChatStatsWindow;
  label: string;
  footerLabel: string;
}

export const CHAT_STATS_WINDOWS: ChatStatsWindowOption[] = [
  { id: "all", label: "Stream", footerLabel: "This stream" },
  { id: "30m", label: "30 min", footerLabel: "Last 30 minutes" },
  { id: "5m", label: "5 min", footerLabel: "Last 5 minutes" },
  { id: "2m", label: "2 min", footerLabel: "Last 2 minutes" },
];

const CHAT_STATS_WINDOW_MS: Record<ChatStatsWindow, number | undefined> = {
  all: undefined,
  "30m": 30 * 60 * 1000,
  "5m": 5 * 60 * 1000,
  "2m": 2 * 60 * 1000,
};

export interface ChatStatUser {
  author: string;
  authorAvatar?: string;
  platform: Platform;
  count: number;
}

/**
 * Internal user record. `timestamps` is only allocated once its group has been
 * seen twice, so one-off messages do not pay for a per-user array.
 */
export interface ChatStatUserRecord extends ChatStatUser {
  firstTimestamp: number;
  timestamps: number[] | null;
}

/**
 * Internal repeated-message group. `timestamps` starts as `null` and is lazily
 * materialized when the group reaches a count of two.
 */
export interface ChatStatGroup {
  content: string;
  count: number;
  firstTimestamp: number;
  timestamps: number[] | null;
  users: Map<string, ChatStatUserRecord>;
}

export interface ChatStatAuthorRecord {
  author: string;
  authorAvatar?: string;
  platform: Platform;
  count: number;
  isMod: boolean;
  timestamps: number[];
}

export interface ChatStatEntry {
  key: string;
  content: string;
  count: number;
  users: ChatStatUser[];
}

export interface ChatStatsResult {
  entries: ChatStatEntry[];
  repeatedTotal: number;
  totalMessages: number;
  /** Unique users who sent at least one message. */
  chatters: number;
  /** Unique users seen with the Twitch moderator badge. */
  mods: ChatStatUser[];
}

/**
 * Session-long accumulator for chat stats. Messages are folded in as they
 * stream by, so counts survive the in-memory window cap (older messages are
 * evicted from the rendered array but are already accounted for here). Entries
 * keep their timestamps so the ranking can be rebuilt for a time window.
 */
export interface ChatStatsStore {
  /** Channel this store was created for (guards cross-channel history loads). */
  channel?: string;
  groups: Map<string, ChatStatGroup>;
  /** Groups that have been seen at least twice (candidates for the ranking). */
  repeated: Map<string, ChatStatGroup>;
  /**
   * Ids already folded in. Never pruned (see `accumulateChatStats`), so a
   * message cannot be recounted when it reappears via a history reload.
   */
  seen: Set<string>;
  totalMessages: number;
  /** Timestamps of every countable message (for windowed totals). */
  messageTimestamps: number[];
  /** Per-author activity, used for windowed chatters and moderators. */
  authors: Map<string, ChatStatAuthorRecord>;
}

export function createChatStatsStore(channel?: string): ChatStatsStore {
  return {
    channel,
    groups: new Map(),
    repeated: new Map(),
    seen: new Set(),
    totalMessages: 0,
    messageTimestamps: [],
    authors: new Map(),
  };
}

function normalizeContent(content: string): string {
  return content.replace(/\s+/g, " ").trim().toLowerCase();
}

function messageTimestamp(msg: TwitchMessage): number {
  const timestamp = msg.timestamp;
  if (timestamp instanceof Date) return timestamp.getTime();
  const value = Number(timestamp);
  return Number.isFinite(value) ? value : Date.now();
}

function isCountableMessage(msg: TwitchMessage): boolean {
  if (msg.isDeleted || msg.optimistic) return false;
  if (
    msg.messageType &&
    msg.messageType !== "chat" &&
    msg.messageType !== "cheer"
  ) {
    return false;
  }
  return Boolean(msg.content?.trim());
}

/**
 * Folds newly-seen messages into the store. Safe to call on every render:
 * already-seen ids are skipped.
 *
 * `seen` is intentionally never pruned: a message can be counted live, evict
 * from the rendered window, and later reappear in a full-history backfill or a
 * recent-messages reload. Forgetting its id would make the backfill count it a
 * second time. The set is scoped to the session and cleared on channel switch,
 * so it stays bounded by what the current store has actually accounted for.
 */
export function accumulateChatStats(
  store: ChatStatsStore,
  messages: TwitchMessage[],
): void {
  for (const msg of messages) {
    const id = `${msg.platform || "twitch"}:${msg.id}`;
    if (store.seen.has(id)) continue;
    store.seen.add(id);

    if (msg.isDeleted || msg.optimistic) continue;

    const timestamp = messageTimestamp(msg);

    const author = msg.author?.trim();
    if (author && author.toLowerCase() !== "system") {
      const authorKey = `${msg.platform || "twitch"}:${author.toLowerCase()}`;
      let record = store.authors.get(authorKey);
      if (!record) {
        record = {
          author,
          authorAvatar: msg.authorAvatar,
          platform: msg.platform,
          count: 0,
          isMod: false,
          timestamps: [],
        };
        store.authors.set(authorKey, record);
      } else if (!record.authorAvatar && msg.authorAvatar) {
        record.authorAvatar = msg.authorAvatar;
      }
      record.count++;
      record.timestamps.push(timestamp);
      if (msg.badges?.["moderator"] || msg.badgeDetails?.["moderator"]) {
        record.isMod = true;
      }
    }

    if (!isCountableMessage(msg)) continue;

    const content = msg.content.trim();
    const key = normalizeContent(content);
    let group = store.groups.get(key);
    if (!group) {
      group = {
        content,
        count: 1,
        firstTimestamp: timestamp,
        timestamps: null,
        users: new Map(),
      };
      store.groups.set(key, group);
    } else {
      group.count++;
      if (group.count === 2) {
        group.timestamps = [group.firstTimestamp, timestamp];
        // Existing users each only carry their first timestamp so far.
        for (const user of group.users.values()) {
          if (user.timestamps === null) {
            user.timestamps = [user.firstTimestamp];
          }
        }
      } else if (group.timestamps) {
        group.timestamps.push(timestamp);
      }
    }
    store.totalMessages++;
    store.messageTimestamps.push(timestamp);

    const authorKey = msg.author.toLowerCase();
    const existing = group.users.get(authorKey);
    if (existing) {
      existing.count++;
      if (existing.timestamps) existing.timestamps.push(timestamp);
    } else {
      group.users.set(authorKey, {
        author: msg.author,
        authorAvatar: msg.authorAvatar,
        platform: msg.platform,
        count: 1,
        firstTimestamp: timestamp,
        timestamps: group.count >= 2 ? [timestamp] : null,
      });
    }

    if (group.count === 2) store.repeated.set(key, group);
  }
}

/**
 * Clears a repeated-message group so its count starts over. The group is
 * dropped entirely. Already-seen messages stay in `seen` (so they are not
 * re-counted) and only newly arriving duplicates begin accumulating again.
 */
export function resetChatStatEntry(store: ChatStatsStore, key: string): void {
  store.repeated.delete(key);
  store.groups.delete(key);
}

/**
 * Clears every repeated-message counter. Total messages, chatters and mods are
 * left untouched, and `seen` is kept so the live window is not recounted.
 * `groups` must be cleared too: promotion into `repeated` only happens once a
 * group reaches a count of two, so stale counts would never re-promote.
 */
export function resetChatStatEntries(store: ChatStatsStore): void {
  store.repeated.clear();
  store.groups.clear();
}

/**
 * Builds the ranked result for a time window. `notBefore` is an optional floor
 * (epoch ms) that bounds the whole result. Chat stats pass the current stream
 * start so ranking, totals, chatters and mods never reach into past streams.
 */
export function buildChatStats(
  store: ChatStatsStore,
  limit = CHAT_STATS_MAX_RESULTS,
  window: ChatStatsWindow = "all",
  notBefore?: number,
): ChatStatsResult {
  const windowMs = CHAT_STATS_WINDOW_MS[window];
  const windowSince = windowMs ? Date.now() - windowMs : undefined;
  let since: number | undefined;
  if (notBefore !== undefined && windowSince !== undefined) {
    since = Math.max(notBefore, windowSince);
  } else {
    since = notBefore ?? windowSince;
  }

  const countSince = (timestamps: number[], since: number): number => {
    let count = 0;
    for (const timestamp of timestamps) {
      if (timestamp >= since) count++;
    }
    return count;
  };

  const entries: ChatStatEntry[] = [];
  for (const [key, group] of store.repeated) {
    if (since === undefined) {
      // `all`: counts are already exact.
    } else if (group.timestamps === null) {
      continue;
    }
    const count =
      since === undefined
        ? group.count
        : countSince(group.timestamps as number[], since);
    if (count < 2) continue;

    const users: ChatStatUser[] = [];
    for (const user of group.users.values()) {
      let userCount: number;
      if (since === undefined) {
        userCount = user.count;
      } else if (user.timestamps === null) {
        userCount = user.firstTimestamp >= since ? user.count : 0;
      } else {
        userCount = countSince(user.timestamps, since);
      }
      if (userCount === 0) continue;
      users.push({
        author: user.author,
        authorAvatar: user.authorAvatar,
        platform: user.platform,
        count: userCount,
      });
    }
    users.sort((a, b) => b.count - a.count);

    entries.push({ key, content: group.content, count, users });
  }
  entries.sort(
    (a, b) => b.count - a.count || a.content.localeCompare(b.content),
  );

  let totalMessages = 0;
  if (since === undefined) {
    totalMessages = store.totalMessages;
  } else {
    totalMessages = countSince(store.messageTimestamps, since);
  }

  let chatters = 0;
  const mods: ChatStatUser[] = [];
  for (const record of store.authors.values()) {
    const count =
      since === undefined
        ? record.count
        : countSince(record.timestamps, since);
    if (count === 0) continue;
    chatters++;
    if (record.isMod) {
      mods.push({
        author: record.author,
        authorAvatar: record.authorAvatar,
        platform: record.platform,
        count,
      });
    }
  }
  mods.sort((a, b) => a.author.localeCompare(b.author));

  return {
    entries: entries.slice(0, limit),
    repeatedTotal: entries.length,
    totalMessages,
    chatters,
    mods,
  };
}
