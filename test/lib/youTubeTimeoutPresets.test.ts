import { describe, it, expect } from "vitest";
import {
  YOUTUBE_TIMEOUT_PRESETS,
  YOUTUBE_MAX_TIMEOUT_SECONDS,
  YOUTUBE_MIN_TIMEOUT_SECONDS,
  formatTimeoutDuration,
} from "../../src/lib/youTubeTimeoutPresets";

describe("youTubeTimeoutPresets", () => {
  it("matches the YouTube Studio live-chat dialog set", () => {
    expect(YOUTUBE_TIMEOUT_PRESETS.map((p) => p.seconds)).toEqual([
      60, 300, 600, 3600, 86400,
    ]);
  });

  it("is within the Data API banDurationSeconds bounds", () => {
    for (const p of YOUTUBE_TIMEOUT_PRESETS) {
      expect(p.seconds).toBeGreaterThanOrEqual(YOUTUBE_MIN_TIMEOUT_SECONDS);
      expect(p.seconds).toBeLessThanOrEqual(YOUTUBE_MAX_TIMEOUT_SECONDS);
    }
  });

  it("formats seconds/minutes/hours/days", () => {
    expect(formatTimeoutDuration(30)).toBe("30s");
    expect(formatTimeoutDuration(60)).toBe("1m");
    expect(formatTimeoutDuration(600)).toBe("10m");
    expect(formatTimeoutDuration(3600)).toBe("1.0h");
    expect(formatTimeoutDuration(86400)).toBe("1d");
  });
});
