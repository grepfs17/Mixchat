import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import StreamEmbed from "../../src/components/StreamEmbed";

vi.mock("hls.js", () => {
  class MockHls {
    static isSupported = () => true;
    static Events = {
      MANIFEST_PARSED: "hlsManifestParsed",
      ERROR: "hlsError",
    };
    on = vi.fn();
    loadSource = vi.fn();
    attachMedia = vi.fn();
    destroy = vi.fn();
  }
  return { default: MockHls };
});

const QUALITIES = [
  {
    label: "1440p60 (source)",
    url: "/api/hls-proxy?url=hevc",
    codecs: 'hvc1.1.6.L153.B0,mp4a.40.2',
  },
  {
    label: "1080p60",
    url: "/api/hls-proxy?url=h264",
    codecs: "avc1.64002A,mp4a.40.2",
  },
];

function playlistFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/parent-domain")) {
      return { ok: true, json: async () => ({ parentDomain: "localhost" }) };
    }
    if (url.startsWith("/api/stream-playlist")) {
      return {
        ok: true,
        json: async () => ({ qualities: QUALITIES, authenticated: false }),
      };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

const fetchMock = playlistFetch();

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("StreamEmbed codec negotiation", () => {
  it("asks for H.264 only and hides HEVC variants when HEVC cannot be decoded", async () => {
    vi.stubGlobal("MediaSource", {
      isTypeSupported: (type: string) => type.includes("avc1"),
    });

    const onQualitiesLoaded = vi.fn();
    render(
      <StreamEmbed
        channelName="codec-channel"
        playerType="m3u8"
        onQualitiesLoaded={onQualitiesLoaded}
      />,
    );

    await waitFor(() => expect(onQualitiesLoaded).toHaveBeenCalled());

    const playlistUrl = fetchMock.mock.calls
      .map(([input]) => String(input))
      .find((url) => url.startsWith("/api/stream-playlist"));
    expect(
      new URL(playlistUrl!, "http://localhost").searchParams.get("codecs"),
    ).toBe("h264");

    const calls = onQualitiesLoaded.mock.calls;
    const qualities = calls[calls.length - 1][0];
    expect(qualities).toHaveLength(1);
    expect(qualities[0].label).toBe("1080p60");
  });

  it("asks for HEVC and keeps the 1440p variant when HEVC can be decoded", async () => {
    vi.stubGlobal("MediaSource", {
      isTypeSupported: (type: string) => type.includes("hvc1"),
    });

    const onQualitiesLoaded = vi.fn();
    render(
      <StreamEmbed
        channelName="codec-channel"
        playerType="m3u8"
        onQualitiesLoaded={onQualitiesLoaded}
      />,
    );

    await waitFor(() => expect(onQualitiesLoaded).toHaveBeenCalled());

    const playlistUrl = fetchMock.mock.calls
      .map(([input]) => String(input))
      .find((url) => url.startsWith("/api/stream-playlist"));
    expect(
      new URL(playlistUrl!, "http://localhost").searchParams.get("codecs"),
    ).toBe("h265,h264");

    const calls = onQualitiesLoaded.mock.calls;
    const qualities = calls[calls.length - 1][0];
    expect(qualities.map((quality: { label: string }) => quality.label)).toEqual([
      "1440p60 (source)",
      "1080p60",
    ]);
  });
});
