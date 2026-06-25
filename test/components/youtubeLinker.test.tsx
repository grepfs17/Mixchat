import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import YouTubeLinker from "../../src/components/YouTubeLinker";
import {
  addYoutubeLink,
  getYoutubeLinks,
} from "../../src/lib/youtubeLinks";

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

  it("toggles link active state via the toggle button", async () => {
    const availableChannels = [
      {
        id: "a",
        name: "chanA",
        displayName: "Channel A",
        title: "Channel A title",
        profileImageUrl: "",
      },
    ];

    addYoutubeLink({
      twitchChannelId: "a",
      twitchDisplayName: "Channel A",
      youtubeUrl: "https://www.youtube.com/@channelA",
    });

    render(
      <YouTubeLinker
        availableChannels={availableChannels}
        onClose={vi.fn()}
      />,
    );

    // Link should be active by default
    const item = screen.getByText("Channel A").closest(".ytlinker-item");
    expect(item).not.toHaveClass("ytlinker-item--inactive");

    // Click the toggle to deactivate
    const toggle = screen.getByTitle("Deactivate link");
    await userEvent.click(toggle);

    // Should now be inactive
    expect(item).toHaveClass("ytlinker-item--inactive");

    // Verify localStorage reflects inactive state
    const links = getYoutubeLinks();
    expect(links[0].active).toBe(false);

    // Click toggle again to reactivate
    const reactivateToggle = screen.getByTitle("Activate link");
    await userEvent.click(reactivateToggle);

    expect(item).not.toHaveClass("ytlinker-item--inactive");
    const linksAfter = getYoutubeLinks();
    expect(linksAfter[0].active).toBe(true);
  });

  it("defaults old links without active field to active", () => {
    // Simulate old format link (no active field)
    localStorage.setItem(
      "mixchat_youtube_links",
      JSON.stringify([
        {
          twitchChannelId: "a",
          twitchDisplayName: "Channel A",
          youtubeUrl: "https://www.youtube.com/@channelA",
        },
      ]),
    );

    const links = getYoutubeLinks();
    expect(links[0].active).toBe(true);
  });

  it("edits the YouTube URL of an existing link", async () => {
    const availableChannels = [
      {
        id: "a",
        name: "chanA",
        displayName: "Channel A",
        title: "Channel A title",
        profileImageUrl: "",
      },
    ];

    addYoutubeLink({
      twitchChannelId: "a",
      twitchDisplayName: "Channel A",
      youtubeUrl: "https://www.youtube.com/@oldHandle",
    });

    render(
      <YouTubeLinker
        availableChannels={availableChannels}
        onClose={vi.fn()}
      />,
    );

    // Original URL should be visible
    expect(
      screen.getByText("https://www.youtube.com/@oldHandle"),
    ).toBeInTheDocument();

    // Click edit button
    const editButton = screen.getByTitle("Edit YouTube URL");
    await userEvent.click(editButton);

    // Inline input should appear with the current URL
    const input = document.querySelector(
      ".ytlinker-edit-input",
    ) as HTMLInputElement;
    expect(input).toHaveValue("https://www.youtube.com/@oldHandle");

    // Clear and type new URL
    await userEvent.clear(input);
    await userEvent.type(input, "https://www.youtube.com/@newHandle");

    // Click save
    const saveButton = screen.getByTitle("Save changes");
    await userEvent.click(saveButton);

    // New URL should be visible, old should be gone
    expect(
      screen.getByText("https://www.youtube.com/@newHandle"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("https://www.youtube.com/@oldHandle"),
    ).not.toBeInTheDocument();

    // localStorage should have the updated URL
    const links = getYoutubeLinks();
    expect(links[0].youtubeUrl).toBe("https://www.youtube.com/@newHandle");
  });

  it("cancels edit without saving changes", async () => {
    const availableChannels = [
      {
        id: "a",
        name: "chanA",
        displayName: "Channel A",
        title: "Channel A title",
        profileImageUrl: "",
      },
    ];

    addYoutubeLink({
      twitchChannelId: "a",
      twitchDisplayName: "Channel A",
      youtubeUrl: "https://www.youtube.com/@channelA",
    });

    render(
      <YouTubeLinker
        availableChannels={availableChannels}
        onClose={vi.fn()}
      />,
    );

    // Click edit
    const editButton = screen.getByTitle("Edit YouTube URL");
    await userEvent.click(editButton);

    // Change the URL
    const input = document.querySelector(
      ".ytlinker-edit-input",
    ) as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "https://www.youtube.com/@changed");

    // Click cancel
    const cancelButton = screen.getByTitle("Cancel edit");
    await userEvent.click(cancelButton);

    // Original URL should still be there
    expect(
      screen.getByText("https://www.youtube.com/@channelA"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("https://www.youtube.com/@changed"),
    ).not.toBeInTheDocument();

    // localStorage should be unchanged
    const links = getYoutubeLinks();
    expect(links[0].youtubeUrl).toBe("https://www.youtube.com/@channelA");
  });
});
