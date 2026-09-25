import { describe, it, expect } from "vitest";
import type { TwitchMessage } from "../../src/lib/types";
import {
  accumulateChatStats,
  buildChatStats,
  createChatStatsStore,
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
});
