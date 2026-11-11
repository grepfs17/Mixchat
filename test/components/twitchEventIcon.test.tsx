import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import TwitchEventIcon, {
  EVENT_CONFIG,
} from "../../src/components/TwitchEventIcon";

describe("TwitchEventIcon", () => {
  it("renders nothing for undefined messageType", () => {
    const { container } = render(<TwitchEventIcon />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing for unknown messageType", () => {
    const { container } = render(<TwitchEventIcon messageType="unknown" />);
    expect(container.innerHTML).toBe("");
  });

  it("renders cheer label", () => {
    render(<TwitchEventIcon messageType="cheer" />);
    expect(screen.getByText("Cheer")).toBeInTheDocument();
  });

  it("renders Message Effect label for message_effect power-up type", () => {
    render(<TwitchEventIcon powerUpType="message_effect" />);
    expect(screen.getByText("Message Effect")).toBeInTheDocument();
  });

  it("renders Celebration label for celebration power-up type", () => {
    render(<TwitchEventIcon powerUpType="celebration" />);
    expect(screen.getByText("Celebration")).toBeInTheDocument();
  });

  it("renders Gigantified Emote label when isGigantifiedEmote is true", () => {
    render(<TwitchEventIcon isGigantifiedEmote />);
    expect(screen.getByText("Gigantified Emote")).toBeInTheDocument();
  });

  it("prioritizes gigantified over powerUpType", () => {
    render(<TwitchEventIcon isGigantifiedEmote powerUpType="message_effect" />);
    expect(screen.getByText("Gigantified Emote")).toBeInTheDocument();
    expect(screen.queryByText("Message Effect")).not.toBeInTheDocument();
  });

  it("prioritizes powerUpType over messageType", () => {
    render(<TwitchEventIcon messageType="chat" powerUpType="celebration" />);
    expect(screen.getByText("Celebration")).toBeInTheDocument();
  });

  it("applies message-effect-label class for message_effect", () => {
    render(<TwitchEventIcon powerUpType="message_effect" />);
    const label = screen.getByText("Message Effect");
    expect(label.className).toContain("message-effect-label");
  });

  it("applies celebration-label class for celebration", () => {
    render(<TwitchEventIcon powerUpType="celebration" />);
    const label = screen.getByText("Celebration");
    expect(label.className).toContain("celebration-label");
  });

  it("applies gigantified-emote-label class for gigantified emote", () => {
    render(<TwitchEventIcon isGigantifiedEmote />);
    const label = screen.getByText("Gigantified Emote");
    expect(label.className).toContain("gigantified-emote-label");
  });

  it("renders First message on stream label for isFirstMessageOnStream", () => {
    render(<TwitchEventIcon isFirstMessageOnStream />);
    expect(screen.getByText("First message on stream")).toBeInTheDocument();
  });

  it("keeps First Message priority over First message on stream", () => {
    render(<TwitchEventIcon isFirstMessage isFirstMessageOnStream />);
    expect(screen.getByText("First Message")).toBeInTheDocument();
    expect(screen.queryByText("First message on stream")).not.toBeInTheDocument();
  });

  it("prioritizes event messageType over First message on stream", () => {
    render(<TwitchEventIcon messageType="cheer" isFirstMessageOnStream />);
    expect(screen.getByText("Cheer")).toBeInTheDocument();
    expect(screen.queryByText("First message on stream")).not.toBeInTheDocument();
  });
});

describe("EVENT_CONFIG", () => {
  it("has message-effect config", () => {
    const cfg = EVENT_CONFIG["message-effect"];
    expect(cfg).toBeDefined();
    expect(cfg.title).toBe("Message Effect");
    expect(cfg.color).toBe("#00d4aa");
  });

  it("has celebration config", () => {
    const cfg = EVENT_CONFIG["celebration"];
    expect(cfg).toBeDefined();
    expect(cfg.title).toBe("Celebration");
    expect(cfg.color).toBe("#ff6b9d");
  });

  it("has gigantified-emote config", () => {
    const cfg = EVENT_CONFIG["gigantified-emote"];
    expect(cfg).toBeDefined();
    expect(cfg.title).toBe("Gigantified Emote");
    expect(cfg.color).toBe("#00d4aa");
  });

  it("has first-message and first-message-on-stream configs", () => {
    const first = EVENT_CONFIG["first-message"];
    expect(first.title).toBe("First Message");
    expect(first.color).toBe("#2dd4bf");
    const onStream = EVENT_CONFIG["first-message-on-stream"];
    expect(onStream.title).toBe("First message on stream");
    expect(onStream.color).not.toBe(first.color);
  });
});
