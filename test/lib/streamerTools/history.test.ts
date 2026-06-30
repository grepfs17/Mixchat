import { describe, it, expect, beforeEach } from "vitest";
import {
  appendGiveawayHistory,
  clearGiveawayHistory,
  getGiveawayHistory,
  type GiveawayHistoryEntry,
} from "../../../src/lib/streamerTools/history";

function makeEntry(
  overrides: Partial<Omit<GiveawayHistoryEntry, "id" | "revealedAt">> = {},
): Omit<GiveawayHistoryEntry, "id" | "revealedAt"> {
  return {
    keyword: "KEY",
    winner: { userId: "u1", author: "Alice", platform: "twitch" },
    entryCount: 3,
    durationSeconds: 60,
    scope: "twitch",
    eligibility: "everyone",
    ...overrides,
  };
}

describe("giveaway history", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns an empty list when nothing is stored", () => {
    expect(getGiveawayHistory()).toEqual([]);
  });

  it("appends an entry with generated id and timestamp", () => {
    const entry = appendGiveawayHistory(makeEntry());
    expect(entry.id).toBeTruthy();
    expect(new Date(entry.revealedAt).toISOString()).toBe(entry.revealedAt);
    const all = getGiveawayHistory();
    expect(all).toHaveLength(1);
    expect(all[0].keyword).toBe("KEY");
  });

  it("orders newest first", () => {
    const first = appendGiveawayHistory(makeEntry({ keyword: "FIRST" }));
    appendGiveawayHistory(makeEntry({ keyword: "SECOND" }));
    const all = getGiveawayHistory();
    expect(all[0].keyword).toBe("SECOND");
    expect(all[1].keyword).toBe("FIRST");
    expect(all[0].id).not.toBe(first.id);
  });

  it("caps the history at 50 entries", () => {
    for (let i = 0; i < 60; i++) {
      appendGiveawayHistory(makeEntry({ keyword: `KW${i}` }));
    }
    const all = getGiveawayHistory();
    expect(all).toHaveLength(50);
    expect(all[0].keyword).toBe("KW59");
  });

  it("clears the history", () => {
    appendGiveawayHistory(makeEntry());
    expect(getGiveawayHistory()).toHaveLength(1);
    clearGiveawayHistory();
    expect(getGiveawayHistory()).toEqual([]);
  });

  it("ignores malformed stored data", () => {
    localStorage.setItem("mixchat_giveaway_history", "not json");
    expect(getGiveawayHistory()).toEqual([]);
  });

  it("filters out entries with missing required fields", () => {
    const mixed = [
      {
        id: "1",
        revealedAt: new Date().toISOString(),
        keyword: "GOOD",
        winner: { userId: "u1", author: "Alice", platform: "twitch" },
        entryCount: 1,
        durationSeconds: 60,
        scope: "twitch",
        eligibility: "everyone",
      },
      { id: "2", revealedAt: "x", keyword: "BAD" }, // missing winner
      null,
    ];
    localStorage.setItem("mixchat_giveaway_history", JSON.stringify(mixed));
    const all = getGiveawayHistory();
    expect(all).toHaveLength(1);
    expect(all[0].keyword).toBe("GOOD");
  });
});
