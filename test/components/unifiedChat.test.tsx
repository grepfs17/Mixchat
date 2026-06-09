import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import React from "react";
import UnifiedChat from "../../src/components/chat/unified";
import type { TwitchMessage } from "../../src/lib/types";

describe("UnifiedChat component", () => {
  it("renders messages from both Twitch and YouTube", () => {
    const twitchMessages: TwitchMessage[] = [
      {
        id: "t1",
        platform: "twitch",
        author: "TwitchUser",
        content: "Hello from Twitch",
        timestamp: new Date(),
      },
    ];

    const ytMessages: any[] = [
      {
        id: "y1",
        author: "YTUser",
        parts: [{ type: "text", text: "Hello from YouTube" }],
        timestamp: new Date(),
      },
    ];

    render(
      <UnifiedChat
        channelName="testchannel"
        twitchMessages={twitchMessages}
        ytMessages={ytMessages}
      />,
    );

    expect(screen.getByText("TwitchUser")).toBeInTheDocument();
    expect(screen.getByText("Hello from Twitch")).toBeInTheDocument();
    expect(screen.getByText("YTUser")).toBeInTheDocument();
    expect(screen.getByText("Hello from YouTube")).toBeInTheDocument();

    // Check for platform tags (icons)
    expect(screen.getByTitle("Twitch")).toBeInTheDocument();
    expect(screen.getByTitle("YouTube")).toBeInTheDocument();
  });

  it("sorts messages by timestamp", () => {
    const now = new Date();
    const older = new Date(now.getTime() - 1000);

    const twitchMessages: TwitchMessage[] = [
      {
        id: "t1",
        platform: "twitch",
        author: "TwitchUser",
        content: "Twitch Message (newer)",
        timestamp: now,
      },
    ];

    const ytMessages: any[] = [
      {
        id: "y1",
        author: "YTUser",
        parts: [{ type: "text", text: "YT Message (older)" }],
        timestamp: older,
      },
    ];

    const { container } = render(
      <UnifiedChat
        channelName="testchannel"
        twitchMessages={twitchMessages}
        ytMessages={ytMessages}
      />,
    );

    const messageElements = container.querySelectorAll(".message");
    expect(messageElements).toHaveLength(2);

    // Older message should be first
    expect(messageElements[0].textContent).toContain("YT Message (older)");
    expect(messageElements[1].textContent).toContain("Twitch Message (newer)");
  });
});
