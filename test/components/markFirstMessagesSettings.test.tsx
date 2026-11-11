import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import EmbedConfigModal from "../../src/components/EmbedConfigModal";
import { isFirstMessageChannelInScope } from "../../src/components/chat/ChatAppContent";
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

const FOLLOWING = [
  { name: "foochannel", displayName: "FooChannel" },
  { name: "barchannel", displayName: "BarChannel" },
];

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
    markFirstMessages: false,
    setMarkFirstMessages: noop,
    markFirstMessageChannels: [],
    setMarkFirstMessageChannels: noop,
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
    ...overrides,
  };
}

function renderModal(
  settings: UseChatSettingsResult = makeSettings(),
  allTwitchChannels = FOLLOWING,
) {
  const utils = render(
    <SettingsProvider value={settings}>
      <EmbedConfigModal
        onClose={vi.fn()}
        hasYoutubeSession={false}
        hasDriveScope={false}
        onReauthYoutube={vi.fn()}
        onYoutubeDriveLogin={vi.fn()}
        allTwitchChannels={allTwitchChannels}
      />
    </SettingsProvider>,
  );
  fireEvent.change(screen.getByLabelText("Search settings"), {
    target: { value: "Mark first messages" },
  });
  return utils;
}

describe("Mark first messages per stream setting", () => {
  it("shows the channel picker when the setting is enabled", () => {
    renderModal(makeSettings({ markFirstMessages: true }));
    expect(
      screen.getByRole("checkbox", { name: "Mark first messages per stream" }),
    ).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "FooChannel" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "BarChannel" })).toBeInTheDocument();
  });

  it("hides the channel picker when the setting is disabled", () => {
    renderModal(makeSettings({ markFirstMessages: false }));
    expect(
      screen.getByRole("checkbox", { name: "Mark first messages per stream" }),
    ).not.toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "FooChannel" })).toBeNull();
  });

  it("adds a channel to the scope when checked", () => {
    const setMarkFirstMessageChannels = vi.fn();
    renderModal(
      makeSettings({
        markFirstMessages: true,
        setMarkFirstMessageChannels,
      }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "FooChannel" }));
    expect(setMarkFirstMessageChannels).toHaveBeenCalledWith(["foochannel"]);
  });

  it("removes a selected channel when unchecked", () => {
    const setMarkFirstMessageChannels = vi.fn();
    renderModal(
      makeSettings({
        markFirstMessages: true,
        markFirstMessageChannels: ["foochannel", "barchannel"],
        setMarkFirstMessageChannels,
      }),
    );
    const foo = screen.getByRole("checkbox", { name: "FooChannel" });
    expect(foo).toBeChecked();
    fireEvent.click(foo);
    expect(setMarkFirstMessageChannels).toHaveBeenCalledWith(["barchannel"]);
  });

  it("filters channels with the search input", () => {
    renderModal(makeSettings({ markFirstMessages: true }));
    fireEvent.change(screen.getByLabelText("Search followed channels"), {
      target: { value: "bar" },
    });
    expect(screen.queryByRole("checkbox", { name: "FooChannel" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "BarChannel" })).toBeInTheDocument();
  });

  it("still lists stale selected channels when the following list is empty", () => {
    const setMarkFirstMessageChannels = vi.fn();
    renderModal(
      makeSettings({
        markFirstMessages: true,
        markFirstMessageChannels: ["oldchannel"],
        setMarkFirstMessageChannels,
      }),
      [],
    );
    expect(
      screen.getByText(/No followed channels found/),
    ).toBeInTheDocument();
    const stale = screen.getByRole("checkbox", { name: /oldchannel/ });
    expect(stale).toBeChecked();
    fireEvent.click(stale);
    expect(setMarkFirstMessageChannels).toHaveBeenCalledWith([]);
  });
});

describe("isFirstMessageChannelInScope", () => {
  it("applies on every channel when no channels are selected", () => {
    expect(isFirstMessageChannelInScope("anything", [])).toBe(true);
    expect(isFirstMessageChannelInScope(undefined, [])).toBe(true);
  });

  it("matches the selected channel case-insensitively", () => {
    expect(isFirstMessageChannelInScope("FooChannel", ["foochannel"])).toBe(
      true,
    );
    expect(isFirstMessageChannelInScope("foochannel", ["FooChannel"])).toBe(
      true,
    );
    expect(isFirstMessageChannelInScope(" foochannel ", ["foochannel"])).toBe(
      true,
    );
  });

  it("disables marks outside the selected channels", () => {
    expect(isFirstMessageChannelInScope("barchannel", ["foochannel"])).toBe(
      false,
    );
    expect(isFirstMessageChannelInScope(undefined, ["foochannel"])).toBe(false);
    expect(isFirstMessageChannelInScope("", ["foochannel"])).toBe(false);
  });
});
