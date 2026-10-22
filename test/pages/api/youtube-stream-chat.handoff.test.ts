import { describe, it, expect } from "vitest";
import { parseHostHandoffBanner } from "../../../src/pages/api/youtube-stream-chat.removal-bridge";

/**
 * Lightweight fake of youtubei.js's `LiveChatBannerRedirect` class. The
 * real `.is()` predicate checks `instanceof YTNodes.LiveChatBannerRedirect`,
 * which we can't replicate without pulling Innertube. Instead our fake's
 * `.is()` matches any class whose `name === "LiveChatBannerRedirect"`,
 * the class name that youtubei.js actually exports.
 */
function makeBannerRedirect({ authorPhotoUrl, actionText, actionTooltip, actionUrl, bannerMessage, hasInlineAction }: {
  authorPhotoUrl?: string | undefined;
  actionText?: string | undefined;
  actionTooltip?: string | undefined;
  actionUrl?: string | undefined;
  bannerMessage?: string | undefined;
  hasInlineAction?: boolean;
}): any {
  return {
    _type: "LiveChatBannerRedirect",
    is: (cls: any) => Boolean(cls) && cls?.name === "LiveChatBannerRedirect",
    banner_message: bannerMessage
      ? {
          toString: () => bannerMessage,
          runs: [{ text: bannerMessage }],
        }
      : undefined,
    author_photo: authorPhotoUrl
      ? [{ url: authorPhotoUrl, thumbnails: [{ url: authorPhotoUrl }] }]
      : [],
    inline_action_button: hasInlineAction
      ? {
          text: actionText !== undefined ? { toString: () => actionText } : undefined,
          accessibility_text: actionTooltip
            ? { toString: () => actionTooltip }
            : undefined,
          url: actionUrl,
        }
      : null,
  };
}

function buildBanner({
  actionId = "banner-1",
  bannerType = undefined as string | undefined,
  authorPhotoUrl = "https://i.ytimg.com/host.jpg",
  actionText,
  actionTooltip,
  actionUrl,
  bannerMessage,
  headerText,
  hasInlineAction = true,
}: {
  actionId?: string;
  bannerType?: string | undefined;
  authorPhotoUrl?: string | undefined;
  actionText?: string;
  actionTooltip?: string;
  actionUrl?: string;
  bannerMessage?: string;
  headerText?: string;
  hasInlineAction?: boolean;
}): any {
  const contents = makeBannerRedirect({
    authorPhotoUrl,
    actionText,
    actionTooltip,
    actionUrl,
    bannerMessage,
    hasInlineAction,
  });
  const banner: any = {
    action_id: actionId,
    banner_type: bannerType,
    contents,
    is: () => true,
  };
  if (headerText) {
    banner.header = { text: { toString: () => headerText } };
  }
  return banner;
}

describe("parseHostHandoffBanner", () => {
  describe("detection", () => {
    it("returns null when the banner contents are not a LiveChatBannerRedirect", () => {
      const banner = {
        action_id: "x",
        contents: {
          _type: "ImageBannerView",
          is: () => false,
        },
      };
      expect(parseHostHandoffBanner(banner)).toBeNull();
    });

    it("returns null when the banner has neither author_photo nor inline_action_button and the text doesn't match", () => {
      const banner = buildBanner({
        authorPhotoUrl: undefined,
        hasInlineAction: false,
        bannerMessage: "Community guidelines: be kind",
      });
      expect(parseHostHandoffBanner(banner)).toBeNull();
    });

    it("emits a raid-host message when author_photo and inline_action_button are both present", () => {
      const banner = buildBanner({
        actionText: "Watch",
        actionUrl: "https://youtube.com/@champion/stream",
      });
      const msg = parseHostHandoffBanner(banner);
      expect(msg).not.toBeNull();
      expect(msg?.messageType).toBe("raidHost");
    });

    it("emits a raid-host message when banner.banner_type indicates a redirect", () => {
      const banner = buildBanner({
        bannerType: "live_chat_banner_redirect",
        authorPhotoUrl: undefined,
        hasInlineAction: false,
        bannerMessage: "Following along",
      });
      const msg = parseHostHandoffBanner(banner);
      expect(msg).not.toBeNull();
      expect(msg?.messageType).toBe("raidHost");
    });

    it("emits a raid-host message when the banner text contains 'hosted'", () => {
      const banner = buildBanner({
        authorPhotoUrl: undefined,
        hasInlineAction: false,
        bannerMessage: "Now hosted by ChampionChannel for charity!",
      });
      const msg = parseHostHandoffBanner(banner);
      expect(msg).not.toBeNull();
      expect(msg?.targetUsername).toBe("ChampionChannel");
    });

    it("emits a raid-host message when the header text contains 'joined from'", () => {
      const banner = buildBanner({
        authorPhotoUrl: undefined,
        hasInlineAction: false,
        headerText: "Joined from ChampionHost's stream",
      });
      const msg = parseHostHandoffBanner(banner, "Joined from ChampionHost's stream");
      expect(msg).not.toBeNull();
    });

    it("emits a raid-host message when text says 'hand off' / 'hand-off'", () => {
      const banner = buildBanner({
        authorPhotoUrl: undefined,
        hasInlineAction: false,
        bannerMessage: "Hand off to next streamer",
      });
      const msg = parseHostHandoffBanner(banner);
      expect(msg).not.toBeNull();
    });
  });

  describe("host name extraction", () => {
    it("extracts the @handle from the action button URL", () => {
      const banner = buildBanner({
        actionUrl: "https://youtube.com/@bigwins/featured",
        actionText: "Watch live",
      });
      const msg = parseHostHandoffBanner(banner);
      expect(msg?.targetUsername).toBe("bigwins");
      expect(msg?.parts[0].text).toBe("Joining raid from bigwins");
    });

    it("falls back to action button text when the URL has no handle", () => {
      const banner = buildBanner({
        actionUrl: "https://youtube.com/watch?v=xyz",
        actionText: "Join GlowStream",
      });
      const msg = parseHostHandoffBanner(banner);
      expect(msg?.targetUsername).toBe("GlowStream");
    });

    it("falls back to the action button's accessibility_text", () => {
      const banner = buildBanner({
        actionUrl: "https://youtube.com/watch?v=xyz",
        actionText: undefined,
        actionTooltip: "Watch CoolStream live",
      });
      const msg = parseHostHandoffBanner(banner);
      expect(msg?.targetUsername).toBe("Watch CoolStream live");
    });

    it("falls back to 'hosting [name]' from the banner text", () => {
      const banner = buildBanner({
        authorPhotoUrl: undefined,
        hasInlineAction: false,
        bannerMessage: "Now hosting SunBurst's premiere!",
      });
      const msg = parseHostHandoffBanner(banner);
      expect(msg?.targetUsername).toBe("SunBurst");
    });

    it('uses "another channel" when nothing parseable is available', () => {
      const banner = buildBanner({
        actionUrl: undefined,
        actionText: undefined,
        actionTooltip: undefined,
      });
      const msg = parseHostHandoffBanner(banner);
      expect(msg?.targetUsername).toBe("another channel");
      expect(msg?.parts[0].text).toBe("A new raid joined the chat");
    });

    it('prefers @handle from URL over action button text', () => {
      const banner = buildBanner({
        actionUrl: "https://youtube.com/@actualhandle/about",
        actionText: "Watch MisleadingLabel",
      });
      const msg = parseHostHandoffBanner(banner);
      expect(msg?.targetUsername).toBe("actualhandle");
    });
  });

  describe("message shape", () => {
    it('uses messageType "raidHost"', () => {
      const msg = parseHostHandoffBanner(buildBanner({}));
      expect(msg?.messageType).toBe("raidHost");
    });

    it("is always authored by System with no moderator/owner/member flags", () => {
      const msg = parseHostHandoffBanner(buildBanner({}));
      expect(msg?.author).toBe("System");
      expect(msg?.authorChannelId).toBeUndefined();
      expect(msg?.authorIsModerator).toBe(false);
      expect(msg?.authorIsOwner).toBe(false);
      expect(msg?.authorIsMember).toBe(false);
    });

    it("stamps a Date timestamp", () => {
      const before = Date.now();
      const msg = parseHostHandoffBanner(buildBanner({}));
      const after = Date.now();
      expect(msg?.timestamp).toBeInstanceOf(Date);
      expect(msg!.timestamp.getTime()).toBeGreaterThanOrEqual(before);
      expect(msg!.timestamp.getTime()).toBeLessThanOrEqual(after);
    });

    it("derives an id prefixed with system-raidHost-", () => {
      const msg = parseHostHandoffBanner(buildBanner({ actionId: "banner-7" }));
      expect(msg?.id).toMatch(/^system-raidHost-/);
    });

    it("derives an id even when banner has no action_id", () => {
      const banner = buildBanner({});
      banner.action_id = undefined as any;
      const msg = parseHostHandoffBanner(banner);
      expect(msg?.id).toMatch(/^system-raidHost-/);
    });

    it("emits a parts array of length 1 with a single text part", () => {
      const msg = parseHostHandoffBanner(buildBanner({}));
      expect(msg?.parts).toHaveLength(1);
      expect(msg?.parts[0].type).toBe("text");
    });

    it("inlines the host's avatar (from author_photo) on the system message", () => {
      const banner = buildBanner({
        authorPhotoUrl: "https://i.ytimg.com/test.jpg",
      });
      const msg = parseHostHandoffBanner(banner);
      expect(msg?.authorAvatar).toBe("https://i.ytimg.com/test.jpg");
    });
  });
});
