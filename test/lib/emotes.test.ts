import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  initializeEmotes,
  parseMessageWithEmotes,
  searchEmotes,
  setEmotes7tv,
  setEmotesBttv,
  setEmotesFfz,
  getDisabledEmoteChannels,
  isEmoteChannelDisabled,
  toggleDisableEmoteChannel,
  getEmoteAliases,
  addEmoteAlias,
  removeEmoteAlias,
  tokenizeThirdPartyEmotesForYoutube,
} from "../../src/lib/emotes";
import { renderUnicodeEmojis } from "../../src/lib/emotes/utils";
import { setEmotesTwitchByChannel } from "../../src/lib/emotes/state";

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

  it("7TV zero-width emote overlays a Twitch emote resolved via IRC positions", async () => {
    const ZERO_WIDTH_FLAG = 1 << 8;
    vi.mocked(fetch).mockImplementation((url: any) => {
      if (url.includes("7tv.io/v3/users/twitch/")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            username: "testuser",
            emote_set: {
              id: "set-tw-irc",
              emotes: [
                {
                  id: "zw4",
                  name: "HatOverlay",
                  data: { flags: ZERO_WIDTH_FLAG },
                },
              ],
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

    // Twitch emote "Kappa" at positions 0-4, followed by 7TV overlay "HatOverlay"
    const text = "Kappa HatOverlay";
    const twitchEmotes = { "25": ["0-4"] };
    const result = parseMessageWithEmotes(text, twitchEmotes);
    expect(result).toContain('class="emote-overlay-container"');
    expect(result).toContain('class="emote-overlay"');
    expect(result).toContain("HatOverlay");
    // The Twitch emote should be the base
    expect(result).toContain("25/default/dark/2.0");
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

  describe("renderUnicodeEmojis (string → HTML)", () => {
    it("converts a flag emoji to a Twemoji <img>", () => {
      const result = renderUnicodeEmojis("🇨🇦");
      expect(result).toContain('<img class="emoji"');
      expect(result).toContain("cdnjs.cloudflare.com/ajax/libs/twemoji/");
      expect(result).toContain("1f1e8-1f1e6.svg"); // Canada flag codepoint
    });

    it("converts a common emoji to a Twemoji <img>", () => {
      const result = renderUnicodeEmojis("😀");
      expect(result).toContain('<img class="emoji"');
      expect(result).toContain("1f600.svg"); // grinning face codepoint
    });

    it("preserves plain text around emojis", () => {
      const result = renderUnicodeEmojis("Hello 🇨🇦 World");
      expect(result).toContain("Hello");
      expect(result).toContain("World");
      expect(result).toContain('<img class="emoji"');
    });

    it("does not modify text without emojis", () => {
      const result = renderUnicodeEmojis("Hello World");
      expect(result).toBe("Hello World");
      expect(result).not.toContain("<img");
    });

    it("does not modify existing <img> tags", () => {
      const html = '<img src="https://example.com/emote.webp" alt="Kappa" />';
      const result = renderUnicodeEmojis(html);
      expect(result).toContain('src="https://example.com/emote.webp"');
      expect(result).not.toContain('class="emoji"'); // No twemoji img added
    });

    it("converts multiple emojis in the same string", () => {
      const result = renderUnicodeEmojis("😀❤️🇨🇦");
      const imgCount = (result.match(/<img class="emoji"/g) || []).length;
      expect(imgCount).toBe(3);
    });
  });

  describe("Unicode emoji rendering in parseMessageWithEmotes (Twitch path)", () => {
    it("converts flag emojis in a plain message to Twemoji images", () => {
      const result = parseMessageWithEmotes("Josh🇨🇦🇨🇦");
      expect(result).toContain('<img class="emoji"');
      expect(result).toContain("1f1e8-1f1e6.svg");
    });

    it("converts Unicode emojis alongside Twitch emotes", () => {
      const text = "Kappa 😀 test";
      const twitchEmotes = { "25": ["0-4"] };
      const result = parseMessageWithEmotes(text, twitchEmotes);
      // Twitch emote should be present
      expect(result).toContain("25/default/dark/2.0");
      // Unicode emoji should also be converted
      expect(result).toContain('<img class="emoji"');
      expect(result).toContain("1f600.svg");
    });

    it("does not break HTML escaping of special characters", () => {
      const result = parseMessageWithEmotes("<script>😀</script>");
      expect(result).not.toContain("<script>");
      expect(result).toContain('&lt;script&gt;');
      expect(result).toContain('<img class="emoji"');
    });
  });

  describe("disabled emote channels", () => {
    beforeEach(() => {
      setEmotesTwitchByChannel([
        {
          channelId: "123",
          channelName: "testchannel",
          emotes: {
            TestEmote:
              "https://static-cdn.jtvnw.net/emoticons/v2/1/default/dark/2.0",
          },
        },
      ]);
    });

    it("toggles a channel's disabled state and persists it", () => {
      expect(isEmoteChannelDisabled("123")).toBe(false);
      toggleDisableEmoteChannel("123");
      expect(isEmoteChannelDisabled("123")).toBe(true);
      expect(getDisabledEmoteChannels().has("123")).toBe(true);
      toggleDisableEmoteChannel("123");
      expect(isEmoteChannelDisabled("123")).toBe(false);
    });

    it("searchEmotes excludes emotes from a disabled channel", () => {
      expect(
        searchEmotes("TestEmote").some((r) => r.name === "TestEmote"),
      ).toBe(true);
      toggleDisableEmoteChannel("123");
      expect(
        searchEmotes("TestEmote").some((r) => r.name === "TestEmote"),
      ).toBe(false);
    });
  });

  describe("emote aliases", () => {
    beforeEach(() => {
      setEmotes7tv({ Cool: "https://cdn.7tv.app/emote/cool/1x.webp" });
      setEmotesBttv({});
      setEmotesFfz({});
    });

    it("adds, replaces, and removes an alias", () => {
      expect(getEmoteAliases()).toEqual({});
      addEmoteAlias("Cool", "CoolPic");
      expect(getEmoteAliases()).toEqual({ Cool: "CoolPic" });
      addEmoteAlias("Cool", "Another");
      expect(getEmoteAliases()).toEqual({ Cool: "Another" });
      removeEmoteAlias("Cool");
      expect(getEmoteAliases()).toEqual({});
    });

    it("ignores empty aliases and no-ops on the same alias", () => {
      addEmoteAlias("Cool", "   ");
      expect(getEmoteAliases()).toEqual({});
      addEmoteAlias("Cool", "CoolPic");
      addEmoteAlias("Cool", "CoolPic");
      expect(getEmoteAliases()).toEqual({ Cool: "CoolPic" });
    });

    it("searchEmotes matches an emote by its alias", () => {
      addEmoteAlias("Cool", "CoolPic");
      expect(searchEmotes("CoolPic").some((r) => r.name === "Cool")).toBe(
        true,
      );
    });

    it("searchEmotes still matches the canonical name", () => {
      addEmoteAlias("Cool", "CoolPic");
      expect(searchEmotes("Cool").some((r) => r.name === "Cool")).toBe(true);
    });
  });

  describe("tokenizeThirdPartyEmotesForYoutube", () => {
    beforeEach(() => {
      setEmotes7tv({});
      setEmotesBttv({});
      setEmotesFfz({});
    });

    it("returns the original text as a single text token when no emote matches", () => {
      const tokens = tokenizeThirdPartyEmotesForYoutube("Hello world");
      expect(tokens).toEqual([
        { type: "text", text: "Hello" },
        { type: "text", text: "world" },
      ]);
    });

    it("returns an empty array for empty input", () => {
      expect(tokenizeThirdPartyEmotesForYoutube("")).toEqual([]);
    });

    it("matches 7TV emotes", () => {
      setEmotes7tv({ Cool: "https://cdn.7tv.app/emote/cool/1x.webp" });
      const tokens = tokenizeThirdPartyEmotesForYoutube("Wow Cool");
      expect(tokens).toEqual([
        { type: "text", text: "Wow" },
        {
          type: "emote",
          url: "https://cdn.7tv.app/emote/cool/1x.webp",
          name: "Cool",
          provider: "7TV",
          author: undefined,
          overlays: undefined,
        },
      ]);
    });

    it("matches BTTV emotes", () => {
      setEmotesBttv({ BTTVHype: "https://cdn.bttv.gg/emote/hype/1x.webp" });
      const tokens = tokenizeThirdPartyEmotesForYoutube("hype BTTVHype train");
      expect(tokens[1]).toMatchObject({
        type: "emote",
        url: "https://cdn.bttv.gg/emote/hype/1x.webp",
        name: "BTTVHype",
        provider: "BTTV",
      });
    });

    it("matches FFZ emotes", () => {
      setEmotesFfz({ FFZMod: "https://cdn.frankerfacez.com/emote/mod/1.webp" });
      const tokens = tokenizeThirdPartyEmotesForYoutube("go FFZMod go");
      expect(tokens[1]).toMatchObject({
        type: "emote",
        url: "https://cdn.frankerfacez.com/emote/mod/1.webp",
        name: "FFZMod",
        provider: "FFZ",
      });
    });

    it("prefers 7TV over BTTV over FFZ when the same name exists in multiple providers", () => {
      setEmotes7tv({ Shared: "https://cdn.7tv.app/emote/shared/1x.webp" });
      setEmotesBttv({ Shared: "https://cdn.bttv.gg/emote/shared/1x.webp" });
      setEmotesFfz({ Shared: "https://cdn.frankerfacez.com/emote/shared/1.webp" });
      const tokens = tokenizeThirdPartyEmotesForYoutube("hi Shared bye");
      expect(tokens[1]).toMatchObject({ provider: "7TV" });
    });

    it("skips emotes present in the disabled set", () => {
      setEmotes7tv({ Cool: "https://cdn.7tv.app/emote/cool/1x.webp" });
      const tokens = tokenizeThirdPartyEmotesForYoutube("wow Cool", new Set(["Cool"]));
      expect(tokens).toEqual([
        { type: "text", text: "wow" },
        { type: "text", text: "Cool" },
      ]);
    });

    it("groups a 7TV zero-width overlay onto the preceding base emote", () => {
      setEmotes7tv({
        Base: "https://cdn.7tv.app/emote/base/1x.webp",
        Overlay: "ZW:https://cdn.7tv.app/emote/overlay/1x.webp",
      });
      const tokens = tokenizeThirdPartyEmotesForYoutube("Base Overlay");
      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toMatchObject({
        type: "emote",
        name: "Base",
        provider: "7TV",
        overlays: [
          {
            name: "Overlay",
            url: "https://cdn.7tv.app/emote/overlay/1x.webp",
          },
        ],
      });
    });

    it("stops collecting overlays at a non-overlay word", () => {
      setEmotes7tv({
        Base: "https://cdn.7tv.app/emote/base/1x.webp",
        Overlay: "ZW:https://cdn.7tv.app/emote/overlay/1x.webp",
        Plain: "https://cdn.7tv.app/emote/plain/1x.webp",
      });
      const tokens = tokenizeThirdPartyEmotesForYoutube("Base Overlay Plain");
      expect(tokens).toHaveLength(2);
      expect(tokens[0]).toMatchObject({ name: "Base", overlays: [{ name: "Overlay" }] });
      expect(tokens[1]).toMatchObject({ name: "Plain" });
    });

    it("passes through the bare zero-width emote when it has no preceding base", () => {
      setEmotes7tv({
        Solo: "ZW:https://cdn.7tv.app/emote/solo/1x.webp",
      });
      const tokens = tokenizeThirdPartyEmotesForYoutube("hello Solo");
      expect(tokens[1]).toMatchObject({
        type: "emote",
        name: "Solo",
        url: "https://cdn.7tv.app/emote/solo/1x.webp",
      });
    });
  });
});
