import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getStreamStatuses,
  getRecentMessages,
  pinTwitchMessage,
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
});
