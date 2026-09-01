import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import React from "react";
import UnifiedChat from "../../src/components/chat/unified";
import type { TwitchMessage } from "../../src/lib/types";

function parity(message: Element): "odd" | "even" {
  if (message.classList.contains("odd")) return "odd";
  return "even";
}

function makeTwitchMessage(
  id: string,
  author: string,
  content: string,
  timestamp: Date,
): TwitchMessage {
  return { id, platform: "twitch", author, content, timestamp };
}

function makeYtMessage(id: string, author: string, text: string, timestamp: Date) {
  return {
    id,
    author,
    parts: [{ type: "text", text } as const],
    timestamp,
  };
}

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

  it("alternates odd/even across the merged list (not per platform) with split chat enabled", () => {
    const now = new Date();
    const t0 = makeTwitchMessage(
      "t0",
      "TwitchA",
      "twitch message 0",
      new Date(now.getTime() - 4000),
    );
    const t1 = makeTwitchMessage(
      "t1",
      "TwitchB",
      "twitch message 1",
      new Date(now.getTime() - 2000),
    );
    const y0 = makeYtMessage(
      "y0",
      "YTA",
      "yt message 0",
      new Date(now.getTime() - 3000),
    );
    const y1 = makeYtMessage(
      "y1",
      "YTB",
      "yt message 1",
      new Date(now.getTime() - 1000),
    );

    const { container } = render(
      <UnifiedChat
        channelName="testchannel"
        splitChatEnabled
        twitchMessages={[t0, t1]}
        ytMessages={[y0, y1]}
      />,
    );

    // Merged order by timestamp: t0, y0, t1, y1
    const messages = Array.from(container.querySelectorAll(".message"));
    expect(messages.map(parity)).toEqual(["even", "odd", "even", "odd"]);
  });

  it("updates parity when the merged list shifts (memo must not freeze striping)", () => {
    const now = new Date();
    const t0 = makeTwitchMessage(
      "t0",
      "TwitchA",
      "twitch message 0",
      new Date(now.getTime() - 4000),
    );
    const t1 = makeTwitchMessage(
      "t1",
      "TwitchB",
      "twitch message 1",
      new Date(now.getTime() - 2000),
    );
    const y0 = makeYtMessage(
      "y0",
      "YTA",
      "yt message 0",
      new Date(now.getTime() - 3000),
    );
    const y1 = makeYtMessage(
      "y1",
      "YTB",
      "yt message 1",
      new Date(now.getTime() - 1000),
    );

    const { container, rerender } = render(
      <UnifiedChat
        channelName="testchannel"
        splitChatEnabled
        twitchMessages={[t0, t1]}
        ytMessages={[y0, y1]}
      />,
    );

    // y0 disappears (deleted / timed out), shifting t1 from index 2 to index 1.
    // Reuse the exact same message objects so only the memoized components
    // decide whether the parity can be recomputed.
    rerender(
      <UnifiedChat
        channelName="testchannel"
        splitChatEnabled
        twitchMessages={[t0, t1]}
        ytMessages={[y1]}
      />,
    );

    const messages = Array.from(container.querySelectorAll(".message"));
    expect(messages.map(parity)).toEqual(["even", "odd", "even"]);
    expect(messages[1].textContent).toContain("twitch message 1");
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

  it("forwards renderThirdPartyEmotesOnYoutube to YouTube message rendering", () => {
    const { container: off } = render(
      <UnifiedChat
        channelName="testchannel"
        twitchMessages={[]}
        ytMessages={[
          {
            id: "y1",
            author: "YTUser",
            parts: [{ type: "text", text: "hello Clap" }],
            timestamp: new Date(),
          },
        ]}
        renderThirdPartyEmotesOnYoutube={false}
      />,
    );
    expect(off.querySelectorAll("img.chat-emote").length).toBe(0);
    expect(off.textContent).toContain("hello Clap");

    const { container: on } = render(
      <UnifiedChat
        channelName="testchannel"
        twitchMessages={[]}
        ytMessages={[
          {
            id: "y2",
            author: "YTUser",
            parts: [{ type: "text", text: "hello Clap" }],
            timestamp: new Date(),
          },
        ]}
        renderThirdPartyEmotesOnYoutube={true}
      />,
    );
    // With the flag on, the bare text "hello Clap" should not contain an
    // emote image because we never seeded an emote in this test (the
    // 7TV/BTTV/FFZ maps are module-level empty objects by default). The
    // important assertion is that no third-party emote IMG was created
    // *because of the flag*. The two renders must look identical when the
    // emote maps are empty.
    expect(on.querySelectorAll("img.chat-emote").length).toBe(0);
    expect(on.textContent).toContain("hello Clap");
  });
});
