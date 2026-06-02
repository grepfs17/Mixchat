import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import WatchlistManager from "../../src/components/WatchlistManager";
import { addWatchedStreamer } from "../../src/lib/streamMonitor";

describe("WatchlistManager component", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("adds and removes a watched streamer using localStorage", async () => {
    const availableChannels = [
      {
        id: "1",
        name: "chan1",
        displayName: "Channel One",
        title: "",
        profileImageUrl: "",
      },
      {
        id: "2",
        name: "chan2",
        displayName: "Channel Two",
        title: "",
        profileImageUrl: "",
      },
    ];

    const onClose = vi.fn();

    // Programmatically add one streamer to localStorage before rendering
    addWatchedStreamer({ id: "1", name: "chan1", displayName: "Channel One" });

    render(
      <WatchlistManager
        availableChannels={availableChannels}
        onClose={onClose}
      />,
    );

    // The watched streamer should appear
    expect(
      screen.queryByText("No streamers being watched yet"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Channel One")).toBeInTheDocument();

    // localStorage should contain the saved streamer
    const saved = JSON.parse(
      localStorage.getItem("mixchat_watched_streamers") || "[]",
    );
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe("1");

    // Remove the streamer via the UI
    const removeButton = screen.getByTitle("Remove from watchlist");
    await userEvent.click(removeButton);

    // Should be empty again (wait for DOM update)
    await screen.findByText("No streamers being watched yet");
    const savedAfter = JSON.parse(
      localStorage.getItem("mixchat_watched_streamers") || "[]",
    );
    expect(savedAfter).toHaveLength(0);
  });
});
