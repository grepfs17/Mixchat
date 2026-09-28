import { describe, it, expect } from "vitest";
import type { TwitchMessage } from "../../src/lib/types";
import {
  accumulateChatStats,
  buildChatStats,
  createChatStatsStore,
  resetChatStatEntry,
  resetChatStatEntries,
} from "../../src/lib/chatStats";

let nextId = 0;

function msg(
  author: string,
  content: string,
  overrides: Partial<TwitchMessage> = {},
): TwitchMessage {
  nextId += 1;
  return {
    id: `m${nextId}`,
    platform: "twitch",
    author,
    content,
    timestamp: new Date(),
    ...overrides,
  };
}

describe("chatStats", () => {
  it("counts repeated messages and lists the users who typed them", () => {
    const store = createChatStatsStore();
    accumulateChatStats(store, [
      msg("Alice", "PogChamp"),
      msg("Bob", "PogChamp"),
      msg("Alice", "PogChamp"),
      msg("Carol", "hello"),
    ]);

    const result = buildChatStats(store);
    expect(result.repeatedTotal).toBe(1);
    expect(result.totalMessages).toBe(4);

    const [top] = result.entries;
    expect(top.content).toBe("PogChamp");
    expect(top.count).toBe(3);
    expect(top.users.map((u) => [u.author, u.count])).toEqual([
      ["Alice", 2],
      ["Bob", 1],
    ]);
  });

  it("groups case-insensitively and normalizes whitespace", () => {
    const store = createChatStatsStore();
    accumulateChatStats(store, [
      msg("Alice", "  Hello   World "),
      msg("Bob", "hello world"),
    ]);

    const result = buildChatStats(store);
    expect(result.repeatedTotal).toBe(1);
    expect(result.entries[0].count).toBe(2);
  });

  it("keeps accumulating after messages roll out of the live window", () => {
    const store = createChatStatsStore();
    // First window: the repeated message is seen twice.
    accumulateChatStats(store, [msg("Alice", "spam"), msg("Bob", "spam")]);
    // Simulate eviction: a later window no longer contains those messages.
    accumulateChatStats(store, [msg("Carol", "fresh")]);

    const result = buildChatStats(store);
    expect(result.totalMessages).toBe(3);
    expect(result.entries[0].content).toBe("spam");
    expect(result.entries[0].count).toBe(2);
  });

  it("does not double-count messages that stay across renders", () => {
    const store = createChatStatsStore();
    const a = msg("Alice", "same");
    const b = msg("Bob", "same");
    accumulateChatStats(store, [a, b]);
    accumulateChatStats(store, [a, b]);

    expect(buildChatStats(store).entries[0].count).toBe(2);
  });

  it("ignores deleted, optimistic and non-chat messages", () => {
    const store = createChatStatsStore();
    accumulateChatStats(store, [
      msg("Alice", "real"),
      msg("Bob", "real"),
      msg("Carol", "deleted", { isDeleted: true }),
      msg("Dave", "deleted", { isDeleted: true }),
      msg("Eve", "pending", { optimistic: true }),
      msg("Frank", "pending", { optimistic: true }),
      msg("Grace", "sub", { messageType: "subscription" }),
      msg("Heidi", "sub", { messageType: "subscription" }),
    ]);

    const result = buildChatStats(store);
    expect(result.repeatedTotal).toBe(1);
    expect(result.entries[0].content).toBe("real");
    expect(result.totalMessages).toBe(2);
  });

  it("counts unique chatters and moderators", () => {
    const store = createChatStatsStore();
    accumulateChatStats(store, [
      msg("Alice", "hi"),
      msg("Alice", "again"),
      msg("Bob", "hello"),
      msg("ModOne", "behave", { badges: { moderator: "1" } }),
      msg("ModOne", "still here", { badges: { moderator: "1" } }),
      msg("Streamer", "hey", { badges: { broadcaster: "1" } }),
    ]);

    const result = buildChatStats(store);
    expect(result.chatters).toBe(4);
    expect(result.mods.map((m) => m.author)).toEqual(["ModOne"]);
    expect(result.mods[0].count).toBe(2);
  });

  it("does not double-count chatters across overlapping windows", () => {
    const store = createChatStatsStore();
    const a = msg("Alice", "hi");
    accumulateChatStats(store, [a]);
    accumulateChatStats(store, [a, msg("Bob", "yo")]);

    const result = buildChatStats(store);
    expect(result.chatters).toBe(2);
    expect(result.totalMessages).toBe(2);
  });

  it("resets a single repeated entry and starts its count over", () => {
    const store = createChatStatsStore();
    accumulateChatStats(store, [
      msg("Alice", "spam"),
      msg("Bob", "spam"),
      msg("Alice", "hi"),
      msg("Bob", "hi"),
    ]);

    const before = buildChatStats(store);
    const spamKey = before.entries.find((e) => e.content === "spam")!.key;

    resetChatStatEntry(store, spamKey);

    const after = buildChatStats(store);
    expect(after.entries.map((e) => e.content)).toEqual(["hi"]);
    expect(after.repeatedTotal).toBe(1);

    // New duplicates of the reset message begin a fresh count.
    accumulateChatStats(store, [msg("Carol", "spam"), msg("Dave", "spam")]);
    const fresh = buildChatStats(store).entries.find(
      (e) => e.content === "spam",
    )!;
    expect(fresh.count).toBe(2);
    expect(fresh.users.map((u) => u.author)).toEqual(["Carol", "Dave"]);
  });

  it("resets every repeated entry but keeps the other stats", () => {
    const store = createChatStatsStore();
    accumulateChatStats(store, [
      msg("Alice", "spam"),
      msg("Bob", "spam"),
      msg("Alice", "hi"),
      msg("Bob", "hi"),
      msg("ModOne", "behave", { badges: { moderator: "1" } }),
    ]);

    resetChatStatEntries(store);

    const result = buildChatStats(store);
    expect(result.entries).toEqual([]);
    expect(result.repeatedTotal).toBe(0);
    expect(result.totalMessages).toBe(5);
    expect(result.chatters).toBe(3);
    expect(result.mods.map((m) => m.author)).toEqual(["ModOne"]);

    // Live-window messages stay seen, so new duplicates start a fresh count.
    accumulateChatStats(store, [msg("Carol", "spam"), msg("Dave", "spam")]);
    const fresh = buildChatStats(store).entries.find(
      (e) => e.content === "spam",
    )!;
    expect(fresh.count).toBe(2);
    expect(fresh.users.map((u) => u.author)).toEqual(["Carol", "Dave"]);
  });

  it("sorts by count then alphabetically and respects the limit", () => {
    const store = createChatStatsStore();
    const messages: TwitchMessage[] = [];
    for (let i = 0; i < 3; i++) {
      messages.push(msg("A", "beta"), msg("B", "beta"), msg("C", "beta"));
    }
    messages.push(msg("A", "alpha"), msg("B", "alpha"));

    accumulateChatStats(store, messages);
    const result = buildChatStats(store, 1);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].content).toBe("beta");
    expect(result.repeatedTotal).toBe(2);
  });

  it("filters repeated messages, totals and chatters by time window", () => {
    const store = createChatStatsStore();
    const now = Date.now();
    const old = new Date(now - 10 * 60 * 1000);
    const recent = new Date(now - 60 * 1000);
    accumulateChatStats(store, [
      msg("Alice", "old stuff", { timestamp: old }),
      msg("Bob", "old stuff", { timestamp: old }),
      msg("Carol", "new stuff", { timestamp: recent }),
      msg("Dave", "new stuff", { timestamp: recent }),
      msg("Erin", "one off", { timestamp: recent }),
    ]);

    const all = buildChatStats(store, 50, "all");
    expect(all.entries.map((e) => e.content)).toEqual([
      "new stuff",
      "old stuff",
    ]);
    expect(all.totalMessages).toBe(5);
    expect(all.chatters).toBe(5);

    const recent5 = buildChatStats(store, 50, "5m");
    expect(recent5.entries.map((e) => e.content)).toEqual(["new stuff"]);
    expect(recent5.totalMessages).toBe(3);
    expect(recent5.chatters).toBe(3);
    expect(recent5.entries[0].count).toBe(2);
  });

  it("does not recount a counted message that rolled out of the live window", () => {
    const store = createChatStatsStore();
    const first = msg("Alice", "PogChamp");
    const second = msg("Bob", "other");
    accumulateChatStats(store, [first]);
    // The message leaves the rendered window as newer messages arrive.
    accumulateChatStats(store, [second]);
    // Opening the overlay backfills history, which still contains it.
    accumulateChatStats(store, [first, second]);

    const result = buildChatStats(store);
    expect(result.entries.find((e) => e.content === "PogChamp")).toBeUndefined();
    expect(result.totalMessages).toBe(2);
  });

  it("scopes the whole result to a stream start floor", () => {
    const store = createChatStatsStore();
    const now = Date.now();
    const beforeStream = new Date(now - 3 * 60 * 60 * 1000);
    const streamStart = now - 60 * 60 * 1000;
    const inStream = new Date(now - 10 * 60 * 1000);
    accumulateChatStats(store, [
      msg("Alice", "old meme", { timestamp: beforeStream }),
      msg("Bob", "old meme", { timestamp: beforeStream }),
      msg("Carol", "new meme", { timestamp: inStream }),
      msg("Dave", "new meme", { timestamp: inStream }),
    ]);

    const scoped = buildChatStats(store, 50, "all", streamStart);
    expect(scoped.entries.map((e) => e.content)).toEqual(["new meme"]);
    expect(scoped.totalMessages).toBe(2);
    expect(scoped.chatters).toBe(2);

    // Without a floor, the full retained history is still available.
    const unscoped = buildChatStats(store, 50, "all");
    expect(unscoped.totalMessages).toBe(4);
    expect(unscoped.repeatedTotal).toBe(2);
  });

  it("applies the stream floor on top of a relative window", () => {
    const store = createChatStatsStore();
    const now = Date.now();
    const streamStart = now - 3 * 60 * 1000;
    accumulateChatStats(store, [
      msg("Alice", "spam", { timestamp: new Date(now - 20 * 60 * 1000) }),
      msg("Bob", "spam", { timestamp: new Date(now - 20 * 60 * 1000) }),
      msg("Carol", "spam", { timestamp: new Date(now - 60 * 1000) }),
      msg("Dave", "spam", { timestamp: new Date(now - 60 * 1000) }),
    ]);

    // "30m" would include all four, but the stream only started 3m ago.
    const scoped = buildChatStats(store, 50, "30m", streamStart);
    expect(scoped.entries[0].count).toBe(2);
    expect(scoped.totalMessages).toBe(2);
  });

  it("requires at least two occurrences inside the window", () => {
    const store = createChatStatsStore();
    const now = Date.now();
    accumulateChatStats(store, [
      msg("Alice", "spam", { timestamp: new Date(now - 10 * 60 * 1000) }),
      msg("Bob", "spam", { timestamp: new Date(now - 60 * 1000) }),
    ]);

    expect(buildChatStats(store, 50, "5m").entries).toEqual([]);
    expect(buildChatStats(store, 50, "30m").entries[0].count).toBe(2);
  });
});
