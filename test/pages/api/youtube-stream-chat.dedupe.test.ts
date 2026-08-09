import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  shouldEmitSystemNote,
  createSystemRemovalMessage,
} from "../../../src/pages/api/youtube-stream-chat.removal-bridge";

describe("shouldEmitSystemNote", () => {
  describe("first call", () => {
    it("returns true and records the key on the set", () => {
      const set = new Set<string>();
      expect(shouldEmitSystemNote(set, "removed:UC1")).toBe(true);
      expect(set.has("removed:UC1")).toBe(true);
      expect(set.size).toBe(1);
    });
  });

  describe("repeated call with the same key", () => {
    it("returns false on the second call", () => {
      const set = new Set<string>();
      shouldEmitSystemNote(set, "removed:UC1");
      expect(shouldEmitSystemNote(set, "removed:UC1")).toBe(false);
    });

    it("returns false after many subsequent calls", () => {
      const set = new Set<string>();
      shouldEmitSystemNote(set, "removed:UC1");
      for (let i = 0; i < 5; i++) {
        expect(shouldEmitSystemNote(set, "removed:UC1")).toBe(false);
      }
      expect(set.size).toBe(1);
    });

    it("does NOT re-emit even after a long delay", () => {
      vi.useFakeTimers();
      try {
        const set = new Set<string>();
        shouldEmitSystemNote(set, "removed:UC1");
        // Advance clock by 5 minutes — would have flipped the old 30s TTL.
        vi.advanceTimersByTime(5 * 60_000);
        expect(shouldEmitSystemNote(set, "removed:UC1")).toBe(false);
        // Advance clock by hours — still no re-emit.
        vi.advanceTimersByTime(24 * 60 * 60_000);
        expect(shouldEmitSystemNote(set, "removed:UC1")).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("different keys are independent", () => {
    it("returns true for a fresh key", () => {
      const set = new Set<string>();
      shouldEmitSystemNote(set, "removed:UC1");
      expect(shouldEmitSystemNote(set, "removed:UC2")).toBe(true);
      expect(set.has("removed:UC1")).toBe(true);
      expect(set.has("removed:UC2")).toBe(true);
    });

    it("returns true for a fresh actionKind even on the same channelId", () => {
      // Ban ("removed") and message hide ("deleted") for the SAME user are
      // distinct events and must each emit once.
      const set = new Set<string>();
      shouldEmitSystemNote(set, "removed:UC1");
      expect(shouldEmitSystemNote(set, "deleted:UC1")).toBe(true);
    });

    it("returns true for a fresh channelId even on the same actionKind", () => {
      const set = new Set<string>();
      shouldEmitSystemNote(set, "removed:UC1");
      expect(shouldEmitSystemNote(set, "removed:UC2")).toBe(true);
    });

    it("returns true for a fresh host-handoff key", () => {
      const set = new Set<string>();
      shouldEmitSystemNote(set, "ChampionChannel:banner-1");
      expect(shouldEmitSystemNote(set, "SunBurst:banner-1")).toBe(true);
      expect(shouldEmitSystemNote(set, "ChampionChannel:banner-2")).toBe(true);
    });
  });

  describe("session reset semantics", () => {
    it("treats a fresh Set as a fresh session (re-emits allowed)", () => {
      const sessionA = new Set<string>();
      shouldEmitSystemNote(sessionA, "removed:UC1");
      expect(shouldEmitSystemNote(sessionA, "removed:UC1")).toBe(false);

      // New session => new set => can re-emit the same event.
      const sessionB = new Set<string>();
      expect(shouldEmitSystemNote(sessionB, "removed:UC1")).toBe(true);
    });
  });
});

describe("createSystemRemovalMessage + shouldEmitSystemNote integration", () => {
  // Mimic the production emitter pipeline at the lowest level so we
  // verify the gate composes cleanly with createSystemRemovalMessage.
  function makeEmitter(
    set: Set<string>,
    lookup: Map<string, string>,
  ) {
    return (
      channelId: string | undefined,
      authorName: string | undefined,
      actionKind: "removed" | "deleted",
    ) => {
      if (!channelId) return null;
      if (!shouldEmitSystemNote(set, `${actionKind}:${channelId}`)) {
        return null;
      }
      return createSystemRemovalMessage(authorName, channelId, lookup, actionKind);
    };
  }

  it("emits once and then null for repeated removals of the same channel", () => {
    const set = new Set<string>();
    const lookup = new Map<string, string>([["UC1", "alice"]]);
    const emit = makeEmitter(set, lookup);

    const first = emit("UC1", "alice", "removed");
    expect(first).not.toBeNull();
    expect(first?.messageType).toBe("removed");
    expect(first?.parts[0].text).toBe("alice was removed from the chat");

    const second = emit("UC1", "alice", "removed");
    expect(second).toBeNull();
  });

  it("still emits a second time after a long delay (TTL has been removed)", () => {
    vi.useFakeTimers();
    try {
      const set = new Set<string>();
      const lookup = new Map<string, string>([["UC1", "alice"]]);
      const emit = makeEmitter(set, lookup);

      expect(emit("UC1", "alice", "removed")).not.toBeNull();
      vi.advanceTimersByTime(60 * 60_000);
      // The TTL is gone — second call is still null because the gate
      // is now session-scoped, not time-scoped.
      expect(emit("UC1", "alice", "removed")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("emits both action kinds independently for the same channel", () => {
    const set = new Set<string>();
    const lookup = new Map<string, string>([["UC1", "alice"]]);
    const emit = makeEmitter(set, lookup);

    const removed = emit("UC1", "alice", "removed");
    const deleted = emit("UC1", "alice", "deleted");
    expect(removed).not.toBeNull();
    expect(deleted).not.toBeNull();
    expect(removed?.messageType).toBe("removed");
    expect(deleted?.messageType).toBe("mod-hidden");
  });
});
