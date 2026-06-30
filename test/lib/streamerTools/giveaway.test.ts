import { describe, it, expect } from "vitest";
import {
  extractEntries,
  pickWinner,
  normalizeKeyword,
  messageMatchesKeyword,
  formatWinnerAnnouncement,
  type GiveawayConfig,
  type GiveawayMessage,
} from "../../../src/lib/streamerTools/giveaway";
import type { TwitchMessage } from "../../../src/lib/types";
import type { YTMessage } from "../../../src/components/chat/unified/types";

function twitch(
  id: string,
  author: string,
  content: string,
  opts: Partial<TwitchMessage> = {},
): GiveawayMessage {
  return {
    platform: "twitch",
    msg: {
      id,
      platform: "twitch",
      author,
      userId: id,
      content,
      timestamp: new Date(0),
      ...opts,
    },
  };
}

function youtube(
  id: string,
  author: string,
  text: string,
  opts: Partial<YTMessage> = {},
): GiveawayMessage {
  return {
    platform: "youtube",
    msg: {
      id,
      author,
      authorChannelId: id,
      parts: [{ type: "text", text }],
      timestamp: new Date(0),
      ...opts,
    },
  };
}

const baseConfig: GiveawayConfig = {
  keyword: "KEY",
  durationSeconds: 60,
  scope: "twitch",
  eligibility: "everyone",
};

describe("normalizeKeyword", () => {
  it("trims, lowercases, NFKC-normalizes", () => {
    expect(normalizeKeyword("  𝐊𝐄𝐘  ")).toBe("key");
  });
  it("returns empty string for whitespace", () => {
    expect(normalizeKeyword("   ")).toBe("");
  });
});

describe("messageMatchesKeyword", () => {
  it("matches exact whole word", () => {
    expect(messageMatchesKeyword("KEY", "key")).toBe(true);
    expect(messageMatchesKeyword("type KEY now", "key")).toBe(true);
  });
  it("strips surrounding punctuation", () => {
    expect(messageMatchesKeyword("KEY!", "key")).toBe(true);
    expect(messageMatchesKeyword("\"KEY\"", "key")).toBe(true);
  });
  it("does not match substrings", () => {
    expect(messageMatchesKeyword("KEYBOARD", "key")).toBe(false);
    expect(messageMatchesKeyword("MONKEY", "key")).toBe(false);
  });
  it("is case-insensitive", () => {
    expect(messageMatchesKeyword("key", "key")).toBe(true);
    expect(messageMatchesKeyword("Key", "key")).toBe(true);
  });
  it("returns false on empty keyword", () => {
    expect(messageMatchesKeyword("hello", "")).toBe(false);
  });
});

describe("extractEntries — basic matching & dedup", () => {
  it("returns entries for matching messages, dedupes per user", () => {
    const messages: GiveawayMessage[] = [
      twitch("u1", "Alice", "KEY"),
      twitch("u1", "Alice", "KEY again"),
      twitch("u2", "Bob", "key please"),
      twitch("u3", "Carol", "nope"),
    ];
    const result = extractEntries(messages, baseConfig);
    expect(result.map((e) => e.userId).sort()).toEqual(["u1", "u2"]);
  });

  it("ignores non-chat Twitch message types", () => {
    const messages: GiveawayMessage[] = [
      twitch("u1", "Alice", "KEY"),
      twitch("u2", "Bob", "KEY", { messageType: "highlight" }),
    ];
    const result = extractEntries(messages, baseConfig);
    expect(result.map((e) => e.userId)).toEqual(["u1"]);
  });

  it("ignores non-chat YouTube message types", () => {
    const messages: GiveawayMessage[] = [
      youtube("c1", "Alice", "KEY"),
      youtube("c2", "Bob", "KEY", { messageType: "membership" }),
    ];
    const config: GiveawayConfig = { ...baseConfig, scope: "youtube" };
    const result = extractEntries(messages, config);
    expect(result.map((e) => e.userId)).toEqual(["c1"]);
  });

  it("ignores optimistic / preloaded / deleted messages", () => {
    const messages: GiveawayMessage[] = [
      twitch("u1", "Alice", "KEY", { optimistic: true }),
      twitch("u2", "Bob", "KEY", { isPreloaded: true }),
      twitch("u3", "Carol", "KEY", { isDeleted: true }),
      twitch("u4", "Dan", "KEY"),
    ];
    const result = extractEntries(messages, baseConfig);
    expect(result.map((e) => e.userId)).toEqual(["u4"]);
  });

  it("returns empty for empty/blank keyword", () => {
    const messages: GiveawayMessage[] = [twitch("u1", "Alice", "anything")];
    expect(
      extractEntries(messages, { ...baseConfig, keyword: "   " }),
    ).toEqual([]);
  });
});

describe("extractEntries — scope", () => {
  it("twitch scope ignores YouTube messages", () => {
    const messages: GiveawayMessage[] = [
      twitch("u1", "Alice", "KEY"),
      youtube("c1", "YTUser", "KEY"),
    ];
    const result = extractEntries(messages, baseConfig);
    expect(result.map((e) => e.platform)).toEqual(["twitch"]);
  });

  it("youtube scope ignores Twitch messages", () => {
    const messages: GiveawayMessage[] = [
      twitch("u1", "Alice", "KEY"),
      youtube("c1", "YTUser", "KEY"),
    ];
    const result = extractEntries(messages, {
      ...baseConfig,
      scope: "youtube",
    });
    expect(result.map((e) => e.platform)).toEqual(["youtube"]);
  });

  it("both scope includes both platforms", () => {
    const messages: GiveawayMessage[] = [
      twitch("u1", "Alice", "KEY"),
      youtube("c1", "YTUser", "KEY"),
    ];
    const result = extractEntries(messages, {
      ...baseConfig,
      scope: "both",
    });
    expect(result.length).toBe(2);
  });

  it("reconstructs YouTube text from parts", () => {
    const messages: GiveawayMessage[] = [
      youtube("c1", "YTUser", "ignored", {
        parts: [
          { type: "emoji", alt: "🙂" },
          { type: "text", text: "  KEY  " },
          { type: "text", text: "!" },
        ],
      }),
    ];
    const result = extractEntries(messages, {
      ...baseConfig,
      scope: "youtube",
    });
    expect(result.map((e) => e.userId)).toEqual(["c1"]);
  });
});

describe("extractEntries — eligibility", () => {
  it("subscribers filter keeps Twitch subs and YouTube members", () => {
    const messages: GiveawayMessage[] = [
      twitch("u1", "Alice", "KEY", {
        badges: { subscriber: "https://x/sub.png" },
      }),
      twitch("u2", "Bob", "KEY"),
      youtube("c1", "YTUser", "KEY", { authorIsMember: true }),
      youtube("c2", "YTUser2", "KEY"),
    ];
    const result = extractEntries(messages, {
      ...baseConfig,
      scope: "both",
      eligibility: "subscribers",
    });
    const ids = result.map((e) => `${e.platform}:${e.userId}`).sort();
    expect(ids).toEqual(["twitch:u1", "youtube:c1"]);
  });

  it("subscribers filter treats Twitch founder badge as subscriber", () => {
    const messages: GiveawayMessage[] = [
      twitch("u1", "Alice", "KEY", {
        badges: { founder: "https://x/founder.png" },
      }),
    ];
    const result = extractEntries(messages, {
      ...baseConfig,
      eligibility: "subscribers",
    });
    expect(result.map((e) => e.userId)).toEqual(["u1"]);
  });

  it("everyone eligibility does not filter", () => {
    const messages: GiveawayMessage[] = [twitch("u1", "Alice", "KEY")];
    const result = extractEntries(messages, {
      ...baseConfig,
      eligibility: "everyone",
    });
    expect(result.length).toBe(1);
  });
});

describe("pickWinner", () => {
  it("returns null for empty", () => {
    expect(pickWinner([])).toBeNull();
  });

  it("returns one of the entries", () => {
    const entries = [
      { userId: "u1", author: "Alice", platform: "twitch" as const },
      { userId: "u2", author: "Bob", platform: "twitch" as const },
    ];
    const winner = pickWinner(entries);
    expect(winner).not.toBeNull();
    expect(entries).toContain(winner!);
  });
});

describe("formatWinnerAnnouncement", () => {
  it("includes author and keyword", () => {
    const text = formatWinnerAnnouncement(
      { userId: "u1", author: "Alice", platform: "twitch" },
      "KEY",
    );
    expect(text).toContain("Alice");
    expect(text).toContain("KEY");
  });

  it("strips newlines from keyword", () => {
    const text = formatWinnerAnnouncement(
      { userId: "u1", author: "Alice", platform: "twitch" },
      "BAD\nKEY",
    );
    expect(text).not.toContain("\n");
    expect(text).toContain("BAD KEY");
  });
});

describe("extractEntries — owner exclusion", () => {
  it("excludes the Twitch broadcaster by id", () => {
    const messages: GiveawayMessage[] = [
      twitch("broadcaster-1", "Streamer", "KEY"),
      twitch("u2", "Viewer", "KEY"),
    ];
    const result = extractEntries(
      messages,
      baseConfig,
      { twitchBroadcasterId: "broadcaster-1" },
    );
    expect(result.map((e) => e.userId)).toEqual(["u2"]);
  });

  it("excludes the Twitch broadcaster by broadcaster badge even when id is missing", () => {
    const messages: GiveawayMessage[] = [
      twitch("anon", "Streamer", "KEY", {
        badges: { broadcaster: "https://x/bc.png" },
      }),
      twitch("u2", "Viewer", "KEY"),
    ];
    const result = extractEntries(messages, baseConfig);
    expect(result.map((e) => e.userId)).toEqual(["u2"]);
  });

  it("excludes the YouTube channel owner by id", () => {
    const messages: GiveawayMessage[] = [
      youtube("channel-owner", "Streamer", "KEY"),
      youtube("subscriber-1", "Viewer", "KEY"),
    ];
    const result = extractEntries(
      messages,
      { ...baseConfig, scope: "youtube" },
      { youtubeChannelId: "channel-owner" },
    );
    expect(result.map((e) => e.userId)).toEqual(["subscriber-1"]);
  });

  it("excludes the YouTube channel owner by authorIsOwner flag when id is missing", () => {
    const messages: GiveawayMessage[] = [
      youtube("anyone", "Streamer", "KEY", { authorIsOwner: true }),
      youtube("viewer-1", "Viewer", "KEY"),
    ];
    const result = extractEntries(messages, {
      ...baseConfig,
      scope: "youtube",
    });
    expect(result.map((e) => e.userId)).toEqual(["viewer-1"]);
  });

  it("excludes owner across both platforms when both are in scope", () => {
    const messages: GiveawayMessage[] = [
      twitch("broadcaster-1", "Streamer", "KEY"),
      youtube("channel-owner", "Streamer", "KEY"),
      twitch("viewer-t", "ViewerT", "KEY"),
      youtube("viewer-yt", "ViewerYT", "KEY"),
    ];
    const result = extractEntries(
      messages,
      { ...baseConfig, scope: "both" },
      {
        twitchBroadcasterId: "broadcaster-1",
        youtubeChannelId: "channel-owner",
      },
    );
    const ids = result.map((e) => `${e.platform}:${e.userId}`).sort();
    expect(ids).toEqual(["twitch:viewer-t", "youtube:viewer-yt"]);
  });

  it("id match is case-insensitive", () => {
    const messages: GiveawayMessage[] = [
      twitch("BROADCASTER-1", "Streamer", "KEY"),
      twitch("u2", "Viewer", "KEY"),
    ];
    const result = extractEntries(
      messages,
      baseConfig,
      { twitchBroadcasterId: "broadcaster-1" },
    );
    expect(result.map((e) => e.userId)).toEqual(["u2"]);
  });

  it("does not exclude anyone when no owner info is provided and the author does not have the broadcaster/owner signal", () => {
    const messages: GiveawayMessage[] = [
      twitch("u1", "Alice", "KEY"),
      twitch("u2", "Bob", "KEY"),
    ];
    const result = extractEntries(messages, baseConfig);
    expect(result).toHaveLength(2);
  });
});
