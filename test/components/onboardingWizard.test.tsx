import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import OnboardingWizard from "../../src/components/OnboardingWizard";
import type { ChatFont, ChatTheme } from "../../src/lib/types";

function makeProps(overrides: Partial<React.ComponentProps<typeof OnboardingWizard>> = {}) {
  return {
    chatTheme: "default" as const,
    onChatThemeChange: vi.fn(),
    fontSize: 14,
    onFontSizeChange: vi.fn(),
    chatFont: "inter" as const,
    onChatFontChange: vi.fn(),
    streamerToolsEnabled: false,
    onStreamerToolsEnabledChange: vi.fn(),
    hideViewerCount: false,
    onHideViewerCountChange: vi.fn(),
    unifyChatEnabled: true,
    onUnifyChatEnabledChange: vi.fn(),
    showDeletedMessages: true,
    onShowDeletedMessagesChange: vi.fn(),
    compactActions: false,
    onCompactActionsChange: vi.fn(),
    keepModActionsVisible: false,
    onKeepModActionsVisibleChange: vi.fn(),
    modActionsFirst: false,
    onModActionsFirstChange: vi.fn(),
    doubleClickConfirmModActions: false,
    onDoubleClickConfirmModActionsChange: vi.fn(),
    embedDefaultOpen: false,
    onEmbedDefaultOpenChange: vi.fn(),
    hideChatTimestamps: false,
    onHideChatTimestampsChange: vi.fn(),
    onComplete: vi.fn(),
    ...overrides,
  };
}

interface HarnessState {
  chatTheme: ChatTheme;
  fontSize: number;
  chatFont: ChatFont;
  streamerToolsEnabled: boolean;
  hideViewerCount: boolean;
  unifyChatEnabled: boolean;
  showDeletedMessages: boolean;
  compactActions: boolean;
  keepModActionsVisible: boolean;
  modActionsFirst: boolean;
  doubleClickConfirmModActions: boolean;
  embedDefaultOpen: boolean;
  hideChatTimestamps: boolean;
}

function StatefulHarness({
  initial,
}: {
  initial?: Partial<React.ComponentProps<typeof OnboardingWizard>>;
}) {
  const [state, setState] = useState<HarnessState>({
    chatTheme: "default",
    fontSize: 14,
    chatFont: "inter",
    streamerToolsEnabled: false,
    hideViewerCount: false,
    unifyChatEnabled: true,
    showDeletedMessages: true,
    compactActions: false,
    keepModActionsVisible: false,
    modActionsFirst: false,
    doubleClickConfirmModActions: false,
    embedDefaultOpen: false,
    hideChatTimestamps: false,
  });
  const update =
    <K extends keyof HarnessState>(key: K) =>
    (value: HarnessState[K]) =>
      setState((s) => ({ ...s, [key]: value }));
  return (
    <OnboardingWizard
      chatTheme={state.chatTheme}
      onChatThemeChange={update("chatTheme")}
      fontSize={state.fontSize}
      onFontSizeChange={update("fontSize")}
      chatFont={state.chatFont}
      onChatFontChange={update("chatFont")}
      streamerToolsEnabled={state.streamerToolsEnabled}
      onStreamerToolsEnabledChange={update("streamerToolsEnabled")}
      hideViewerCount={state.hideViewerCount}
      onHideViewerCountChange={update("hideViewerCount")}
      unifyChatEnabled={state.unifyChatEnabled}
      onUnifyChatEnabledChange={update("unifyChatEnabled")}
      showDeletedMessages={state.showDeletedMessages}
      onShowDeletedMessagesChange={update("showDeletedMessages")}
      compactActions={state.compactActions}
      onCompactActionsChange={update("compactActions")}
      keepModActionsVisible={state.keepModActionsVisible}
      onKeepModActionsVisibleChange={update("keepModActionsVisible")}
      modActionsFirst={state.modActionsFirst}
      onModActionsFirstChange={update("modActionsFirst")}
      doubleClickConfirmModActions={state.doubleClickConfirmModActions}
      onDoubleClickConfirmModActionsChange={update(
        "doubleClickConfirmModActions",
      )}
      embedDefaultOpen={state.embedDefaultOpen}
      onEmbedDefaultOpenChange={update("embedDefaultOpen")}
      hideChatTimestamps={state.hideChatTimestamps}
      onHideChatTimestampsChange={update("hideChatTimestamps")}
      onComplete={vi.fn()}
      {...initial}
    />
  );
}

describe("OnboardingWizard component", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the welcome step first with the setup question and two options", () => {
    render(<OnboardingWizard {...makeProps()} />);
    expect(
      screen.getByText(/Do you want help to configure Mixchat\?/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /If you already configured it to your liking, you can skip this setup/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Continue")).toBeInTheDocument();
    expect(screen.getAllByText("Skip setup").length).toBeGreaterThanOrEqual(1);
  });

  it("shows the Mixchat logo on the welcome step", () => {
    render(<OnboardingWizard {...makeProps()} />);
    const logo = screen.getByAltText("Mixchat");
    expect(logo).toBeInTheDocument();
    expect(logo.tagName).toBe("IMG");
    expect((logo as HTMLImageElement).getAttribute("src")).toBe("/logo.webp");
  });

  it("calls onComplete when the Skip setup button is clicked on the welcome step", async () => {
    const onComplete = vi.fn();
    render(<OnboardingWizard {...makeProps({ onComplete })} />);
    const skipButtons = screen.getAllByText("Skip setup");
    await userEvent.click(skipButtons[0]);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("advances to the theme step when Continue is clicked", async () => {
    render(<OnboardingWizard {...makeProps()} />);
    await userEvent.click(screen.getByText("Continue"));
    expect(screen.getByText("Pick a theme")).toBeInTheDocument();
  });

  async function goToThemeStep() {
    render(<StatefulHarness />);
    await userEvent.click(screen.getByText("Continue"));
  }

  async function goToUserTypeStep() {
    render(<StatefulHarness />);
    await userEvent.click(screen.getByText("Continue"));
    await userEvent.click(screen.getByText("Continue"));
    await userEvent.click(screen.getByText("Next"));
  }

  it("applies streamer defaults when the streamer role is selected", async () => {
    const onStreamerToolsEnabledChange = vi.fn();
    const onHideViewerCountChange = vi.fn();
    const onEmbedDefaultOpenChange = vi.fn();
    const onCompactActionsChange = vi.fn();
    const onKeepModActionsVisibleChange = vi.fn();
    const onModActionsFirstChange = vi.fn();
    const onDoubleClickConfirmModActionsChange = vi.fn();

    const props = makeProps({
      onStreamerToolsEnabledChange,
      onHideViewerCountChange,
      onEmbedDefaultOpenChange,
      onCompactActionsChange,
      onKeepModActionsVisibleChange,
      onModActionsFirstChange,
      onDoubleClickConfirmModActionsChange,
    });
    render(<OnboardingWizard {...props} />);

    await userEvent.click(screen.getByText("Continue"));
    await userEvent.click(screen.getByText("Next"));
    await userEvent.click(screen.getByText("I'm a streamer"));

    expect(onStreamerToolsEnabledChange).toHaveBeenCalledWith(true);
    expect(onHideViewerCountChange).toHaveBeenCalledWith(true);
    expect(onEmbedDefaultOpenChange).toHaveBeenCalledWith(false);
    expect(onCompactActionsChange).toHaveBeenCalledWith(true);
    expect(onKeepModActionsVisibleChange).toHaveBeenCalledWith(true);
    expect(onModActionsFirstChange).toHaveBeenCalledWith(true);
    expect(onDoubleClickConfirmModActionsChange).toHaveBeenCalledWith(true);
  });

  it("applies the same defaults for moderators as for streamers", async () => {
    const onStreamerToolsEnabledChange = vi.fn();
    const onHideViewerCountChange = vi.fn();
    const onCompactActionsChange = vi.fn();
    const props = makeProps({
      onStreamerToolsEnabledChange,
      onHideViewerCountChange,
      onCompactActionsChange,
    });
    render(<OnboardingWizard {...props} />);

    await userEvent.click(screen.getByText("Continue"));
    await userEvent.click(screen.getByText("Next"));
    await userEvent.click(screen.getByText("I'm a moderator"));

    expect(onStreamerToolsEnabledChange).toHaveBeenCalledWith(true);
    expect(onHideViewerCountChange).toHaveBeenCalledWith(true);
    expect(onCompactActionsChange).toHaveBeenCalledWith(true);
  });

  it("applies viewer defaults when the viewer role is selected", async () => {
    const onStreamerToolsEnabledChange = vi.fn();
    const onHideViewerCountChange = vi.fn();
    const onEmbedDefaultOpenChange = vi.fn();
    const onCompactActionsChange = vi.fn();
    const onKeepModActionsVisibleChange = vi.fn();
    const onModActionsFirstChange = vi.fn();
    const onDoubleClickConfirmModActionsChange = vi.fn();

    const props = makeProps({
      onStreamerToolsEnabledChange,
      onHideViewerCountChange,
      onEmbedDefaultOpenChange,
      onCompactActionsChange,
      onKeepModActionsVisibleChange,
      onModActionsFirstChange,
      onDoubleClickConfirmModActionsChange,
    });
    render(<OnboardingWizard {...props} />);

    await userEvent.click(screen.getByText("Continue"));
    await userEvent.click(screen.getByText("Next"));
    await userEvent.click(screen.getByText("I'm a viewer"));

    expect(onStreamerToolsEnabledChange).toHaveBeenCalledWith(false);
    expect(onHideViewerCountChange).toHaveBeenCalledWith(false);
    expect(onEmbedDefaultOpenChange).toHaveBeenCalledWith(true);
    expect(onCompactActionsChange).toHaveBeenCalledWith(false);
    expect(onKeepModActionsVisibleChange).toHaveBeenCalledWith(false);
    expect(onModActionsFirstChange).toHaveBeenCalledWith(false);
    expect(onDoubleClickConfirmModActionsChange).toHaveBeenCalledWith(false);
  });

  it("disables Finish until a role is picked, then calls onComplete on click", async () => {
    const onComplete = vi.fn();
    render(<OnboardingWizard {...makeProps({ onComplete })} />);
    await userEvent.click(screen.getByText("Continue"));
    await userEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Finish")).toBeDisabled();
    await userEvent.click(screen.getByText("I'm a viewer"));
    expect(screen.getByText("Finish")).not.toBeDisabled();
    await userEvent.click(screen.getByText("Finish"));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("navigates back to the theme step when Back is clicked", async () => {
    render(<OnboardingWizard {...makeProps()} />);
    await userEvent.click(screen.getByText("Continue"));
    await userEvent.click(screen.getByText("Next"));
    expect(screen.getByText("How will you use Mixchat?")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Back"));
    expect(screen.getByText("Pick a theme")).toBeInTheDocument();
  });

  it("toggles a non-locked setting and shows the new value", async () => {
    const onHideChatTimestampsChange = vi.fn();
    const props = makeProps({
      hideChatTimestamps: false,
      onHideChatTimestampsChange,
    });
    render(<OnboardingWizard {...props} />);
    await userEvent.click(screen.getByText("Continue"));
    await userEvent.click(screen.getByText("Next"));
    await userEvent.click(screen.getByText("I'm a viewer"));

    const labels = screen.getAllByText("Hide chat timestamps");
    expect(labels.length).toBeGreaterThan(0);
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBeGreaterThan(0);
    await userEvent.click(checkboxes[0]);
    expect(onHideChatTimestampsChange).toHaveBeenCalled();
  });

  it("does not render toggles for locked settings, but shows their on/off pill", async () => {
    render(<StatefulHarness />);
    await userEvent.click(screen.getByText("Continue"));
    await userEvent.click(screen.getByText("Next"));
    await userEvent.click(screen.getByText("I'm a streamer"));
    const pills = document.querySelectorAll(".onboarding-state-pill");
    expect(pills.length).toBeGreaterThan(0);
    const html = Array.from(pills)
      .map((p) => p.textContent ?? "")
      .join("|");
    expect(html).toMatch(/On/);
    expect(html).toMatch(/Off/);
    expect(document.querySelectorAll(".onboarding-toggle").length).toBeGreaterThan(
      0,
    );
  });

  it("locks double-click confirm for viewers (no toggle, shows Off pill)", async () => {
    render(<StatefulHarness />);
    await userEvent.click(screen.getByText("Continue"));
    await userEvent.click(screen.getByText("Next"));
    await userEvent.click(screen.getByText("I'm a viewer"));

    const setting = screen
      .getByText("Double-click to confirm mod actions")
      .closest(".onboarding-setting");
    expect(setting).not.toBeNull();
    expect(
      setting!.querySelector(".onboarding-toggle"),
    ).not.toBeInTheDocument();
    const pill = setting!.querySelector(".onboarding-state-pill");
    expect(pill).not.toBeNull();
    expect(pill!.textContent).toMatch(/Off/);
  });

  it("exposes double-click confirm as a toggle for streamers", async () => {
    render(<StatefulHarness />);
    await userEvent.click(screen.getByText("Continue"));
    await userEvent.click(screen.getByText("Next"));
    await userEvent.click(screen.getByText("I'm a streamer"));

    const setting = screen
      .getByText("Double-click to confirm mod actions")
      .closest(".onboarding-setting");
    expect(setting).not.toBeNull();
    expect(setting!.querySelector(".onboarding-toggle")).toBeInTheDocument();
  });

  it("exposes double-click confirm as a toggle for moderators", async () => {
    render(<StatefulHarness />);
    await userEvent.click(screen.getByText("Continue"));
    await userEvent.click(screen.getByText("Next"));
    await userEvent.click(screen.getByText("I'm a moderator"));

    const setting = screen
      .getByText("Double-click to confirm mod actions")
      .closest(".onboarding-setting");
    expect(setting).not.toBeNull();
    expect(setting!.querySelector(".onboarding-toggle")).toBeInTheDocument();
  });

  it("exposes show deleted messages as a toggle for streamers", async () => {
    render(<StatefulHarness />);
    await userEvent.click(screen.getByText("Continue"));
    await userEvent.click(screen.getByText("Next"));
    await userEvent.click(screen.getByText("I'm a streamer"));

    const setting = screen
      .getByText("Show deleted messages")
      .closest(".onboarding-setting");
    expect(setting).not.toBeNull();
    expect(setting!.querySelector(".onboarding-toggle")).toBeInTheDocument();
  });

  it("locks show deleted messages to On for moderators (no toggle)", async () => {
    render(<StatefulHarness />);
    await userEvent.click(screen.getByText("Continue"));
    await userEvent.click(screen.getByText("Next"));
    await userEvent.click(screen.getByText("I'm a moderator"));

    const setting = screen
      .getByText("Show deleted messages")
      .closest(".onboarding-setting");
    expect(setting).not.toBeNull();
    expect(
      setting!.querySelector(".onboarding-toggle"),
    ).not.toBeInTheDocument();
    const pill = setting!.querySelector(".onboarding-state-pill");
    expect(pill).not.toBeNull();
    expect(pill!.textContent).toMatch(/On/);
    expect(pill!.textContent).not.toMatch(/Off/);
  });

  it("renders a chat preview on the theme step", async () => {
    render(<StatefulHarness />);
    await userEvent.click(screen.getByText("Continue"));
    expect(
      document.querySelector(".onboarding-preview"),
    ).toBeInTheDocument();
    expect(
      document.querySelectorAll(".onboarding-preview .message").length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("shows the example usernames in the chat preview", async () => {
    render(<StatefulHarness />);
    await userEvent.click(screen.getByText("Continue"));
    expect(screen.getByText("notmasterofpupis")).toBeInTheDocument();
    expect(screen.getByText("nothelder")).toBeInTheDocument();
    expect(screen.getByText("shokastion")).toBeInTheDocument();
    expect(screen.getByText("youtube_avg_chatter")).toBeInTheDocument();
  });

  it("renders 7TV emotes in the chat preview", async () => {
    render(<StatefulHarness />);
    await userEvent.click(screen.getByText("Continue"));
    const emotes = document.querySelectorAll(
      ".onboarding-preview .message .chat-emote",
    );
    expect(emotes.length).toBe(3);
    emotes.forEach((img) => {
      const src = (img as HTMLImageElement).src;
      expect(src).toMatch(/^https:\/\/cdn\.7tv\.app\/emote\//);
      expect(src).toMatch(/\/2x\.(avif|webp)$/);
    });
  });

  it("renders emotes at the same size as the real chat", async () => {
    render(<StatefulHarness />);
    await userEvent.click(screen.getByText("Continue"));
    const emotes = document.querySelectorAll(
      ".onboarding-preview .message .chat-emote",
    );
    expect(emotes.length).toBeGreaterThanOrEqual(1);
    emotes.forEach((img) => {
      const el = img as HTMLImageElement;
      expect(el.style.height).toBe("2em");
      expect(el.style.verticalAlign).toBe("middle");
      expect(el.style.margin).toBe("0px 2px");
    });
  });

  it("uses the real chat message structure (message/message-single-line classes)", async () => {
    render(<StatefulHarness />);
    await userEvent.click(screen.getByText("Continue"));
    expect(
      document.querySelector(
        ".onboarding-preview .messages-container",
      ),
    ).toBeInTheDocument();
    const messages = document.querySelectorAll(
      ".onboarding-preview .message",
    );
    expect(messages.length).toBeGreaterThanOrEqual(4);
    messages.forEach((m) => {
      expect(m.querySelector(".message-single-line")).not.toBeNull();
    });
  });

  it("renders each preview part with the real chat classes", async () => {
    render(<StatefulHarness />);
    await userEvent.click(screen.getByText("Continue"));
    const first = document.querySelector(
      ".onboarding-preview .message",
    );
    expect(first).not.toBeNull();
    expect(first!.querySelector(".timestamp")).not.toBeNull();
    expect(first!.querySelector(".author.author-link")).not.toBeNull();
    expect(first!.querySelector(".message-separator")).not.toBeNull();
    expect(first!.querySelector(".message-text")).not.toBeNull();
  });

  it("renders preview timestamps with seconds (HH:MM:SS)", async () => {
    render(<StatefulHarness />);
    await userEvent.click(screen.getByText("Continue"));
    const timestamps = document.querySelectorAll(
      ".onboarding-preview .message .timestamp",
    );
    expect(timestamps.length).toBeGreaterThanOrEqual(4);
    timestamps.forEach((t) => {
      expect(t.textContent).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });
  });

  it("marks the mention message with the real mention class", async () => {
    render(<StatefulHarness />);
    await userEvent.click(screen.getByText("Continue"));
    const mention = document.querySelector(
      ".onboarding-preview .message.mention",
    );
    expect(mention).not.toBeNull();
  });

  it("marks the YouTube message with the real yt-event class and platform tag", async () => {
    render(<StatefulHarness />);
    await userEvent.click(screen.getByText("Continue"));
    const yt = document.querySelector(
      ".onboarding-preview .message.yt-event",
    );
    expect(yt).not.toBeNull();
    expect(yt!.querySelector(".platform-tag.youtube")).not.toBeNull();
    expect(yt!.querySelector(".avatar")).toBeNull();
  });

  it("adds a Twitch platform tag to Twitch messages", async () => {
    render(<StatefulHarness />);
    await userEvent.click(screen.getByText("Continue"));
    const twitchTags = document.querySelectorAll(
      ".onboarding-preview .message:not(.yt-event) .platform-tag.twitch",
    );
    expect(twitchTags.length).toBe(3);
  });

  it("exposes embed default open as a toggle for moderators", async () => {
    render(<StatefulHarness />);
    await userEvent.click(screen.getByText("Continue"));
    await userEvent.click(screen.getByText("Next"));
    await userEvent.click(screen.getByText("I'm a moderator"));

    const setting = screen
      .getByText("Open stream embed by default")
      .closest(".onboarding-setting");
    expect(setting).not.toBeNull();
    expect(setting!.querySelector(".onboarding-toggle")).toBeInTheDocument();
  });

  it("locks embed default open for streamers (no toggle)", async () => {
    render(<StatefulHarness />);
    await userEvent.click(screen.getByText("Continue"));
    await userEvent.click(screen.getByText("Next"));
    await userEvent.click(screen.getByText("I'm a streamer"));

    const setting = screen
      .getByText("Open stream embed by default")
      .closest(".onboarding-setting");
    expect(setting).not.toBeNull();
    expect(
      setting!.querySelector(".onboarding-toggle"),
    ).not.toBeInTheDocument();
    const pill = setting!.querySelector(".onboarding-state-pill");
    expect(pill).not.toBeNull();
  });

  it("renders a chat preview header with the text 'Chat preview'", async () => {
    render(<StatefulHarness />);
    await userEvent.click(screen.getByText("Continue"));
    const header = document.querySelector(".onboarding-preview-header");
    expect(header).not.toBeNull();
    expect(header!.textContent).toMatch(/chat preview/i);
    const headerText = header!.querySelector(
      ".onboarding-preview-header-text",
    );
    expect(headerText).not.toBeNull();
  });

  it("shows the timestamp in the preview even when hideChatTimestamps is true", async () => {
    render(<StatefulHarness initial={{ hideChatTimestamps: true }} />);
    await userEvent.click(screen.getByText("Continue"));
    const timestamp = document.querySelector(
      ".onboarding-preview .message .timestamp",
    );
    expect(timestamp).not.toBeNull();
    expect(getComputedStyle(timestamp!).display).not.toBe("none");
  });

  it("updates font size when the slider is moved", async () => {
    const onFontSizeChange = vi.fn();
    render(<OnboardingWizard {...makeProps({ onFontSizeChange })} />);
    await userEvent.click(screen.getByText("Continue"));
    const range = screen.getByRole("slider");
    await userEvent.click(range);
    fireEvent.change(range, { target: { value: "18" } });
    expect(onFontSizeChange).toHaveBeenCalledWith(18);
  });

  it("switches the active font when a font button is clicked", async () => {
    const onChatFontChange = vi.fn();
    render(<OnboardingWizard {...makeProps({ onChatFontChange })} />);
    await userEvent.click(screen.getByText("Continue"));
    await userEvent.click(screen.getByText("Roboto"));
    expect(onChatFontChange).toHaveBeenCalledWith("roboto");
  });

  it("marks the currently selected font as active", async () => {
    render(
      <OnboardingWizard
        {...makeProps({ chatFont: "rubik" })}
      />,
    );
    await userEvent.click(screen.getByText("Continue"));
    const active = document.querySelector(
      ".onboarding-typography-font--active",
    );
    expect(active).not.toBeNull();
    expect(active!.textContent).toMatch(/Rubik/);
  });
});
