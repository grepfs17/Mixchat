import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getStreamStatuses,
  getRecentMessages,
  pinTwitchMessage,
  unpinTwitchMessage,
  getPinnedTwitchMessageId,
} from "../../src/lib/twitch";

describe("twitch lib mocked HTTP tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getStreamStatuses returns correct live/offline mapping", async () => {
    // Stub fetch to return one live stream for user '1'
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              user_id: "1",
              title: "Live Stream",
              viewer_count: 123,
              started_at: "2024-01-01T00:00:00Z",
            },
          ],
        }),
      }),
    );

    const result = await getStreamStatuses("token", "client", ["1", "2"]);

    expect(result["1"]).toBeDefined();
    expect(result["1"].isLive).toBe(true);
    expect(result["1"].title).toBe("Live Stream");
    expect(result["1"].viewerCount).toBe(123);

    expect(result["2"]).toBeDefined();
    expect(result["2"].isLive).toBe(false);
  });

  it("getRecentMessages parses raw IRC messages", async () => {
    const rawMsg = `@badge-info=;badges=moderator/1;color=#1E90FF;display-name=Mod;emotes=;tmi-sent-ts=${Date.now()};user-id=456 :mod!mod@mod.tmi.twitch.tv PRIVMSG #channel :Hello there`;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [rawMsg] }),
      }),
    );

    const messages = await getRecentMessages("channel");
    expect(messages).toHaveLength(1);
    const m = messages[0];
    expect(m.author).toBe("Mod");
    expect(m.content).toBe("Hello there");
    expect(m.userId).toBe("456");
    expect(m.isPreloaded).toBe(true);
  });

  it("getRecentMessages parses the gifs tag on preloaded messages", async () => {
    const rawMsg = `@badge-info=;badges=;color=;display-name=Viewer;emotes=;gifs=0-23|gifid123|https://media.giphy.com/media/gifid123/giphy.gif;tmi-sent-ts=${Date.now()};user-id=789 :viewer!viewer@viewer.tmi.twitch.tv PRIVMSG #channel :[YAY Yes GIF by Author]`;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [rawMsg] }),
      }),
    );

    const messages = await getRecentMessages("channel");
    expect(messages).toHaveLength(1);
    const m = messages[0];
    expect(m.gifs).toEqual([
      {
        id: "gifid123",
        url: "https://media.giphy.com/media/gifid123/giphy.gif",
        start: 0,
        end: 23,
      },
    ]);
  });

  it("getRecentMessages shifts gif ranges when stripping a reply prefix", async () => {
    const content = "[YAY Yes GIF by Author]";
    const rawMsg = `@reply-parent-msg-id=parent1;reply-parent-display-name=Mod;reply-parent-msg-body=p%20w;badges=;color=;display-name=Viewer;emotes=;gifs=5-28|gifid123|https://media.giphy.com/media/gifid123/giphy.gif;tmi-sent-ts=${Date.now()};user-id=789 :viewer!viewer@viewer.tmi.twitch.tv PRIVMSG #channel :@mod ${content}`;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [rawMsg] }),
      }),
    );

    const messages = await getRecentMessages("channel");
    expect(messages).toHaveLength(1);
    const m = messages[0];
    expect(m.content).toBe(content);
    expect(m.gifs).toEqual([
      {
        id: "gifid123",
        url: "https://media.giphy.com/media/gifid123/giphy.gif",
        start: 0,
        end: 23,
      },
    ]);
  });

  it("getRecentMessages returns empty array on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    const messages = await getRecentMessages("channel");
    expect(messages).toEqual([]);
  });

  it("pinTwitchMessage puts the message id to the pin endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const result = await pinTwitchMessage("123", "456", "msg-1");

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "/api/twitch-proxy?path=/helix/chat/pins&broadcaster_id=123&moderator_id=456",
    );
    expect(opts.method).toBe("PUT");
    expect(JSON.parse(opts.body)).toEqual({ message_id: "msg-1" });
  });

  it("getPinnedTwitchMessageId returns the pinned message id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ message_id: "msg-1" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getPinnedTwitchMessageId("123", "456");

    expect(result).toBe("msg-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "/api/twitch-proxy?path=/helix/chat/pins&broadcaster_id=123&moderator_id=456",
    );
  });

  it("getPinnedTwitchMessageId returns null when nothing is pinned", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }),
    );

    const result = await getPinnedTwitchMessageId("123", "456");
    expect(result).toBeNull();
  });

  it("unpinTwitchMessage deletes the pin with the message id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const result = await unpinTwitchMessage("123", "456", "msg-1");

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "/api/twitch-proxy?path=/helix/chat/pins&broadcaster_id=123&moderator_id=456&message_id=msg-1",
    );
    expect(opts.method).toBe("DELETE");
  });
});
