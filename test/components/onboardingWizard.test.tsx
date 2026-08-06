import React, { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import OnboardingWizard from "../../src/components/OnboardingWizard";
import { IS_TWITCH_ONLY } from "../../src/lib/constants";
import { SettingsProvider } from "../../src/contexts/SettingsContext";
import type { UseChatSettingsResult } from "../../src/hooks/app/useChatSettings";
import type { ChatFont, ChatTheme } from "../../src/lib/types";

function makeSettings(
  overrides: Partial<UseChatSettingsResult> = {},
): UseChatSettingsResult {
  const noop = vi.fn();
  return {
    embedDefaultOpen: false,
    setEmbedDefaultOpen: noop,
    showStreamEmbed: false,
    setShowStreamEmbed: noop,
    unifyChatEnabled: true,
    setUnifyChatEnabled: noop,
    useYoutubeEmbed: false,
    setUseYoutubeEmbed: noop,
    fontSize: 14,
    setFontSize: noop,
    chatFont: "inter",
    setChatFont: noop,
    mentionSoundEnabled: false,
    setMentionSoundEnabled: noop,
    mentionVolume: 0.2,
    setMentionVolume: noop,
    mentionSoundType: "ding",
    setMentionSoundType: noop,
    showDeletedMessages: true,
    setShowDeletedMessages: noop,
    compactActions: false,
    setCompactActions: noop,
    keepModActionsVisible: false,
    setKeepModActionsVisible: noop,
    modActionsFirst: false,
    setModActionsFirst: noop,
    doubleClickConfirmModActions: false,
    setDoubleClickConfirmModActions: noop,
    splitChatEnabled: false,
    setSplitChatEnabled: noop,
    chatTheme: "default",
    setChatTheme: noop,
    hideViewerCount: false,
    setHideViewerCount: noop,
    hideChatTimestamps: false,
    setHideChatTimestamps: noop,
    eventSounds: {},
    eventSoundVolume: 1,
    setEventSoundVolume: noop,
    ignoredUsers: [],
    setIgnoredUsers: noop,
    handleEventSoundChange: noop,
    modModeTargets: {},
    setModModeTargetForChannel: noop,
    streamerToolsEnabled: false,
    setStreamerToolsEnabled: noop,
    defaultPlayerType: "embed",
    setDefaultPlayerType: noop,
    defaultHlsQuality: "highest",
    setDefaultHlsQuality: noop,
    renderThirdPartyEmotesOnYoutube: false,
    setRenderThirdPartyEmotesOnYoutube: noop,
    autoFoldSidebar: false,
    setAutoFoldSidebar: noop,
    ...overrides,
  };
}

function makeProps(overrides: { onComplete?: () => void } = {}) {
  return {
    onComplete: vi.fn(),
    ...overrides,
  };
}

function renderWizard(
  settings: UseChatSettingsResult = makeSettings(),
  props = makeProps(),
) {
  return render(
    <SettingsProvider value={settings}>
      <OnboardingWizard {...props} />
    </SettingsProvider>,
  );
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
  renderThirdPartyEmotesOnYoutube: boolean;
}

function StatefulHarness({
  initial,
}: {
  initial?: Partial<HarnessState>;
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
    renderThirdPartyEmotesOnYoutube: false,
    ...initial,
  });

  const settings: UseChatSettingsResult = {
    ...makeSettings(),
    chatTheme: state.chatTheme,
    setChatTheme: (v) =>
      setState((s) => ({ ...s, chatTheme: v as ChatTheme })),
    fontSize: state.fontSize,
    setFontSize: (v) => setState((s) => ({ ...s, fontSize: v as number })),
    chatFont: state.chatFont,
    setChatFont: (v) =>
      setState((s) => ({ ...s, chatFont: v as ChatFont })),
    streamerToolsEnabled: state.streamerToolsEnabled,
    setStreamerToolsEnabled: (v) =>
      setState((s) => ({ ...s, streamerToolsEnabled: v as boolean })),
    hideViewerCount: state.hideViewerCount,
    setHideViewerCount: (v) =>
      setState((s) => ({ ...s, hideViewerCount: v as boolean })),
    unifyChatEnabled: state.unifyChatEnabled,
    setUnifyChatEnabled: (v) =>
      setState((s) => ({ ...s, unifyChatEnabled: v as boolean })),
    showDeletedMessages: state.showDeletedMessages,
    setShowDeletedMessages: (v) =>
      setState((s) => ({ ...s, showDeletedMessages: v as boolean })),
    compactActions: state.compactActions,
    setCompactActions: (v) =>
      setState((s) => ({ ...s, compactActions: v as boolean })),
    keepModActionsVisible: state.keepModActionsVisible,
    setKeepModActionsVisible: (v) =>
      setState((s) => ({ ...s, keepModActionsVisible: v as boolean })),
    modActionsFirst: state.modActionsFirst,
    setModActionsFirst: (v) =>
      setState((s) => ({ ...s, modActionsFirst: v as boolean })),
    doubleClickConfirmModActions: state.doubleClickConfirmModActions,
    setDoubleClickConfirmModActions: (v) =>
      setState((s) => ({
        ...s,
        doubleClickConfirmModActions: v as boolean,
      })),
    embedDefaultOpen: state.embedDefaultOpen,
    setEmbedDefaultOpen: (v) =>
      setState((s) => ({ ...s, embedDefaultOpen: v as boolean })),
    hideChatTimestamps: state.hideChatTimestamps,
    setHideChatTimestamps: (v) =>
      setState((s) => ({ ...s, hideChatTimestamps: v as boolean })),
    renderThirdPartyEmotesOnYoutube: state.renderThirdPartyEmotesOnYoutube,
    setRenderThirdPartyEmotesOnYoutube: (v) =>
      setState((s) => ({
        ...s,
        renderThirdPartyEmotesOnYoutube: v as boolean,
      })),
  };

  return (
    <SettingsProvider value={settings}>
      <OnboardingWizard onComplete={vi.fn()} />
    </SettingsProvider>
  );
}

describe("OnboardingWizard component", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the welcome step first with the setup question and two options", () => {
    renderWizard();
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
    renderWizard();
    const logo = screen.getByAltText("Mixchat");
    expect(logo).toBeInTheDocument();
    expect(logo.tagName).toBe("IMG");
    expect((logo as HTMLImageElement).getAttribute("src")).toBe(IS_TWITCH_ONLY ? "/logo-twitch.webp" : "/logo.webp");
  });

  it("calls onComplete when the Skip setup button is clicked on the welcome step", async () => {
    const onComplete = vi.fn();
    renderWizard(makeSettings(), makeProps({ onComplete }));
    const skipButtons = screen.getAllByText("Skip setup");
    await userEvent.click(skipButtons[0]);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("advances to the theme step when Continue is clicked", async () => {
    renderWizard();
    await userEvent.click(screen.getByText("Continue"));
    expect(screen.getByText("Pick a theme")).toBeInTheDocument();
  });

  it("applies streamer defaults when the streamer role is selected", async () => {
    const setStreamerToolsEnabled = vi.fn();
    const setHideViewerCount = vi.fn();
    const setEmbedDefaultOpen = vi.fn();
    const setCompactActions = vi.fn();
    const setKeepModActionsVisible = vi.fn();
    const setModActionsFirst = vi.fn();
    const setDoubleClickConfirmModActions = vi.fn();

    const settings = makeSettings({
      setStreamerToolsEnabled,
      setHideViewerCount,
      setEmbedDefaultOpen,
      setCompactActions,
      setKeepModActionsVisible,
      setModActionsFirst,
      setDoubleClickConfirmModActions,
    });
    renderWizard(settings);

    await userEvent.click(screen.getByText("Continue"));
    await userEvent.click(screen.getByText("Next"));
    await userEvent.click(screen.getByText("I'm a streamer"));

    expect(setStreamerToolsEnabled).toHaveBeenCalledWith(true);
    expect(setHideViewerCount).toHaveBeenCalledWith(true);
    expect(setEmbedDefaultOpen).toHaveBeenCalledWith(false);
    expect(setCompactActions).toHaveBeenCalledWith(true);
    expect(setKeepModActionsVisible).toHaveBeenCalledWith(true);
    expect(setModActionsFirst).toHaveBeenCalledWith(true);
    expect(setDoubleClickConfirmModActions).toHaveBeenCalledWith(true);
  });

  it("applies the same defaults for moderators as for streamers", async () => {
    const setStreamerToolsEnabled = vi.fn();
    const setHideViewerCount = vi.fn();
    const setCompactActions = vi.fn();
    const settings = makeSettings({
      setStreamerToolsEnabled,
      setHideViewerCount,
      setCompactActions,
    });
    renderWizard(settings);

    await userEvent.click(screen.getByText("Continue"));
    await userEvent.click(screen.getByText("Next"));
    await userEvent.click(screen.getByText("I'm a moderator"));

    expect(setStreamerToolsEnabled).toHaveBeenCalledWith(true);
    expect(setHideViewerCount).toHaveBeenCalledWith(true);
    expect(setCompactActions).toHaveBeenCalledWith(true);
  });

  it("applies viewer defaults when the viewer role is selected", async () => {
    const setStreamerToolsEnabled = vi.fn();
    const setHideViewerCount = vi.fn();
    const setEmbedDefaultOpen = vi.fn();
    const setCompactActions = vi.fn();
    const setKeepModActionsVisible = vi.fn();
    const setModActionsFirst = vi.fn();
    const setDoubleClickConfirmModActions = vi.fn();

    const settings = makeSettings({
      setStreamerToolsEnabled,
      setHideViewerCount,
      setEmbedDefaultOpen,
      setCompactActions,
      setKeepModActionsVisible,
      setModActionsFirst,
      setDoubleClickConfirmModActions,
    });
    renderWizard(settings);

    await userEvent.click(screen.getByText("Continue"));
    await userEvent.click(screen.getByText("Next"));
    await userEvent.click(screen.getByText("I'm a viewer"));

    expect(setStreamerToolsEnabled).toHaveBeenCalledWith(false);
    expect(setHideViewerCount).toHaveBeenCalledWith(false);
    expect(setEmbedDefaultOpen).toHaveBeenCalledWith(true);
    expect(setCompactActions).toHaveBeenCalledWith(false);
    expect(setKeepModActionsVisible).toHaveBeenCalledWith(false);
    expect(setModActionsFirst).toHaveBeenCalledWith(false);
    expect(setDoubleClickConfirmModActions).toHaveBeenCalledWith(false);
  });

  it("disables Finish until a role is picked, then calls onComplete on click", async () => {
    const onComplete = vi.fn();
    renderWizard(makeSettings(), makeProps({ onComplete }));
    await userEvent.click(screen.getByText("Continue"));
    await userEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Finish")).toBeDisabled();
    await userEvent.click(screen.getByText("I'm a viewer"));
    expect(screen.getByText("Finish")).not.toBeDisabled();
    await userEvent.click(screen.getByText("Finish"));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("navigates back to the theme step when Back is clicked", async () => {
    renderWizard();
    await userEvent.click(screen.getByText("Continue"));
    await userEvent.click(screen.getByText("Next"));
    expect(screen.getByText("How will you use Mixchat?")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Back"));
    expect(screen.getByText("Pick a theme")).toBeInTheDocument();
  });

  it("toggles a non-locked setting and shows the new value", async () => {
    const setHideChatTimestamps = vi.fn();
    const settings = makeSettings({
      hideChatTimestamps: false,
      setHideChatTimestamps,
    });
    renderWizard(settings);
    await userEvent.click(screen.getByText("Continue"));
    await userEvent.click(screen.getByText("Next"));
    await userEvent.click(screen.getByText("I'm a viewer"));

    const labels = screen.getAllByText("Hide chat timestamps");
    expect(labels.length).toBeGreaterThan(0);
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBeGreaterThan(0);
    await userEvent.click(checkboxes[0]);
    expect(setHideChatTimestamps).toHaveBeenCalled();
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
    const setFontSize = vi.fn();
    renderWizard(makeSettings({ setFontSize }));
    await userEvent.click(screen.getByText("Continue"));
    const range = screen.getByRole("slider");
    await userEvent.click(range);
    fireEvent.change(range, { target: { value: "18" } });
    expect(setFontSize).toHaveBeenCalledWith(18);
  });

  it("switches the active font when a font button is clicked", async () => {
    const setChatFont = vi.fn();
    renderWizard(makeSettings({ setChatFont }));
    await userEvent.click(screen.getByText("Continue"));
    await userEvent.click(screen.getByText("Roboto"));
    expect(setChatFont).toHaveBeenCalledWith("roboto");
  });

  it("marks the currently selected font as active", async () => {
    renderWizard(makeSettings({ chatFont: "rubik" }));
    await userEvent.click(screen.getByText("Continue"));
    const active = document.querySelector(
      ".onboarding-typography-font--active",
    );
    expect(active).not.toBeNull();
    expect(active!.textContent).toMatch(/Rubik/);
  });

  it("exposes the YT third-party emote setting as a toggle for streamers", async () => {
    render(<StatefulHarness />);
    await userEvent.click(screen.getByText("Continue"));
    await userEvent.click(screen.getByText("Next"));
    await userEvent.click(screen.getByText("I'm a streamer"));

    const setting = screen
      .getByText("Render 7TV / BTTV / FFZ emotes in YouTube chat")
      .closest(".onboarding-setting");
    expect(setting).not.toBeNull();
    expect(setting!.querySelector(".onboarding-toggle")).toBeInTheDocument();
  });

  it("exposes the YT third-party emote setting as a toggle for moderators", async () => {
    render(<StatefulHarness />);
    await userEvent.click(screen.getByText("Continue"));
    await userEvent.click(screen.getByText("Next"));
    await userEvent.click(screen.getByText("I'm a moderator"));

    const setting = screen
      .getByText("Render 7TV / BTTV / FFZ emotes in YouTube chat")
      .closest(".onboarding-setting");
    expect(setting).not.toBeNull();
    expect(setting!.querySelector(".onboarding-toggle")).toBeInTheDocument();
  });

  it("exposes the YT third-party emote setting as a toggle for viewers", async () => {
    render(<StatefulHarness />);
    await userEvent.click(screen.getByText("Continue"));
    await userEvent.click(screen.getByText("Next"));
    await userEvent.click(screen.getByText("I'm a viewer"));

    const setting = screen
      .getByText("Render 7TV / BTTV / FFZ emotes in YouTube chat")
      .closest(".onboarding-setting");
    expect(setting).not.toBeNull();
    expect(setting!.querySelector(".onboarding-toggle")).toBeInTheDocument();
  });

  it("invokes the YT third-party emote setter when the toggle is clicked", async () => {
    const setRenderThirdPartyEmotesOnYoutube = vi.fn();
    renderWizard(
      makeSettings({ setRenderThirdPartyEmotesOnYoutube }),
    );
    await userEvent.click(screen.getByText("Continue"));
    await userEvent.click(screen.getByText("Next"));
    await userEvent.click(screen.getByText("I'm a viewer"));

    const setting = screen
      .getByText("Render 7TV / BTTV / FFZ emotes in YouTube chat")
      .closest(".onboarding-setting");
    expect(setting).not.toBeNull();
    const checkbox = setting!.querySelector<HTMLInputElement>(
      '.onboarding-toggle input[type="checkbox"]',
    );
    expect(checkbox).not.toBeNull();
    await userEvent.click(checkbox!);
    expect(
      setRenderThirdPartyEmotesOnYoutube,
    ).toHaveBeenCalledWith(true);
  });

  it("applies the streamer default (off) for the YT third-party emote setting", async () => {
    const setRenderThirdPartyEmotesOnYoutube = vi.fn();
    renderWizard(
      makeSettings({ setRenderThirdPartyEmotesOnYoutube }),
    );
    await userEvent.click(screen.getByText("Continue"));
    await userEvent.click(screen.getByText("Next"));
    await userEvent.click(screen.getByText("I'm a streamer"));

    expect(
      setRenderThirdPartyEmotesOnYoutube,
    ).toHaveBeenCalledWith(false);
  });
});
