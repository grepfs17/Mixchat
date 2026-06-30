import { describe, it, expect, vi, beforeEach } from "vitest";
import { initializeEmotes, parseMessageWithEmotes } from "../../src/lib/emotes";

describe("emotes lib", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      }),
    );
  });

  it("parses message with Twitch emotes", () => {
    const text = "Hello Kappa";
    const twitchEmotes = {
      "25": ["6-10"], // Kappa is positions 6 to 10
    };

    const result = parseMessageWithEmotes(text, twitchEmotes);
    expect(result).toContain(
      "https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0",
    );
    expect(result).toContain('alt="Kappa"');
    expect(result).toContain('data-emote-name="Kappa"');
  });

  it("handles multiple Twitch emotes in a message", () => {
    const text = "Kappa Keepo";
    const twitchEmotes = {
      "25": ["0-4"],
      "1902": ["6-10"],
    };

    const result = parseMessageWithEmotes(text, twitchEmotes);
    expect(result).toContain("25/default/dark/2.0");
    expect(result).toContain("1902/default/dark/2.0");
  });

  it("escapes HTML in message text", () => {
    const text = '<script>alert("xss")</script>';
    const result = parseMessageWithEmotes(text);
    // DOMPurify should sanitize this
    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
  });

  it("initializes and parses third-party emotes", async () => {
    // Mock 7TV global emotes
    vi.mocked(fetch).mockImplementation((url: any) => {
      if (url.includes("7tv.io/v3/emote-sets/global")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            emotes: [{ id: "123", name: "7TVEmote", data: { flags: 0 } }],
          }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => [] } as Response);
    });

    await initializeEmotes("channelId", "channelName");

    const text = "Hello 7TVEmote";
    const result = parseMessageWithEmotes(text);
    expect(result).toContain("cdn.7tv.app/emote/123");
    expect(result).toContain('alt="7TVEmote"');
  });

  it("handles zero-width emotes from 7TV", async () => {
    const ZERO_WIDTH_FLAG = 1 << 8;
    // Mock 7TV channel emotes with a base emote and a zero-width flag emote
    vi.mocked(fetch).mockImplementation((url: any) => {
      if (url.includes("7tv.io/v3/users/twitch/")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            username: "testuser",
            emote_set: {
              id: "set-zw",
              emotes: [
                { id: "base", name: "BaseEmote", data: { flags: 0 } },
                {
                  id: "zw",
                  name: "OverlayEmote",
                  data: {
                    flags: ZERO_WIDTH_FLAG,
                  },
                },
              ],
            },
          }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ emotes: [] }),
      } as Response);
    });

    await initializeEmotes("channelId", "channelName");

    const text = "BaseEmote OverlayEmote";
    const result = parseMessageWithEmotes(text);
    expect(result).toContain('class="emote-overlay-container"');
    expect(result).toContain('class="emote-overlay"');
    expect(result).toContain("cdn.7tv.app/emote/zw");
    expect(result).toContain("cdn.7tv.app/emote/base");
  });

  it("7TV zero-width emote overlays a BTTV base emote", async () => {
    const ZERO_WIDTH_FLAG = 1 << 8;
    vi.mocked(fetch).mockImplementation((url: any) => {
      if (url.includes("7tv.io/v3/users/twitch/")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            username: "testuser",
            emote_set: {
              id: "set-cross",
              emotes: [
                {
                  id: "zw1",
                  name: "SnowOverlay",
                  data: { flags: ZERO_WIDTH_FLAG },
                },
              ],
            },
          }),
        } as Response);
      }
      if (url.includes("betterttv.net/3/cached/users/twitch/")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            channelEmotes: [{ id: "bttv1", code: "BttvEmote" }],
            sharedEmotes: [],
          }),
        } as Response);
      }
      if (url.includes("betterttv.net")) {
        return Promise.resolve({ ok: true, json: async () => [] } as Response);
      }
      if (url.includes("frankerfacez.com")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ sets: {} }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ emotes: [] }),
      } as Response);
    });

    await initializeEmotes("channelId", "channelName");

    const text = "BttvEmote SnowOverlay";
    const result = parseMessageWithEmotes(text);
    expect(result).toContain('class="emote-overlay-container"');
    expect(result).toContain('class="emote-overlay"');
    expect(result).toContain("cdn.betterttv.net/emote/bttv1");
    expect(result).toContain("SnowOverlay");
  });

  it("7TV zero-width emote overlays an FFZ base emote", async () => {
    const ZERO_WIDTH_FLAG = 1 << 8;
    vi.mocked(fetch).mockImplementation((url: any) => {
      if (url.includes("7tv.io/v3/users/twitch/")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            username: "testuser",
            emote_set: {
              id: "set-ffz",
              emotes: [
                {
                  id: "zw2",
                  name: "HatOverlay",
                  data: { flags: ZERO_WIDTH_FLAG },
                },
              ],
            },
          }),
        } as Response);
      }
      if (url.includes("frankerfacez.com/v1/room/")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            room: { set: 123 },
            sets: {
              123: {
                emoticons: [{ id: 456, name: "FfzEmote" }],
              },
            },
          }),
        } as Response);
      }
      if (url.includes("betterttv.net")) {
        return Promise.resolve({ ok: true, json: async () => [] } as Response);
      }
      if (url.includes("frankerfacez.com")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ sets: {} }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ emotes: [] }),
      } as Response);
    });

    await initializeEmotes("channelId", "channelName");

    const text = "FfzEmote HatOverlay";
    const result = parseMessageWithEmotes(text);
    expect(result).toContain('class="emote-overlay-container"');
    expect(result).toContain('class="emote-overlay"');
    expect(result).toContain("cdn.frankerfacez.com/emote/456");
    expect(result).toContain("HatOverlay");
  });

  it("7TV zero-width emote overlays a manually-typed Twitch emote", async () => {
    const ZERO_WIDTH_FLAG = 1 << 8;
    vi.mocked(fetch).mockImplementation((url: any) => {
      if (url.includes("7tv.io/v3/users/twitch/")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            username: "testuser",
            emote_set: {
              id: "set-tw",
              emotes: [
                {
                  id: "zw3",
                  name: "SparkleOverlay",
                  data: { flags: ZERO_WIDTH_FLAG },
                },
              ],
            },
          }),
        } as Response);
      }
      if (url.includes("helix/chat/emotes/global")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [
              {
                id: "999",
                name: "Kappa",
                images: {
                  url_1x:
                    "https://static-cdn.jtvnw.net/emoticons/v2/999/default/dark/1.0",
                  url_2x:
                    "https://static-cdn.jtvnw.net/emoticons/v2/999/default/dark/2.0",
                  url_4x:
                    "https://static-cdn.jtvnw.net/emoticons/v2/999/default/dark/4.0",
                },
                tier: "0",
                emote_type: "global",
                emote_set_id: "0",
              },
            ],
          }),
        } as Response);
      }
      // Return arrays for BTTV/FFZ endpoints that expect forEach
      if (url.includes("betterttv.net")) {
        return Promise.resolve({ ok: true, json: async () => [] } as Response);
      }
      if (url.includes("frankerfacez.com")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ sets: {} }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ emotes: [] }),
      } as Response);
    });

    await initializeEmotes("channelId", "channelName");

    const text = "Kappa SparkleOverlay";
    const result = parseMessageWithEmotes(text);
    expect(result).toContain('class="emote-overlay-container"');
    expect(result).toContain('class="emote-overlay"');
    expect(result).toContain("SparkleOverlay");
  });

  describe("Gigantify power-up (Twitch-only)", () => {
    it("renders Twitch emotes with the gigantified class and 4x source when gigantified", () => {
      const text = "Kappa";
      const twitchEmotes = { "25": ["0-4"] };
      const result = parseMessageWithEmotes(text, twitchEmotes, {
        gigantified: true,
      });
      expect(result).toContain('class="chat-emote chat-emote--gigantified"');
      // src is the 4x (highest) quality, not the default 2x
      expect(result).toMatch(
        /src="https:\/\/static-cdn\.jtvnw\.net\/emoticons\/v2\/25\/default\/dark\/4\.0"/,
      );
    });

    it("does not apply the gigantified class without the option", () => {
      const text = "Kappa";
      const twitchEmotes = { "25": ["0-4"] };
      const result = parseMessageWithEmotes(text, twitchEmotes);
      expect(result).toContain('class="chat-emote"');
      expect(result).not.toContain("chat-emote--gigantified");
      // Default 2x source
      expect(result).toContain(
        'src="https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0"',
      );
    });

    it("cache key differentiates gigantified vs not (no stale HTML)", () => {
      const text = "Kappa";
      const twitchEmotes = { "25": ["0-4"] };
      const normal = parseMessageWithEmotes(text, twitchEmotes);
      const giant = parseMessageWithEmotes(text, twitchEmotes, {
        gigantified: true,
      });
      expect(normal).not.toBe(giant);
      expect(normal).not.toContain("chat-emote--gigantified");
      expect(giant).toContain("chat-emote--gigantified");
    });
  });
});
