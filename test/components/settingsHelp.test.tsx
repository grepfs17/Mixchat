import { act, render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import EmbedConfigModal from "../../src/components/EmbedConfigModal";
import MobileTouchHintModal from "../../src/components/chat/shared/MobileTouchHintModal";

vi.mock("../../src/lib/driveSync", () => ({
  backupSettingsToDrive: vi.fn(),
  restoreSettingsFromDrive: vi.fn(),
}));

vi.mock("../../src/hooks/chat/useTwitchChat", () => ({
  playMentionSoundPreview: vi.fn(),
  MENTION_SOUND_OPTIONS: [],
}));

function makeProps() {
  return {
    embedDefaultOpen: false,
    onEmbedDefaultOpenChange: vi.fn(),
    unifyChatEnabled: true,
    onUnifyChatEnabledChange: vi.fn(),
    useYoutubeEmbed: false,
    onUseYoutubeEmbedChange: vi.fn(),
    fontSize: 14,
    onFontSizeChange: vi.fn(),
    chatFont: "inter" as const,
    onChatFontChange: vi.fn(),
    mentionSoundEnabled: false,
    onMentionSoundEnabledChange: vi.fn(),
    mentionVolume: 0.2,
    onMentionVolumeChange: vi.fn(),
    mentionSoundType: "ding" as const,
    onMentionSoundTypeChange: vi.fn(),
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
    splitChatEnabled: false,
    onSplitChatEnabledChange: vi.fn(),
    chatTheme: "default" as const,
    onChatThemeChange: vi.fn(),
    hideViewerCount: false,
    onHideViewerCountChange: vi.fn(),
    hideChatTimestamps: false,
    onHideChatTimestampsChange: vi.fn(),
    eventSounds: {},
    onEventSoundChange: vi.fn(),
    eventSoundVolume: 1,
    onEventSoundVolumeChange: vi.fn(),
    ignoredUsers: [],
    onIgnoredUsersChange: vi.fn(),
    hasYoutubeSession: false,
    onReauthYoutube: vi.fn(),
    streamerToolsEnabled: false,
    onStreamerToolsEnabledChange: vi.fn(),
    defaultPlayerType: "embed" as const,
    onDefaultPlayerTypeChange: vi.fn(),
    defaultHlsQuality: "highest",
    onDefaultHlsQualityChange: vi.fn(),
    renderThirdPartyEmotesOnYoutube: false,
    onRenderThirdPartyEmotesOnYoutubeChange: vi.fn(),
    onClose: vi.fn(),
  };
}

describe("EmbedConfigModal Help section", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders a Help sidebar tab", () => {
    render(<EmbedConfigModal {...makeProps()} />);
    expect(screen.getByRole("button", { name: "Help" })).toBeInTheDocument();
  });

  it("shows both wizard buttons when Help tab is active", () => {
    render(<EmbedConfigModal {...makeProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(
      screen.getByText("Show setup wizard"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Show mobile controls wizard"),
    ).toBeInTheDocument();
  });

  it("dispatches mixchat:show-onboarding when Show setup wizard is clicked", () => {
    render(<EmbedConfigModal {...makeProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    const handler = vi.fn();
    window.addEventListener("mixchat:show-onboarding", handler);
    fireEvent.click(screen.getByText("Show setup wizard"));
    expect(handler).toHaveBeenCalled();
    window.removeEventListener("mixchat:show-onboarding", handler);
  });

  it("dispatches mixchat:show-mobile-hint when Show mobile controls wizard is clicked", () => {
    render(<EmbedConfigModal {...makeProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    const handler = vi.fn();
    window.addEventListener("mixchat:show-mobile-hint", handler);
    fireEvent.click(screen.getByText("Show mobile controls wizard"));
    expect(handler).toHaveBeenCalled();
    window.removeEventListener("mixchat:show-mobile-hint", handler);
  });
});

describe("MobileTouchHintModal event trigger", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows when mixchat:show-mobile-hint is dispatched", () => {
    render(<MobileTouchHintModal twitchConnected={true} />);
    expect(
      screen.queryByText((content) => content.includes("Mobile Controls")),
    ).not.toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new CustomEvent("mixchat:show-mobile-hint"));
    });
    expect(
      screen.getByText((content) => content.includes("Mobile Controls")),
    ).toBeInTheDocument();
  });
});
