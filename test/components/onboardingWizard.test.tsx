import { useState } from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import OnboardingWizard from "../../src/components/OnboardingWizard";
import type { ChatTheme } from "../../src/lib/types";

function makeProps(overrides: Partial<React.ComponentProps<typeof OnboardingWizard>> = {}) {
  return {
    chatTheme: "default" as const,
    onChatThemeChange: vi.fn(),
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

  it("renders the theme step first with title and skip button", () => {
    render(<OnboardingWizard {...makeProps()} />);
    expect(screen.getByText("Pick a theme")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Choose how Mixchat looks for you\. You can switch any time/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Skip setup/)).toBeInTheDocument();
  });

  it("calls onComplete when the Skip button is clicked", async () => {
    const onComplete = vi.fn();
    render(<OnboardingWizard {...makeProps({ onComplete })} />);
    await userEvent.click(screen.getByText("Skip setup"));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

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
    await userEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Finish")).toBeDisabled();
    await userEvent.click(screen.getByText("I'm a viewer"));
    expect(screen.getByText("Finish")).not.toBeDisabled();
    await userEvent.click(screen.getByText("Finish"));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("navigates back to the theme step when Back is clicked", async () => {
    render(<OnboardingWizard {...makeProps()} />);
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
});
