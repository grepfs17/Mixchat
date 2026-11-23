import { describe, expect, it } from "vitest";
import {
  collectLiveCandidates,
  toYoutubeLiveCandidate,
} from "../../src/lib/youtube-lookup";

function lockup(overrides: Record<string, unknown> = {}) {
  return {
    type: "LockupView",
    content_id: "landscape11",
    content_type: "VIDEO",
    styling: { content_image_aspect_ratio: "LOCKUP_CONTENT_IMAGE_ASPECT_RATIO_LANDSCAPE" },
    metadata: {
      title: { toString: () => "Main stream" },
      metadata: {
        metadata_rows: [{ badges: [{ style: "BADGE_STYLE_TYPE_LIVE" }] }],
      },
    },
    content_image: {
      image: [
        { url: "https://img.example/small.jpg", width: 100, height: 56 },
        { url: "https://img.example/large.jpg", width: 400, height: 225 },
      ],
    },
    ...overrides,
  };
}

describe("toYoutubeLiveCandidate", () => {
  it("builds a landscape candidate from a live lockup", () => {
    expect(toYoutubeLiveCandidate(lockup())).toEqual({
      videoId: "landscape11",
      title: "Main stream",
      thumbnailUrl: "https://img.example/large.jpg",
    });
  });

  it("flags a portrait broadcast as vertical", () => {
    const candidate = toYoutubeLiveCandidate(
      lockup({
        content_id: "vertical111",
        styling: {
          content_image_aspect_ratio:
            "LOCKUP_CONTENT_IMAGE_ASPECT_RATIO_PORTRAIT",
        },
        metadata: {
          title: { toString: () => "Vertical stream" },
          metadata: {
            metadata_rows: [{ badges: [{ style: "BADGE_STYLE_TYPE_LIVE" }] }],
          },
        },
      }),
    );

    expect(candidate?.isVertical).toBe(true);
    expect(candidate?.title).toBe("Vertical stream");
  });

  it("detects vertical from a portrait thumbnail when styling is missing", () => {
    const candidate = toYoutubeLiveCandidate(
      lockup({
        styling: undefined,
        content_image: {
          image: [{ url: "https://img.example/portrait.jpg", width: 320, height: 568 }],
        },
      }),
    );

    expect(candidate?.isVertical).toBe(true);
  });

  it("ignores lockups that are not live", () => {
    const candidate = toYoutubeLiveCandidate(
      lockup({
        metadata: {
          title: { toString: () => "Past stream" },
          metadata: { metadata_rows: [] },
        },
      }),
    );

    expect(candidate).toBeNull();
  });

  it("accepts the legacy videoRenderer shape", () => {
    const candidate = toYoutubeLiveCandidate({
      video_id: "oldrendere1",
      title: { toString: () => "Legacy live" },
      thumbnails: [
        { url: "https://img.example/legacy.jpg", width: 320, height: 180 },
      ],
      badges: [{ metadataBadgeRenderer: { label: "LIVE" } }],
    });

    expect(candidate).toEqual({
      videoId: "oldrendere1",
      title: "Legacy live",
      thumbnailUrl: "https://img.example/legacy.jpg",
    });
  });
});

describe("collectLiveCandidates", () => {
  it("keeps every live broadcast in order and drops duplicates", () => {
    const vertical = lockup({
      content_id: "vertical111",
      styling: {
        content_image_aspect_ratio:
          "LOCKUP_CONTENT_IMAGE_ASPECT_RATIO_PORTRAIT",
      },
    });
    const landscape = lockup();
    const duplicate = lockup();
    const offline = lockup({
      metadata: {
        title: { toString: () => "Past stream" },
        metadata: { metadata_rows: [] },
      },
    });

    const candidates = collectLiveCandidates([
      vertical,
      landscape,
      duplicate,
      offline,
    ]);

    expect(candidates.map((c) => c.videoId)).toEqual([
      "vertical111",
      "landscape11",
    ]);
  });
});
