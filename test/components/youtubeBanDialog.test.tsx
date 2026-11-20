import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import YouTubeBanDialog from "../../src/components/chat/shared/YouTubeBanDialog";

describe("YouTubeBanDialog", () => {
  it("explains that the ban only applies to the current live stream", () => {
    render(
      <YouTubeBanDialog
        channelId="UC-123"
        username="BadUser"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Ban BadUser?")).toBeInTheDocument();
    expect(
      screen.getByText(/only ban this user from the current live stream/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/cannot hide the user from your channel/),
    ).toBeInTheDocument();
  });

  it("confirms the ban with the channel id and username", () => {
    const onConfirm = vi.fn();
    render(
      <YouTubeBanDialog
        channelId="UC-123"
        username="BadUser"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Ban for this stream"));
    expect(onConfirm).toHaveBeenCalledWith("UC-123", "BadUser");
  });

  it("opens the YouTube chat popout so the user can hide them channel-wide", () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    render(
      <YouTubeBanDialog
        channelId="UC-123"
        username="BadUser"
        videoId="vid-1"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Open YouTube chat popout"));
    expect(openSpy).toHaveBeenCalledWith(
      "https://www.youtube.com/live_chat?is_popout=1&dark_theme=1&v=vid-1",
      "yt-chat-popout",
      "width=400,height=600,noopener,noreferrer",
    );
    openSpy.mockRestore();
  });

  it("hides the popout action when no video id is available", () => {
    render(
      <YouTubeBanDialog
        channelId="UC-123"
        username="BadUser"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.queryByText("Open YouTube chat popout"),
    ).not.toBeInTheDocument();
  });

  it("closes without banning when Cancel is clicked", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <YouTubeBanDialog
        channelId="UC-123"
        username="BadUser"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
