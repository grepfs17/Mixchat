import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ChatHeader from "../../src/components/chat/display/ChatHeader";
import { ModerationContext } from "../../src/contexts/ModerationContext";

function openStatusDropdown() {
  fireEvent.click(
    screen.getByTitle("Event connection status"),
  );
}

describe("ChatHeader: stream tools", () => {
  it("opens stream tools without passing the click event", () => {
    const onOpenModTools = vi.fn();

    render(
      <ChatHeader
        subscriptionStatuses={new Map()}
        showModTools
        onOpenModTools={onOpenModTools}
      />,
    );

    fireEvent.click(screen.getByTitle("Stream tools (giveaway, etc.)"));

    expect(onOpenModTools).toHaveBeenCalledTimes(1);
    expect(onOpenModTools).toHaveBeenCalledWith();
  });
});

describe("ChatHeader: redemption PubSub status", () => {
  it("shows the PubSub feed status as connected in the dropdown", () => {
    render(
      <ChatHeader
        subscriptionStatuses={new Map()}
        redemptionPubSubStatus="connected"
      />,
    );

    openStatusDropdown();

    expect(screen.getByText("Channel Points (PubSub)")).toBeInTheDocument();
    expect(screen.getByText("connected")).toBeInTheDocument();
  });

  it("labels a disabled PubSub feed as disabled", () => {
    render(
      <ChatHeader
        subscriptionStatuses={new Map()}
        redemptionPubSubStatus="disconnected"
      />,
    );

    openStatusDropdown();

    const section = screen
      .getByText("Channel Points (PubSub)")
      .closest(".eventsub-status-section") as HTMLElement;
    expect(within(section).getByText("disabled")).toBeInTheDocument();
  });

  it("renders the error state for a dropped PubSub connection", () => {
    render(
      <ChatHeader
        subscriptionStatuses={new Map()}
        redemptionPubSubStatus="error"
      />,
    );

    openStatusDropdown();

    expect(screen.getByText("Channel Points (PubSub)")).toBeInTheDocument();
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("does not render the PubSub row when the status is not provided", () => {
    render(<ChatHeader subscriptionStatuses={new Map()} />);

    openStatusDropdown();

    expect(
      screen.queryByText("Channel Points (PubSub)"),
    ).not.toBeInTheDocument();
  });
});
describe("ChatHeader: stream notes", () => {
  it("opens stream notes from the stream info bar", () => {
    const onOpenStreamNotes = vi.fn();

    render(
      <ChatHeader
        subscriptionStatuses={new Map()}
        onOpenStreamNotes={onOpenStreamNotes}
      />,
    );

    fireEvent.click(screen.getByTitle("Stream notes"));

    expect(onOpenStreamNotes).toHaveBeenCalledTimes(1);
  });
});

describe("ChatHeader: platform action menus", () => {
  it("groups Twitch actions in a dropdown", () => {
    render(
      <ChatHeader
        subscriptionStatuses={new Map()}
        isOnOwnChannel
        channelName="streamer"
      />,
    );

    fireEvent.click(screen.getByTitle("Twitch actions"));

    expect(
      screen.getByRole("menu", { name: "Twitch actions" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Open Twitch stream popout")).toBeInTheDocument();

    const modLink = screen
      .getByText("Open Twitch moderator page")
      .closest("a");
    expect(modLink).toHaveAttribute(
      "href",
      "https://www.twitch.tv/moderator/streamer",
    );
    expect(modLink).toHaveAttribute("target", "_blank");
  });

  it("opens the Twitch stream popout from the menu", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(
      <ChatHeader
        subscriptionStatuses={new Map()}
        isOnOwnChannel
        channelName="streamer"
      />,
    );

    fireEvent.click(screen.getByTitle("Twitch actions"));
    fireEvent.click(screen.getByText("Open Twitch stream popout"));

    expect(openSpy).toHaveBeenCalledWith(
      "https://www.twitch.tv/popout/moderator/streamer/player?id=1",
      "twitch-stream-popout",
      "width=1280,height=720,noopener,noreferrer",
    );

    openSpy.mockRestore();
  });

  it("groups YouTube actions and links the current live stream", () => {
    render(
      <ModerationContext.Provider
        value={{
          isModerator: false,
          modModeActive: false,
          compactActions: false,
          youtubeVideoId: "abc123",
        }}
      >
        <ChatHeader subscriptionStatuses={new Map()} />
      </ModerationContext.Provider>,
    );

    fireEvent.click(screen.getByTitle("YouTube actions"));

    expect(
      screen.getByRole("menu", { name: "YouTube actions" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Open YouTube chat popout")).toBeInTheDocument();

    const streamLink = screen.getByText("Open YouTube stream").closest("a");
    expect(streamLink).toHaveAttribute(
      "href",
      "https://www.youtube.com/watch?v=abc123",
    );
    expect(streamLink).toHaveAttribute("target", "_blank");
  });

  it("closes an open menu on Escape", () => {
    render(
      <ChatHeader
        subscriptionStatuses={new Map()}
        isOnOwnChannel
        channelName="streamer"
      />,
    );

    fireEvent.click(screen.getByTitle("Twitch actions"));
    expect(
      screen.getByRole("menu", { name: "Twitch actions" }),
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(
      screen.queryByRole("menu", { name: "Twitch actions" }),
    ).not.toBeInTheDocument();
  });
});

describe("ChatHeader: VOD mode", () => {
  it("shows the VOD badge and hides stats and notes", () => {
    render(
      <ChatHeader
        subscriptionStatuses={new Map()}
        vodMode
        isOnOwnChannel
        channelName="streamer"
        onOpenChatStats={vi.fn()}
        onOpenStreamNotes={vi.fn()}
      />,
    );

    expect(screen.getByText("VOD")).toBeInTheDocument();
    expect(screen.queryByTitle("Chat stats")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Stream notes")).not.toBeInTheDocument();
  });

  it("downloads the VOD and offers JSON and HTML chat downloads", () => {
    const onDownloadVod = vi.fn();
    const onDownloadVodChat = vi.fn();

    render(
      <ChatHeader
        subscriptionStatuses={new Map()}
        vodMode
        onDownloadVod={onDownloadVod}
        onDownloadVodChat={onDownloadVodChat}
      />,
    );

    fireEvent.click(screen.getByTitle("Download VOD"));
    expect(onDownloadVod).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTitle("Download VOD chat"));
    fireEvent.click(screen.getByText("Download chat as JSON"));
    expect(onDownloadVodChat).toHaveBeenCalledWith("json");

    fireEvent.click(screen.getByTitle("Download VOD chat"));
    fireEvent.click(screen.getByText("Download chat as HTML"));
    expect(onDownloadVodChat).toHaveBeenCalledWith("html");
  });
});
