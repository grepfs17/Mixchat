import { describe, it, expect } from "vitest";

// Use require-style import so we don't pull the entire SSE handler module
// (which transitively imports Innertube and would slow tests down).
// eslint-disable-next-line @typescript-eslint/no-require-imports
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// Vitest supports importing via the source path with a string; we re-export
// the helpers from a small bridge file to keep this test pure.
import {
  parseBadges,
  isAuthorModerator,
  isAuthorOwner,
} from "../../../src/pages/api/youtube-stream-chat.badge-bridge";

function makeModBadge() {
  return {
    icon_type: "MODERATOR",
    tooltip: "Moderator",
    label: "Moderator",
    custom_thumbnail: [
      {
        url: "https://example.com/mod.png",
        thumbnails: [{ url: "https://example.com/mod.png" }],
      },
    ],
  };
}

function makeVerifiedBadge() {
  return {
    style: "BADGE_STYLE_TYPE_VERIFIED",
    tooltip: "Verified",
    label: "Verified",
    custom_thumbnail: [
      {
        url: "https://example.com/verified.png",
      },
    ],
  };
}

describe("YouTube chat badge parsing", () => {
  describe("isAuthorModerator", () => {
    it("returns true when the Author instance already has is_moderator=true", () => {
      expect(
        isAuthorModerator({ author: { is_moderator: true, badges: [] } }),
      ).toBe(true);
    });

    it("returns true when a badge has icon_type=MODERATOR", () => {
      expect(
        isAuthorModerator({
          author: { badges: [makeModBadge()] },
        }),
      ).toBe(true);
    });

    it("returns true when a badge label contains 'Moderator'", () => {
      expect(
        isAuthorModerator({
          author: {
            badges: [
              {
                label: "Live Chat Moderator",
                thumbnails: [{ url: "https://example.com/m.png" }],
              },
            ],
          },
        }),
      ).toBe(true);
    });

    it("returns false when the author has no mod signals", () => {
      expect(
        isAuthorModerator({
          author: { badges: [makeVerifiedBadge()] },
        }),
      ).toBe(false);
    });

    it("returns false when there are no badges at all", () => {
      expect(isAuthorModerator({ author: {} })).toBe(false);
    });
  });

  describe("isAuthorOwner", () => {
    it("returns true when the Author instance has is_verified=true", () => {
      expect(
        isAuthorOwner({ author: { is_verified: true, badges: [] } }),
      ).toBe(true);
    });

    it("returns true when a badge has style=BADGE_STYLE_TYPE_VERIFIED", () => {
      expect(
        isAuthorOwner({ author: { badges: [makeVerifiedBadge()] } }),
      ).toBe(true);
    });

    it("returns true when a badge label contains 'Owner'", () => {
      expect(
        isAuthorOwner({
          author: {
            badges: [
              {
                label: "Owner",
                thumbnails: [{ url: "https://example.com/o.png" }],
              },
            ],
          },
        }),
      ).toBe(true);
    });

    it("returns false for a mod-only badge", () => {
      expect(
        isAuthorOwner({ author: { badges: [makeModBadge()] } }),
      ).toBe(false);
    });
  });

  describe("parseBadges", () => {
    it("saves the icon URL keyed by label for a custom_thumbnail badge", () => {
      const out = parseBadges({
        author: { badges: [makeModBadge()] },
      });
      expect(out).toEqual({
        Moderator: "https://example.com/mod.png",
      });
    });

    it("falls back to the simple url property when thumbnails are absent", () => {
      const out = parseBadges({
        author: { badges: [makeVerifiedBadge()] },
      });
      expect(out).toEqual({
        Verified: "https://example.com/verified.png",
      });
    });

    it("uses the tooltip when label is missing", () => {
      const out = parseBadges({
        author: {
          badges: [
            {
              icon_type: "MODERATOR",
              tooltip: "Moderator",
              thumbnails: [{ url: "https://example.com/m.png" }],
            },
          ],
        },
      });
      expect(out).toEqual({ Moderator: "https://example.com/m.png" });
    });

    it("skips badges with no usable icon URL", () => {
      const out = parseBadges({
        author: { badges: [{ label: "Unknown" }] },
      });
      expect(out).toEqual({});
    });
  });
});
