import { act, render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import EmbedConfigModal from "../../src/components/EmbedConfigModal";
import MobileTouchHintModal from "../../src/components/chat/shared/MobileTouchHintModal";
import { SettingsProvider } from "../../src/contexts/SettingsContext";
import type { UseChatSettingsResult } from "../../src/hooks/app/useChatSettings";

vi.mock("../../src/lib/driveSync", () => ({
  backupSettingsToDrive: vi.fn(),
  restoreSettingsFromDrive: vi.fn(),
}));

vi.mock("../../src/hooks/chat/useTwitchChat", () => ({
  playMentionSoundPreview: vi.fn(),
  MENTION_SOUND_OPTIONS: [],
}));

function makeSettings(): UseChatSettingsResult {
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
    markFirstMessages: false,
    setMarkFirstMessages: noop,
    maxDisplayedMessages: 300,
    setMaxDisplayedMessages: noop,
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
    emoteAutocompleteMode: "default",
    setEmoteAutocompleteMode: noop,
  };
}

function makeProps() {
  return {
    onClose: vi.fn(),
    hasYoutubeSession: false,
    hasDriveScope: false,
    onReauthYoutube: vi.fn(),
    onYoutubeDriveLogin: vi.fn(),
  };
}

function renderModal() {
  return render(
    <SettingsProvider value={makeSettings()}>
      <EmbedConfigModal {...makeProps()} />
    </SettingsProvider>,
  );
}

describe("EmbedConfigModal Help section", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders a Help sidebar tab", () => {
    renderModal();
    expect(screen.getByRole("button", { name: "Help" })).toBeInTheDocument();
  });

  it("shows both wizard buttons when Help tab is active", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(
      screen.getByText("Show setup wizard"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Show mobile controls wizard"),
    ).toBeInTheDocument();
  });

  it("dispatches mixchat:show-onboarding when Show setup wizard is clicked", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    const handler = vi.fn();
    window.addEventListener("mixchat:show-onboarding", handler);
    fireEvent.click(screen.getByText("Show setup wizard"));
    expect(handler).toHaveBeenCalled();
    window.removeEventListener("mixchat:show-onboarding", handler);
  });

  it("dispatches mixchat:show-mobile-hint when Show mobile controls wizard is clicked", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    const handler = vi.fn();
    window.addEventListener("mixchat:show-mobile-hint", handler);
    fireEvent.click(screen.getByText("Show mobile controls wizard"));
    expect(handler).toHaveBeenCalled();
    window.removeEventListener("mixchat:show-mobile-hint", handler);
  });

  it("dispatches mixchat:show-firefox-notice when Show Firefox twitch player fix is clicked", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    const handler = vi.fn();
    window.addEventListener("mixchat:show-firefox-notice", handler);
    fireEvent.click(screen.getByText("Show Firefox twitch player fix"));
    expect(handler).toHaveBeenCalled();
    window.removeEventListener("mixchat:show-firefox-notice", handler);
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

describe("EmbedConfigModal Layout tab: auto-fold sidebar", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the auto-fold sidebar checkbox in the Layout tab", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Layout" }));
    expect(
      screen.getByText("Auto-fold sidebar on channel select"),
    ).toBeInTheDocument();
  });

  it("calls setAutoFoldSidebar when the checkbox is toggled", () => {
    const setAutoFoldSidebar = vi.fn();
    const settings = makeSettings();
    render(
      <SettingsProvider
        value={{ ...settings, setAutoFoldSidebar }}
      >
        <EmbedConfigModal {...makeProps()} />
      </SettingsProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Layout" }));
    const checkbox = screen.getByLabelText(
      "Auto-fold sidebar on channel select",
    );
    fireEvent.click(checkbox);
    expect(setAutoFoldSidebar).toHaveBeenCalledWith(true);
  });
});
