import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import TwitchVods from "../../src/components/TwitchVods";

const videos = [
  {
    id: "v111",
    title: "First VOD",
    thumbnailUrl: "https://static-cdn.jtvnw.net/cf_vods/one.jpg",
    url: "https://www.twitch.tv/videos/v111",
    duration: "1h2m3s",
    viewCount: 1200,
    createdAt: "2026-11-01T12:00:00Z",
    type: "archive",
  },
  {
    id: "v222",
    title: "Second VOD",
    thumbnailUrl: "https://static-cdn.jtvnw.net/cf_vods/two.jpg",
    url: "https://www.twitch.tv/videos/v222",
    duration: "45m10s",
    viewCount: 42,
    createdAt: "2026-10-30T12:00:00Z",
    type: "archive",
  },
];

class MockIntersectionObserver {
  private callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }

  observe() {
    queueMicrotask(() =>
      this.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      ),
    );
  }

  disconnect() {}

  unobserve() {}

  takeRecords() {
    return [];
  }
}

function mockFetch(videosResponse: unknown) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/parent-domain")) {
      return Promise.resolve(
        new Response(JSON.stringify({ parentDomain: "localhost" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.includes("/api/twitch-videos")) {
      return Promise.resolve(
        new Response(JSON.stringify(videosResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    return Promise.resolve(new Response("{}", { status: 404 }));
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("TwitchVods", () => {
  it("lists the channel VODs with duration and views", async () => {
    vi.stubGlobal("fetch", mockFetch({ videos }));

    render(
      <TwitchVods
        channelName="somechannel"
        channelIsLive={false}
        activeMedia={null}
        onSelectMedia={vi.fn()}
      />,
    );

    expect(await screen.findByText("First VOD")).toBeInTheDocument();
    expect(screen.getByText("Second VOD")).toBeInTheDocument();
    expect(screen.getByText("1:02:03")).toBeInTheDocument();
    expect(screen.getByText("45:10")).toBeInTheDocument();
    expect(screen.getByText(/1\.2K views/)).toBeInTheDocument();
    expect(screen.getByText(/42 views/)).toBeInTheDocument();
    expect(screen.getByText("OFFLINE")).toBeInTheDocument();
  });

  it("shows a LIVE badge when browsing the archive on an online channel", async () => {
    vi.stubGlobal("fetch", mockFetch({ videos }));

    render(
      <TwitchVods
        channelName="somechannel"
        channelIsLive={true}
        activeMedia={null}
        onSelectMedia={vi.fn()}
      />,
    );

    expect(await screen.findByText("First VOD")).toBeInTheDocument();
    expect(screen.getByText("LIVE")).toBeInTheDocument();
    expect(screen.queryByText("OFFLINE")).not.toBeInTheDocument();
  });

  it("requests VODs for the given channel login", async () => {
    const fetchMock = mockFetch({ videos });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <TwitchVods
        channelName="somechannel"
        channelIsLive={false}
        activeMedia={null}
        onSelectMedia={vi.fn()}
      />,
    );
    await screen.findByText("First VOD");

    const videoCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/api/twitch-videos"),
    );
    expect(String(videoCall?.[0])).toContain("login=somechannel");
  });

  it("switches to featured clips, plays inline, and offers Clip Explorer", async () => {
    const clipUrl =
      "https://www.twitch.tv/lunateac/clip/GleamingHedonisticFerretItsBoshyTime-IqoSysFgMS3Luf6u";
    const clips = [
      {
        id: "FunnyClip-abc123",
        url: clipUrl,
        title: "Funny clip",
        thumbnailUrl: "https://clips-media-assets2.twitch.tv/preview.jpg",
        duration: 28,
        viewCount: 300,
        createdAt: "2026-11-02T12:00:00Z",
        creatorName: "clipper",
      },
    ];
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/parent-domain")) {
        return Promise.resolve(
          new Response(JSON.stringify({ parentDomain: "localhost" }), {
            status: 200,
          }),
        );
      }
      const body = url.includes("/api/twitch-clips")
        ? { clips, cursor: null }
        : { videos, cursor: null };
      return Promise.resolve(
        new Response(JSON.stringify(body), { status: 200 }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const onSelectMedia = vi.fn();

    render(
      <TwitchVods
        channelName="somechannel"
        channelIsLive={false}
        activeMedia={null}
        onSelectMedia={onSelectMedia}
      />,
    );
    await screen.findByText("First VOD");

    await userEvent.click(screen.getByRole("tab", { name: "Featured Clips" }));

    const clipButton = await screen.findByRole("button", {
      name: /Funny clip/i,
    });
    await userEvent.click(clipButton);
    expect(onSelectMedia).toHaveBeenCalledWith({
      type: "clip",
      id: "FunnyClip-abc123",
      url: clipUrl,
    });

    const link = screen.getByRole("link", { name: "Open in Clip Explorer" });
    expect(link).toHaveAttribute(
      "href",
      `https://twitchclipexplorer.grepfs.xyz/?v=${encodeURIComponent(clipUrl)}`,
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(
      screen.getByRole("tab", { name: "Featured Clips" }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("refetches clips when the filters change", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/parent-domain")) {
        return Promise.resolve(
          new Response(JSON.stringify({ parentDomain: "localhost" }), {
            status: 200,
          }),
        );
      }
      const body = url.includes("/api/twitch-clips")
        ? { clips: [], cursor: null }
        : { videos, cursor: null };
      return Promise.resolve(
        new Response(JSON.stringify(body), { status: 200 }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <TwitchVods
        channelName="somechannel"
        channelIsLive={false}
        activeMedia={null}
        onSelectMedia={vi.fn()}
      />,
    );
    await screen.findByText("First VOD");
    await userEvent.click(screen.getByRole("tab", { name: "Featured Clips" }));

    const clipCalls = () =>
      fetchMock.mock.calls
        .map(([url]) => String(url))
        .filter((url) => url.includes("/api/twitch-clips"));

    await waitFor(() => {
      expect(clipCalls().some((url) => url.includes("period=month"))).toBe(
        true,
      );
    });
    expect(clipCalls().every((url) => !url.includes("featured=true"))).toBe(
      true,
    );

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: /Filter by/i }),
      "all",
    );
    await waitFor(() => {
      expect(clipCalls().some((url) => url.includes("period=all"))).toBe(true);
    });

    await userEvent.click(
      screen.getByRole("checkbox", { name: /Featured only/i }),
    );
    await waitFor(() => {
      expect(clipCalls().some((url) => url.includes("featured=true"))).toBe(
        true,
      );
    });
  });

  it("loads additional pages when the sentinel intersects", async () => {
    const pageTwo = [
      {
        id: "v333",
        title: "Third VOD",
        thumbnailUrl: "https://static-cdn.jtvnw.net/cf_vods/three.jpg",
        url: "https://www.twitch.tv/videos/v333",
        duration: "30m",
        viewCount: 5,
        createdAt: "2026-10-20T12:00:00Z",
        type: "archive",
      },
    ];
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/parent-domain")) {
        return Promise.resolve(
          new Response(JSON.stringify({ parentDomain: "localhost" }), {
            status: 200,
          }),
        );
      }
      const body = url.includes("after=next")
        ? { videos: pageTwo, cursor: null }
        : { videos, cursor: "next" };
      return Promise.resolve(
        new Response(JSON.stringify(body), { status: 200 }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

    render(
      <TwitchVods
        channelName="somechannel"
        channelIsLive={false}
        activeMedia={null}
        onSelectMedia={vi.fn()}
      />,
    );

    expect(await screen.findByText("Third VOD")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Load more" }),
    ).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("after=next")),
    ).toBe(true);
  });

  it("reports the selected VOD to the parent", async () => {
    const onSelectMedia = vi.fn();
    vi.stubGlobal("fetch", mockFetch({ videos }));

    render(
      <TwitchVods
        channelName="somechannel"
        channelIsLive={false}
        activeMedia={null}
        onSelectMedia={onSelectMedia}
      />,
    );
    await screen.findByText("First VOD");

    await userEvent.click(screen.getByText("First VOD"));

    expect(onSelectMedia).toHaveBeenCalledWith({ type: "vod", id: "v111" });
  });

  it("renders only the player when media is active", async () => {
    vi.stubGlobal("fetch", mockFetch({ videos }));

    render(
      <TwitchVods
        channelName="somechannel"
        channelIsLive={false}
        activeMedia={{ type: "vod", id: "v111" }}
        onSelectMedia={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText("Second VOD")).not.toBeInTheDocument();
    });
  });

  it("renders the Twitch clip iframe for an active clip", async () => {
    // The API may return a canonical domain, but Twitch validates the real
    // ancestor origin, so the browser hostname must win.
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/parent-domain")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ parentDomain: "canonical.example" }),
              { status: 200 },
            ),
          );
        }
        return Promise.resolve(new Response("{}", { status: 404 }));
      }),
    );

    render(
      <TwitchVods
        channelName="somechannel"
        channelIsLive={false}
        activeMedia={{
          type: "clip",
          id: "FunnyClip-abc123",
          url: "https://www.twitch.tv/somechannel/clip/FunnyClip-abc123",
        }}
        onSelectMedia={vi.fn()}
      />,
    );

    const iframe = await screen.findByTitle("Twitch clip");
    const src = iframe.getAttribute("src") ?? "";
    expect(src).toContain("clips.twitch.tv/embed?clip=FunnyClip-abc123");
    expect(src).toContain("parent=localhost");
    expect(src).toContain("autoplay=true");
  });

  it("shows an empty state when the channel has no VODs", async () => {
    vi.stubGlobal("fetch", mockFetch({ videos: [] }));

    render(
      <TwitchVods
        channelName="somechannel"
        channelIsLive={false}
        activeMedia={null}
        onSelectMedia={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("No VODs available for this channel"),
      ).toBeInTheDocument();
    });
  });

  it("shows the API error message when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/parent-domain")) {
          return Promise.resolve(
            new Response(JSON.stringify({ parentDomain: "localhost" }), {
              status: 200,
            }),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ error: "Too many requests" }), {
            status: 429,
          }),
        );
      }),
    );

    render(
      <TwitchVods
        channelName="somechannel"
        channelIsLive={false}
        activeMedia={null}
        onSelectMedia={vi.fn()}
      />,
    );

    expect(await screen.findByText("Too many requests")).toBeInTheDocument();
  });
});
