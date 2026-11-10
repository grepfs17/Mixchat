import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import SongQueueMinimizedBar from "../../src/components/chat/shared/SongQueueIndicator";
import type { UseSongQueueResult } from "../../src/hooks/chat/useSongQueue";
import type { SongQueueItem } from "../../src/lib/songQueue/types";

function makeItem(overrides: Partial<SongQueueItem> = {}): SongQueueItem {
  return {
    id: overrides.id || "i1",
    videoId: overrides.videoId || "dQw4w9WgXcQ",
    title: overrides.title || "Never Gonna Give You Up",
    channelTitle: overrides.channelTitle || "Rick Astley",
    thumbnail:
      overrides.thumbnail || "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    durationSec: overrides.durationSec ?? 213,
    submitter: overrides.submitter || {
      userId: "u1",
      author: "Alice",
      platform: "twitch",
    },
    submittedAt: overrides.submittedAt || new Date().toISOString(),
    status: overrides.status || "pending",
  };
}

function makeQueue(overrides: Partial<UseSongQueueResult> = {}): UseSongQueueResult {
  return {
    phase: "open",
    config: {
      title: "",
      maxQueueLength: 50,
      maxSongDurationSec: 600,
      perSubmitterLimit: 1,
      eligibility: "everyone",
      scope: "both",
      isPublic: false,
      announceOnPlay: false,
      loop: false,
    },
    setConfig: vi.fn(),
    bootstrap: {
      sessionId: "session-1",
      ownerToken: "tok-1",
      isPublic: true,
      publicUrl: "/s/session-1",
      title: "",
      channelName: "testchannel",
      channelPlatform: "twitch",
      createdAt: new Date().toISOString(),
    },
    session: null,
    currentItem: makeItem(),
    items: [makeItem(), makeItem({ id: "i2" }), makeItem({ id: "i3", videoId: "AAAAAAAAAAA" })],
    pending: [makeItem({ id: "i2" }), makeItem({ id: "i3", videoId: "AAAAAAAAAAA" })],
    history: [],
    loading: false,
    error: null,
    start: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
    ingestMessage: vi.fn(),
    remove: vi.fn().mockResolvedValue(undefined),
    skip: vi.fn().mockResolvedValue(undefined),
    playNow: vi.fn().mockResolvedValue(undefined),
    next: vi.fn().mockResolvedValue(undefined),
    previous: vi.fn().mockResolvedValue(undefined),
    reportDuration: vi.fn().mockResolvedValue(undefined),
    notifyTooLong: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  if (!("clipboard" in navigator)) {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  }
  document
    .querySelectorAll("#youtube-iframe-api-script")
    .forEach((el) => el.remove());
  if (!("YT" in window)) {
    // Don't define a fake YT here, the player test does its own setup.
  }
});

describe("SongQueueMinimizedBar", () => {
  it("renders the now-playing title from the current item", () => {
    render(<SongQueueMinimizedBar queue={makeQueue()} onOpen={vi.fn()} onEnd={vi.fn()} />);
    expect(screen.getAllByText(/Never Gonna Give You Up/).length).toBeGreaterThanOrEqual(1);
  });

  it("renders the queued-count subheader", () => {
    render(<SongQueueMinimizedBar queue={makeQueue()} onOpen={vi.fn()} onEnd={vi.fn()} />);
    expect(screen.getByText(/2 queued · 0 played/)).toBeInTheDocument();
  });

  it("calls onOpen when the title is clicked", () => {
    const onOpen = vi.fn();
    render(<SongQueueMinimizedBar queue={makeQueue()} onOpen={onOpen} onEnd={vi.fn()} />);
    fireEvent.click(screen.getByTitle("Open song queue in Stream tools"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("wires the next/prev/end buttons to the hook", () => {
    const queue = makeQueue();
    render(<SongQueueMinimizedBar queue={queue} onOpen={vi.fn()} onEnd={vi.fn()} />);
    fireEvent.click(screen.getByTitle("Next"));
    fireEvent.click(screen.getByTitle("Previous"));
    expect(queue.next).toHaveBeenCalledTimes(1);
    expect(queue.previous).toHaveBeenCalledTimes(1);
  });

  it("calls onEnd when the end button is clicked", () => {
    const onEnd = vi.fn();
    render(<SongQueueMinimizedBar queue={makeQueue()} onOpen={vi.fn()} onEnd={onEnd} />);
    fireEvent.click(screen.getByTitle("End queue"));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("starts collapsed and expands when chevron is clicked", () => {
    const queue = makeQueue();
    const { container } = render(
      <SongQueueMinimizedBar queue={queue} onOpen={vi.fn()} onEnd={vi.fn()} />,
    );
    // Player is always in the DOM but body is collapsed
    expect(container.querySelector(".song-queue-bar-player")).toBeInTheDocument();
    // Chevron says "Expand queue bar" because it starts collapsed
    const expandBtn = screen.getByLabelText("Expand queue bar");
    fireEvent.click(expandBtn);
    // Now expanded, full queue list is visible
    const playButtons = screen.getAllByTitle("Play now");
    expect(playButtons).toHaveLength(3);
    fireEvent.click(playButtons[0]);
    expect(queue.playNow).toHaveBeenCalledTimes(1);
  });

  it("toggles the expand state when the chevron is clicked", () => {
    const { container } = render(
      <SongQueueMinimizedBar queue={makeQueue()} onOpen={vi.fn()} onEnd={vi.fn()} />,
    );
    // Starts collapsed
    expect(screen.getByLabelText("Expand queue bar")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Expand queue bar"));
    // Now expanded
    expect(screen.getByLabelText("Collapse queue bar")).toBeInTheDocument();
    // Collapse again
    fireEvent.click(screen.getByLabelText("Collapse queue bar"));
    expect(screen.getByLabelText("Expand queue bar")).toBeInTheDocument();
  });

  it("disables next/prev when there is no current item", () => {
    const queue = makeQueue({ currentItem: undefined, items: [] });
    render(<SongQueueMinimizedBar queue={queue} onOpen={vi.fn()} onEnd={vi.fn()} />);
    expect(screen.getByTitle("Next")).toBeDisabled();
    expect(screen.getByTitle("Previous")).toBeDisabled();
  });

  it("copies the public link to the clipboard", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: write },
      configurable: true,
    });
    render(<SongQueueMinimizedBar queue={makeQueue()} onOpen={vi.fn()} onEnd={vi.fn()} />);
    fireEvent.click(screen.getByTitle("Copy public link"));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    const url = write.mock.calls[0]?.[0] as string;
    expect(url).toMatch(/\/s\/session-1$/);
  });

  it("mounts the YouTube player only on the audio host", () => {
    const { container, unmount } = render(
      <SongQueueMinimizedBar
        queue={makeQueue()}
        isHost
        onOpen={vi.fn()}
        onEnd={vi.fn()}
      />,
    );
    expect(
      container.querySelector(".song-queue-bar-player .song-queue-player-iframe"),
    ).toBeInTheDocument();
    unmount();

    render(
      <SongQueueMinimizedBar
        queue={makeQueue()}
        isHost={false}
        onOpen={vi.fn()}
        onEnd={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Playing on the broadcaster's device"),
    ).toBeInTheDocument();
    expect(document.querySelector(".song-queue-player-iframe")).toBeNull();
  });

  it("disables local play/pause for non-hosts while keeping server controls", () => {
    const queue = makeQueue();
    render(
      <SongQueueMinimizedBar
        queue={queue}
        isHost={false}
        onOpen={vi.fn()}
        onEnd={vi.fn()}
      />,
    );
    const play = screen.getByTestId("song-queue-bar-play");
    expect(play).toBeDisabled();
    expect(play).toHaveAttribute(
      "title",
      "Playing on the broadcaster's device",
    );
    // Volume is host-only (local iframe control).
    expect(screen.queryByLabelText("Volume")).toBeNull();
    // Server-side index changes stay available to moderators.
    fireEvent.click(screen.getByTitle("Next"));
    expect(queue.next).toHaveBeenCalledTimes(1);
  });

  it("lets a non-host start the queue when nothing has played yet", () => {
    const queue = makeQueue({
      currentItem: undefined,
      items: [makeItem({ id: "i1" })],
      pending: [makeItem({ id: "i1" })],
    });
    render(
      <SongQueueMinimizedBar
        queue={queue}
        isHost={false}
        onOpen={vi.fn()}
        onEnd={vi.fn()}
      />,
    );
    const play = screen.getByTestId("song-queue-bar-play");
    expect(play).toBeEnabled();
    fireEvent.click(play);
    expect(queue.playNow).toHaveBeenCalledWith("i1");
  });
});
