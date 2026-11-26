import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import StreamEmbed from "../../src/components/StreamEmbed";

vi.mock("hls.js", () => ({
  default: {
    isSupported: vi.fn(() => false),
    Events: {
      MANIFEST_PARSED: "hlsManifestParsed",
      ERROR: "hlsError",
    },
  },
}));

const QUALITIES = [
  { name: "Auto", group: "auto" },
  {
    name: "1080p60 (source)",
    group: "chunked",
    height: 1080,
    bitrate: 6_000_000,
  },
  { name: "720p60", group: "720p60", height: 720, bitrate: 3_000_000 },
  { name: "720p", group: "720p30", height: 720, bitrate: 2_000_000 },
  { name: "480p", group: "480p30", height: 480, bitrate: 1_200_000 },
];

const setQuality = vi.fn();
const getQuality = vi.fn(() => ({ name: "Auto", group: "auto" }));
const embedOptions: Array<Record<string, unknown>> = [];

const player = {
  getQualities: () => QUALITIES,
  getQuality,
  setQuality,
  setChannel: vi.fn(),
  destroy: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  getPaused: () => false,
  getCurrentTime: () => 0,
  getMuted: () => false,
  setMuted: vi.fn(),
  setVolume: vi.fn(),
  getVolume: () => 0,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

class MockTwitchEmbed {
  constructor(
    _elementId: string,
    options: Record<string, unknown>,
  ) {
    embedOptions.push(options);
  }

  getPlayer = () => player;
  destroy = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
}

beforeEach(() => {
  setQuality.mockClear();
  getQuality.mockClear();
  embedOptions.length = 0;

  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/parent-domain")) {
        return { ok: true, json: async () => ({ parentDomain: "localhost" }) };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }),
  );
  (window as unknown as { Twitch: unknown }).Twitch = {
    Embed: MockTwitchEmbed,
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (window as unknown as { Twitch?: unknown }).Twitch;
});

describe("Twitch embed default resolution", () => {
  it("sets the best quality object at or below the chosen resolution", async () => {
    const { unmount } = render(
      <StreamEmbed
        channelName="quality-channel"
        playerType="embed"
        defaultResolution="720p"
      />,
    );

    await waitFor(() => expect(setQuality).toHaveBeenCalled());
    expect(embedOptions[0]?.quality).toBe("720p");
    expect(embedOptions).toHaveLength(1);
    expect(setQuality).toHaveBeenCalledWith(QUALITIES[2]);
    expect(setQuality).toHaveBeenCalledTimes(1);

    unmount();
  });

  it("reapplies when the default resolution changes while the embed is open", async () => {
    const { rerender, unmount } = render(
      <StreamEmbed
        channelName="quality-channel"
        playerType="embed"
        defaultResolution="1080p"
      />,
    );

    await waitFor(() =>
      expect(setQuality).toHaveBeenCalledWith(QUALITIES[1]),
    );

    setQuality.mockClear();
    rerender(
      <StreamEmbed
        channelName="quality-channel"
        playerType="embed"
        defaultResolution="720p"
      />,
    );

    await waitFor(() =>
      expect(setQuality).toHaveBeenCalledWith(QUALITIES[2]),
    );

    unmount();
  });
});
