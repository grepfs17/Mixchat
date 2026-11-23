import { beforeEach, describe, expect, it } from "vitest";
import {
  clearStoredYoutubeStream,
  parseDirectVideoId,
  pickPrimaryLiveCandidate,
  readStoredYoutubeStream,
  resolveYoutubeVideoId,
  writeStoredYoutubeStream,
  type YoutubeLiveCandidate,
} from "../../src/lib/youtubeStreamSelection";

const LANDSCAPE: YoutubeLiveCandidate = {
  videoId: "landscape11",
  title: "Main stream",
};
const VERTICAL: YoutubeLiveCandidate = {
  videoId: "vertical111",
  title: "Vertical stream",
  isVertical: true,
};

describe("parseDirectVideoId", () => {
  it("accepts a raw video ID", () => {
    expect(parseDirectVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("parses watch, live, shorts, embed and youtu.be URLs", () => {
    expect(
      parseDirectVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    ).toBe("dQw4w9WgXcQ");
    expect(parseDirectVideoId("https://youtube.com/live/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
    expect(
      parseDirectVideoId("https://youtube.com/shorts/dQw4w9WgXcQ?feature=share"),
    ).toBe("dQw4w9WgXcQ");
    expect(parseDirectVideoId("https://youtube.com/embed/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
    expect(parseDirectVideoId("https://youtu.be/dQw4w9WgXcQ?t=10")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("parses scheme-less URLs", () => {
    expect(parseDirectVideoId("youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("returns null for channel URLs and garbage", () => {
    expect(parseDirectVideoId("https://youtube.com/@channel")).toBeNull();
    expect(parseDirectVideoId("https://youtube.com/channel/UC123")).toBeNull();
    expect(parseDirectVideoId("not a video")).toBeNull();
    expect(parseDirectVideoId(null)).toBeNull();
  });
});

describe("pickPrimaryLiveCandidate", () => {
  it("prefers a landscape broadcast", () => {
    expect(pickPrimaryLiveCandidate([VERTICAL, LANDSCAPE])).toBe(LANDSCAPE);
  });

  it("falls back to the first candidate when every broadcast is vertical", () => {
    expect(pickPrimaryLiveCandidate([VERTICAL])).toBe(VERTICAL);
  });

  it("returns null when nothing is live", () => {
    expect(pickPrimaryLiveCandidate([])).toBeNull();
  });
});

describe("resolveYoutubeVideoId", () => {
  it("lets a manual ID win, including unlisted broadcasts", () => {
    expect(
      resolveYoutubeVideoId({
        manualVideoId: "unlisted111",
        storedVideoId: LANDSCAPE.videoId,
        candidates: [LANDSCAPE, VERTICAL],
      }),
    ).toBe("unlisted111");
  });

  it("keeps a stored pick while it is still live", () => {
    expect(
      resolveYoutubeVideoId({
        storedVideoId: VERTICAL.videoId,
        candidates: [LANDSCAPE, VERTICAL],
      }),
    ).toBe(VERTICAL.videoId);
  });

  it("falls back to the primary candidate when the stored pick ended", () => {
    expect(
      resolveYoutubeVideoId({
        storedVideoId: "oldstream11",
        candidates: [LANDSCAPE, VERTICAL],
      }),
    ).toBe(LANDSCAPE.videoId);
  });

  it("returns null when nothing is live", () => {
    expect(resolveYoutubeVideoId({ candidates: [] })).toBeNull();
  });
});

describe("stored stream selection", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("stores and reads a pick per channel", () => {
    writeStoredYoutubeStream("channel-a", "dQw4w9WgXcQ");
    writeStoredYoutubeStream("channel-b", "abcdefghijk");

    expect(readStoredYoutubeStream("channel-a")).toBe("dQw4w9WgXcQ");
    expect(readStoredYoutubeStream("channel-b")).toBe("abcdefghijk");
    expect(readStoredYoutubeStream("channel-c")).toBeNull();
  });

  it("ignores invalid video IDs", () => {
    writeStoredYoutubeStream("channel-a", "not-a-video-id");
    expect(readStoredYoutubeStream("channel-a")).toBeNull();
  });

  it("clears a channel pick without touching the others", () => {
    writeStoredYoutubeStream("channel-a", "dQw4w9WgXcQ");
    writeStoredYoutubeStream("channel-b", "abcdefghijk");

    clearStoredYoutubeStream("channel-a");

    expect(readStoredYoutubeStream("channel-a")).toBeNull();
    expect(readStoredYoutubeStream("channel-b")).toBe("abcdefghijk");
  });
});
