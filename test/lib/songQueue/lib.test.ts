import { describe, it, expect } from "vitest";
import { parseYouTubeId, DEFAULT_SONG_QUEUE_CONFIG } from "../../../src/lib/songQueue/types";
import { fetchVideoMeta, VideoValidationError } from "../../../src/lib/songQueue/oembed";
import { extractSubmissions, type SongQueueOwner } from "../../../src/lib/songQueue/extract";
import type { SongQueueMessage } from "../../../src/lib/songQueue/types";
import type { TwitchMessage } from "../../../src/lib/types";
import type { YTMessage } from "../../../src/components/chat/unified/types";

function twitch(
  id: string,
  author: string,
  content: string,
  opts: Partial<TwitchMessage> = {},
): SongQueueMessage {
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
): SongQueueMessage {
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

describe("parseYouTubeId", () => {
  it("accepts watch URLs with v= param", () => {
    expect(parseYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });
  it("accepts watch URLs with extra query params", () => {
    expect(
      parseYouTubeId("https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ&t=42s"),
    ).toBe("dQw4w9WgXcQ");
  });
  it("accepts youtu.be short URLs", () => {
    expect(parseYouTubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("accepts youtube.com/shorts URLs", () => {
    expect(parseYouTubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });
  it("accepts a bare 11-char id", () => {
    expect(parseYouTubeId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("rejects non-YouTube URLs", () => {
    expect(parseYouTubeId("https://example.com/watch?v=abc")).toBeNull();
  });
  it("rejects ids that are not 11 chars or have invalid characters", () => {
    expect(parseYouTubeId("dQw4w9WgXc")).toBeNull();
    expect(parseYouTubeId("dQw4w9WgXcQQ")).toBeNull();
    expect(parseYouTubeId("dQw4w9WgXc!")).toBeNull();
  });
  it("rejects empty / whitespace input", () => {
    expect(parseYouTubeId("")).toBeNull();
    expect(parseYouTubeId("   ")).toBeNull();
  });
});

describe("DEFAULT_SONG_QUEUE_CONFIG", () => {
  it("matches the locked-in defaults", () => {
    expect(DEFAULT_SONG_QUEUE_CONFIG.maxQueueLength).toBe(50);
    expect(DEFAULT_SONG_QUEUE_CONFIG.maxSongDurationSec).toBe(600);
    expect(DEFAULT_SONG_QUEUE_CONFIG.perSubmitterLimit).toBe(1);
    expect(DEFAULT_SONG_QUEUE_CONFIG.scope).toBe("both");
    expect(DEFAULT_SONG_QUEUE_CONFIG.eligibility).toBe("everyone");
    expect(DEFAULT_SONG_QUEUE_CONFIG.isPublic).toBe(false);
    expect(DEFAULT_SONG_QUEUE_CONFIG.announceOnPlay).toBe(false);
  });
});

describe("fetchVideoMeta (oembed)", () => {
  function fakeFetch(status: number, body: unknown = {}): typeof fetch {
    return (async () =>
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof fetch;
  }

  it("returns metadata on 200 with thumbnail", async () => {
    const fetcher = fakeFetch(200, {
      title: "Never Gonna Give You Up",
      author_name: "Rick Astley",
      thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    });
    const meta = await fetchVideoMeta("dQw4w9WgXcQ", fetcher);
    expect(meta.videoId).toBe("dQw4w9WgXcQ");
    expect(meta.title).toBe("Never Gonna Give You Up");
    expect(meta.channelTitle).toBe("Rick Astley");
    expect(meta.thumbnail).toContain("ytimg.com");
  });

  it("rejects invalid id without a network call", async () => {
    let called = false;
    const fetcher = (async () => {
      called = true;
      return new Response("{}");
    }) as unknown as typeof fetch;
    await expect(fetchVideoMeta("not-a-valid-id", fetcher)).rejects.toBeInstanceOf(
      VideoValidationError,
    );
    expect(called).toBe(false);
  });

  it("rejects 401 as unembeddable", async () => {
    const fetcher = fakeFetch(401);
    await expect(fetchVideoMeta("dQw4w9WgXcQ", fetcher)).rejects.toMatchObject({
      code: "unembeddable",
    });
  });

  it("rejects 404 as private-or-removed", async () => {
    const fetcher = fakeFetch(404);
    await expect(fetchVideoMeta("dQw4w9WgXcQ", fetcher)).rejects.toMatchObject({
      code: "private-or-removed",
    });
  });

  it("rejects 200 with no thumbnail as age-restricted", async () => {
    const fetcher = fakeFetch(200, { title: "x", author_name: "y" });
    await expect(fetchVideoMeta("dQw4w9WgXcQ", fetcher)).rejects.toMatchObject({
      code: "age-restricted",
    });
  });

  it("rejects network errors as network", async () => {
    const fetcher = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    await expect(fetchVideoMeta("dQw4w9WgXcQ", fetcher)).rejects.toMatchObject({
      code: "network",
    });
  });
});

describe("extractSubmissions", () => {
  const baseConfig = {
    scope: "both" as const,
    eligibility: "everyone" as const,
    perSubmitterLimit: 1,
  };

  it("accepts a watch URL from Twitch chat", () => {
    const messages: SongQueueMessage[] = [
      twitch("u1", "Alice", "!songadd https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    ];
    const { accepted, rejected } = extractSubmissions(messages, baseConfig);
    expect(accepted).toHaveLength(1);
    expect(accepted[0].videoId).toBe("dQw4w9WgXcQ");
    expect(accepted[0].submitter.author).toBe("Alice");
    expect(accepted[0].submitter.platform).toBe("twitch");
    expect(rejected).toEqual([]);
  });

  it("accepts a youtu.be URL from YouTube chat", () => {
    const messages: SongQueueMessage[] = [
      youtube("u1", "Alice", "!songadd https://youtu.be/dQw4w9WgXcQ"),
    ];
    const { accepted } = extractSubmissions(messages, baseConfig);
    expect(accepted).toHaveLength(1);
    expect(accepted[0].videoId).toBe("dQw4w9WgXcQ");
  });

  it("dedupes the same (user, videoId) within a single feed", () => {
    const messages: SongQueueMessage[] = [
      twitch("u1", "Alice", "!songadd https://youtu.be/dQw4w9WgXcQ"),
      twitch("u1", "Alice", "!songadd https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    ];
    const { accepted } = extractSubmissions(messages, baseConfig);
    expect(accepted).toHaveLength(1);
  });

  it("ignores messages without the !songadd prefix", () => {
    const messages: SongQueueMessage[] = [
      twitch("u1", "Alice", "https://youtu.be/dQw4w9WgXcQ"),
      twitch("u2", "Bob", "play this https://youtu.be/dQw4w9WgXcQ"),
      twitch("u3", "Charlie", "!songadd https://youtu.be/dQw4w9WgXcQ"),
    ];
    const { accepted } = extractSubmissions(messages, baseConfig);
    expect(accepted).toHaveLength(1);
    expect(accepted[0].submitter.author).toBe("Charlie");
  });

  it("ignores non-YouTube URLs", () => {
    const messages: SongQueueMessage[] = [
      twitch("u1", "Alice", "https://vimeo.com/12345"),
      twitch("u2", "Bob", "no links here"),
    ];
    const { accepted, rejected } = extractSubmissions(messages, baseConfig);
    expect(accepted).toEqual([]);
    expect(rejected).toEqual([]);
  });

  it("skips deleted messages", () => {
    const messages: SongQueueMessage[] = [
      twitch("u1", "Alice", "!songadd https://youtu.be/dQw4w9WgXcQ", { isDeleted: true }),
    ];
    const { accepted } = extractSubmissions(messages, baseConfig);
    expect(accepted).toEqual([]);
  });

  it("skips system messages (non-chat messageType)", () => {
    const messages: SongQueueMessage[] = [
      twitch("u1", "Alice", "!songadd https://youtu.be/dQw4w9WgXcQ", {
        messageType: "subscription",
      }),
    ];
    const { accepted } = extractSubmissions(messages, baseConfig);
    expect(accepted).toEqual([]);
  });

  it("excludes the channel owner", () => {
    const messages: SongQueueMessage[] = [
      twitch("bc", "Streamer", "!songadd https://youtu.be/dQw4w9WgXcQ"),
    ];
    const owner: SongQueueOwner = { twitchBroadcasterId: "bc" };
    const { accepted } = extractSubmissions(messages, baseConfig, owner);
    expect(accepted).toEqual([]);
  });

  it("filters by scope", () => {
    const messages: SongQueueMessage[] = [
      twitch("u1", "Alice", "!songadd https://youtu.be/dQw4w9WgXcQ"),
      youtube("u2", "Bob", "!songadd https://youtu.be/dQw4w9WgXcQ"),
    ];
    const { accepted } = extractSubmissions(messages, {
      ...baseConfig,
      scope: "twitch",
    });
    expect(accepted).toHaveLength(1);
    expect(accepted[0].submitter.platform).toBe("twitch");
  });

  it("filters by eligibility (subscribers only)", () => {
    const messages: SongQueueMessage[] = [
      twitch("u1", "Alice", "!songadd https://youtu.be/dQw4w9WgXcQ"),
      twitch(
        "u2",
        "Bob",
        "!songadd https://youtu.be/AAAAAAAAAAA",
        { badges: { subscriber: "1" } },
      ),
    ];
    const { accepted, rejected } = extractSubmissions(messages, {
      ...baseConfig,
      eligibility: "subscribers",
    });
    expect(accepted).toHaveLength(1);
    expect(accepted[0].submitter.author).toBe("Bob");
    expect(rejected).toEqual([
      { messageId: "u1", reason: "not eligible" },
    ]);
  });

  it("enforces perSubmitterLimit against the existing queue", () => {
    const messages: SongQueueMessage[] = [
      twitch("u1", "Alice", "!songadd https://youtu.be/dQw4w9WgXcQ"),
      twitch("u1", "Alice", "!songadd https://youtu.be/BBBBBBBBBBB"),
    ];
    const { accepted, rejected } = extractSubmissions(messages, baseConfig, {}, [
      {
        id: "existing",
        videoId: "CCCCCCCCCCC",
        title: "x",
        channelTitle: "x",
        thumbnail: "x",
        durationSec: 0,
        submitter: {
          userId: "u1",
          author: "Alice",
          platform: "twitch",
        },
        submittedAt: new Date().toISOString(),
        status: "pending",
      },
    ]);
    expect(accepted).toEqual([]);
    expect(rejected).toEqual([
      { messageId: "u1", reason: "per-submitter limit reached" },
      { messageId: "u1", reason: "per-submitter limit reached" },
    ]);
  });

  it("ignores already-played items when counting pending per submitter", () => {
    const messages: SongQueueMessage[] = [
      twitch("u1", "Alice", "!songadd https://youtu.be/dQw4w9WgXcQ"),
    ];
    const { accepted } = extractSubmissions(messages, baseConfig, {}, [
      {
        id: "played",
        videoId: "ZZZZZZZZZZZ",
        title: "x",
        channelTitle: "x",
        thumbnail: "x",
        durationSec: 0,
        submitter: {
          userId: "u1",
          author: "Alice",
          platform: "twitch",
        },
        submittedAt: new Date().toISOString(),
        status: "played",
      },
    ]);
    expect(accepted).toHaveLength(1);
  });
});
