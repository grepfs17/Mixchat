import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import SongQueuePlayer from "../../src/components/chat/shared/SongQueuePlayer";
import type { SongQueueItem } from "../../src/lib/songQueue/types";

function makeItem(id: string, videoId: string): SongQueueItem {
  return {
    id,
    videoId,
    title: `Title ${id}`,
    channelTitle: "Channel",
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    durationSec: 0,
    submitter: { userId: "u1", author: "Alice", platform: "twitch" },
    submittedAt: new Date().toISOString(),
    status: "pending",
  };
}

interface FakePlayer {
  loadVideoById: ReturnType<typeof vi.fn>;
  playVideo: ReturnType<typeof vi.fn>;
  pauseVideo: ReturnType<typeof vi.fn>;
  getDuration: ReturnType<typeof vi.fn>;
  getCurrentTime: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  _onStateChange: ((e: { data: number; target: FakePlayer }) => void) | null;
  _onReady: ((e: { target: FakePlayer }) => void) | null;
  _fireStateChange(data: number): void;
}

function installFakeYT() {
  const created: FakePlayer[] = [];
  (window as any).YT = {
    PlayerState: {
      UNSTARTED: -1,
      ENDED: 0,
      PLAYING: 1,
      PAUSED: 2,
      BUFFERING: 3,
      CUED: 5,
    },
    Player: function (
      _el: HTMLElement,
      opts: {
        events?: {
          onReady?: (e: { target: FakePlayer }) => void;
          onStateChange?: (e: { data: number; target: FakePlayer }) => void;
        };
      },
    ) {
      const player: FakePlayer = {
        loadVideoById: vi.fn(),
        playVideo: vi.fn(),
        pauseVideo: vi.fn(),
        getDuration: vi.fn().mockReturnValue(0),
        getCurrentTime: vi.fn().mockReturnValue(0),
        destroy: vi.fn(),
        _onStateChange: opts.events?.onStateChange || null,
        _onReady: opts.events?.onReady || null,
        _fireStateChange(data) {
          this._onStateChange?.({ data, target: this });
        },
      };
      // Fire onReady synchronously so the second effect runs.
      opts.events?.onReady?.({ target: player });
      created.push(player);
      return player;
    },
  };
  return created;
}

beforeEach(() => {
  // jsdom doesn't ship window.YT; install the fake.
  delete (window as any).YT;
  // Avoid actually loading the IFrame script during the test.
  document
    .querySelectorAll('script[data-yt-iframe-api="1"]')
    .forEach((el) => el.remove());
  if (!window.onYouTubeIframeAPIReady) {
    (window as any).onYouTubeIframeAPIReady = () => undefined;
  }
});

afterEach(() => {
  delete (window as any).YT;
  document
    .querySelectorAll('script[data-yt-iframe-api="1"]')
    .forEach((el) => el.remove());
});

describe("SongQueuePlayer", () => {
    it("calls loadVideoById for the current item when items change", async () => {
    const created = installFakeYT();
    const items = [makeItem("a", "AAAAAAAAAAA"), makeItem("b", "BBBBBBBBBBB")];
    render(<SongQueuePlayer items={items} currentIndex={0} />);
    // Allow the async loadIFrameAPI + the second sync effect to settle.
    await new Promise((r) => setTimeout(r, 10));
    expect(created).toHaveLength(1);
    expect(created[0].loadVideoById).toHaveBeenCalledWith("AAAAAAAAAAA");
  });

  it("recreates the player when only the currentIndex changes", async () => {
    const created = installFakeYT();
    const items = [makeItem("a", "AAAAAAAAAAA"), makeItem("b", "BBBBBBBBBBB")];
    const { rerender } = render(
      <SongQueuePlayer items={items} currentIndex={0} />,
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(created).toHaveLength(1);
    expect(created[0].loadVideoById).toHaveBeenCalledWith("AAAAAAAAAAA");

    rerender(<SongQueuePlayer items={items} currentIndex={1} />);
    await new Promise((r) => setTimeout(r, 10));
    // A fresh player is created with the new videoId because initialVideoId
    // changed — the mount effect depends on it.
    expect(created).toHaveLength(2);
  });

  it("invokes onAdvance when the player reports ENDED", async () => {
    const created = installFakeYT();
    const items = [makeItem("a", "AAAAAAAAAAA")];
    const onAdvance = vi.fn();
    render(
      <SongQueuePlayer items={items} currentIndex={0} onAdvance={onAdvance} />,
    );
    await new Promise((r) => setTimeout(r, 10));
    const player = created[0];
    expect(player.loadVideoById).toHaveBeenCalledWith("AAAAAAAAAAA");
    player._fireStateChange(0); // YT.PlayerState.ENDED
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it("does NOT call loadVideoById when a new item is appended but the current song is unchanged", async () => {
    const created = installFakeYT();
    const itemA = makeItem("a", "AAAAAAAAAAA");
    const itemB = makeItem("b", "BBBBBBBBBBB");
    const { rerender } = render(
      <SongQueuePlayer items={[itemA]} currentIndex={0} />,
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(created).toHaveLength(1);
    const player = created[0];
    // Initial load.
    expect(player.loadVideoById).toHaveBeenCalledTimes(1);
    expect(player.loadVideoById).toHaveBeenCalledWith("AAAAAAAAAAA");
    player.loadVideoById.mockClear();

    // Simulate !songadd: a new item is appended at index 1 while index 0
    // is still playing. loadVideoById must NOT be called again.
    rerender(
      <SongQueuePlayer items={[itemA, itemB]} currentIndex={0} />,
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(player.loadVideoById).not.toHaveBeenCalled();
    // Only one player should exist (no remount).
    expect(created).toHaveLength(1);
  });

  it("calls destroy on unmount", async () => {
    const created = installFakeYT();
    const items = [makeItem("a", "AAAAAAAAAAA")];
    const { unmount } = render(<SongQueuePlayer items={items} currentIndex={0} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(created[0].destroy).not.toHaveBeenCalled();
    unmount();
    expect(created[0].destroy).toHaveBeenCalledTimes(1);
  });
});
