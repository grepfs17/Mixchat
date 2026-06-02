import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import YouTubeLinker from "../../src/components/YouTubeLinker";
import { addYoutubeLink } from "../../src/lib/youtubeLinks";

describe("YouTubeLinker component", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("displays an existing link and allows removal", async () => {
    const availableChannels = [
      {
        id: "a",
        name: "chanA",
        displayName: "Channel A",
        title: "Channel A title",
        profileImageUrl: "",
      },
      {
        id: "b",
        name: "chanB",
        displayName: "Channel B",
        title: "Channel B title",
        profileImageUrl: "",
      },
    ];

    // Programmatically add a link
    addYoutubeLink({
      twitchChannelId: "a",
      twitchDisplayName: "Channel A",
      youtubeUrl: "https://www.youtube.com/@channelA",
    });

    const onClose = vi.fn();

    render(
      <YouTubeLinker availableChannels={availableChannels} onClose={onClose} />,
    );

    // The linked item should appear
    expect(screen.getByText("Channel A")).toBeInTheDocument();
    expect(
      screen.getByText("https://www.youtube.com/@channelA"),
    ).toBeInTheDocument();

    // Remove via UI
    const removeButton = screen.getByTitle("Remove YouTube link");
    await userEvent.click(removeButton);

    // Now the empty message should be shown
    await screen.findByText("No YouTube channels linked yet");
    const saved = JSON.parse(
      localStorage.getItem("mixchat_youtube_links") || "[]",
    );
    expect(saved).toHaveLength(0);
  });
});
