import { describe, it, expect } from "vitest";
import { createSystemRemovalMessage } from "../../../src/pages/api/youtube-stream-chat.removal-bridge";

describe("createSystemRemovalMessage", () => {
  describe('actionKind === "removed" (ban/timeout by a moderator)', () => {
    it("uses the explicit author name when provided", () => {
      const msg = createSystemRemovalMessage(
        "tofumushu",
        "UCxyz",
        new Map(),
        "removed",
      );
      expect(msg.messageType).toBe("removed");
      expect(msg.targetUsername).toBe("tofumushu");
      expect(msg.author).toBe("System");
      expect(msg.parts).toEqual([
        { type: "text", text: "tofumushu was removed from the chat" },
      ]);
    });

    it("falls back to the channelId→name reverse index when no name is given", () => {
      const lookup = new Map<string, string>([["UCxyz", "tofumushu"]]);
      const msg = createSystemRemovalMessage(undefined, "UCxyz", lookup, "removed");
      expect(msg.messageType).toBe("removed");
      expect(msg.targetUsername).toBe("tofumushu");
      expect(msg.parts).toEqual([
        { type: "text", text: "tofumushu was removed from the chat" },
      ]);
    });

    it('uses "A user" when neither name nor channel id is available', () => {
      const msg = createSystemRemovalMessage(undefined, undefined, new Map(), "removed");
      expect(msg.targetUsername).toBe("A user");
      expect(msg.parts).toEqual([
        { type: "text", text: "A user was removed from the chat" },
      ]);
    });

    it("prefers the explicit author name over the reverse index", () => {
      const lookup = new Map<string, string>([["UCxyz", "old-name"]]);
      const msg = createSystemRemovalMessage(
        "fresh-name",
        "UCxyz",
        lookup,
        "removed",
      );
      expect(msg.targetUsername).toBe("fresh-name");
      expect(msg.parts).toEqual([
        { type: "text", text: "fresh-name was removed from the chat" },
      ]);
    });

    it("uses a unique id suffixed with the action kind", () => {
      const msg = createSystemRemovalMessage("alice", "UC1", new Map(), "removed");
      expect(msg.id).toMatch(/^system-removed-/);
    });
  });

  describe('actionKind === "deleted" (mod hid messages)', () => {
    it("uses the explicit author name when provided", () => {
      const msg = createSystemRemovalMessage(
        "bob",
        "UCabc",
        new Map(),
        "deleted",
      );
      expect(msg.messageType).toBe("mod-hidden");
      expect(msg.targetUsername).toBe("bob");
      expect(msg.parts).toEqual([
        {
          type: "text",
          text: "bob's messages were removed by a moderator",
        },
      ]);
    });

    it("falls back to the channelId→name reverse index", () => {
      const lookup = new Map([["UCabc", "bob"]]);
      const msg = createSystemRemovalMessage(undefined, "UCabc", lookup, "deleted");
      expect(msg.targetUsername).toBe("bob");
      expect(msg.parts).toEqual([
        {
          type: "text",
          text: "bob's messages were removed by a moderator",
        },
      ]);
    });

    it('uses "A user" when both signals are missing', () => {
      const msg = createSystemRemovalMessage(
        undefined,
        undefined,
        new Map(),
        "deleted",
      );
      expect(msg.targetUsername).toBe("A user");
      expect(msg.parts).toEqual([
        {
          type: "text",
          text: "A user's messages were removed by a moderator",
        },
      ]);
    });

    it("uses a unique id suffixed with the deleted kind", () => {
      const msg = createSystemRemovalMessage("bob", "UC1", new Map(), "deleted");
      expect(msg.id).toMatch(/^system-deleted-/);
    });
  });

  describe("common shape", () => {
    it("is always authored by System with no moderator/owner/member flags", () => {
      const msg = createSystemRemovalMessage("alice", "UC1", new Map(), "removed");
      expect(msg.author).toBe("System");
      expect(msg.authorChannelId).toBeUndefined();
      expect(msg.authorAvatar).toBeUndefined();
      expect(msg.authorIsModerator).toBe(false);
      expect(msg.authorIsOwner).toBe(false);
      expect(msg.authorIsMember).toBe(false);
    });

    it("stamps the timestamp synchronously", () => {
      const before = Date.now();
      const msg = createSystemRemovalMessage("alice", "UC1", new Map(), "removed");
      const after = Date.now();
      expect(msg.timestamp).toBeInstanceOf(Date);
      expect(msg.timestamp.getTime()).toBeGreaterThanOrEqual(before);
      expect(msg.timestamp.getTime()).toBeLessThanOrEqual(after);
    });

    it("emits a parts array of length 1 with a single text part", () => {
      const msg = createSystemRemovalMessage("alice", "UC1", new Map(), "removed");
      expect(msg.parts).toHaveLength(1);
      expect(msg.parts[0].type).toBe("text");
      expect(typeof msg.parts[0].text).toBe("string");
    });

    it("never collides on id when called back-to-back", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 5; i++) {
        const msg = createSystemRemovalMessage("alice", "UC1", new Map(), "removed");
        ids.add(msg.id);
      }
      expect(ids.size).toBe(5);
    });
  });
});
