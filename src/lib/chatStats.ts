import type { Platform, TwitchMessage } from "./types";

export const CHAT_STATS_MAX_RESULTS = 50;

export interface ChatStatUser {
  author: string;
  authorAvatar?: string;
  platform: Platform;
  count: number;
}

export interface ChatStatGroup {
  content: string;
  count: number;
  users: Map<string, ChatStatUser>;
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
 * evicted from the rendered array but are already accounted for here).
 */
export interface ChatStatsStore {
  /** Channel this store was created for (guards cross-channel history loads). */
  channel?: string;
  groups: Map<string, ChatStatGroup>;
  /** Groups that have been seen at least twice (candidates for the ranking). */
  repeated: Map<string, ChatStatGroup>;
  /** Ids already folded in, used to avoid double-counting re-renders. */
  seen: Set<string>;
  totalMessages: number;
  /** Author keys (`platform:lowercased-author`) that chatted. */
  chatters: Set<string>;
  /** Subset of `chatters` seen with a moderator badge. */
  mods: Map<string, ChatStatUser>;
}

export function createChatStatsStore(channel?: string): ChatStatsStore {
  return {
    channel,
    groups: new Map(),
    repeated: new Map(),
    seen: new Set(),
    totalMessages: 0,
    chatters: new Set(),
    mods: new Map(),
  };
}

function normalizeContent(content: string): string {
  return content.replace(/\s+/g, " ").trim().toLowerCase();
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
 * already-seen ids are skipped and `seen` is pruned down to the current live
 * window, which stays bounded regardless of session length.
 */
export function accumulateChatStats(
  store: ChatStatsStore,
  messages: TwitchMessage[],
): void {
  const currentIds = new Set<string>();

  for (const msg of messages) {
    const id = `${msg.platform || "twitch"}:${msg.id}`;
    currentIds.add(id);
    if (store.seen.has(id)) continue;
    store.seen.add(id);

    if (msg.isDeleted || msg.optimistic) continue;

    const author = msg.author?.trim();
    if (author && author.toLowerCase() !== "system") {
      const authorKey = `${msg.platform || "twitch"}:${author.toLowerCase()}`;
      store.chatters.add(authorKey);
      if (msg.badges?.["moderator"] || msg.badgeDetails?.["moderator"]) {
        const mod = store.mods.get(authorKey);
        if (mod) {
          mod.count++;
          if (!mod.authorAvatar && msg.authorAvatar) {
            mod.authorAvatar = msg.authorAvatar;
          }
        } else {
          store.mods.set(authorKey, {
            author,
            authorAvatar: msg.authorAvatar,
            platform: msg.platform,
            count: 1,
          });
        }
      }
    }

    if (!isCountableMessage(msg)) continue;

    const content = msg.content.trim();
    const key = normalizeContent(content);
    let group = store.groups.get(key);
    if (!group) {
      group = { content, count: 0, users: new Map() };
      store.groups.set(key, group);
    }
    group.count++;
    store.totalMessages++;

    const authorKey = msg.author.toLowerCase();
    const existing = group.users.get(authorKey);
    if (existing) {
      existing.count++;
    } else {
      group.users.set(authorKey, {
        author: msg.author,
        authorAvatar: msg.authorAvatar,
        platform: msg.platform,
        count: 1,
      });
    }

    if (group.count === 2) store.repeated.set(key, group);
  }

  // Keep `seen` bounded by the live window. Messages never re-enter after
  // eviction, so dropping ids that rolled off cannot cause a re-count.
  if (store.seen.size > currentIds.size) {
    for (const id of store.seen) {
      if (!currentIds.has(id)) store.seen.delete(id);
    }
  }
}

/**
 * Clears a repeated-message group so its count starts over. The group is
 * dropped entirely; already-seen messages stay in `seen` (so they are not
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

export function buildChatStats(
  store: ChatStatsStore,
  limit = CHAT_STATS_MAX_RESULTS,
): ChatStatsResult {
  const entries: ChatStatEntry[] = [];
  for (const [key, group] of store.repeated) {
    entries.push({
      key,
      content: group.content,
      count: group.count,
      users: [...group.users.values()].sort((a, b) => b.count - a.count),
    });
  }
  entries.sort(
    (a, b) => b.count - a.count || a.content.localeCompare(b.content),
  );
  return {
    entries: entries.slice(0, limit),
    repeatedTotal: entries.length,
    totalMessages: store.totalMessages,
    chatters: store.chatters.size,
    mods: [...store.mods.values()].sort((a, b) =>
      a.author.localeCompare(b.author),
    ),
  };
}
