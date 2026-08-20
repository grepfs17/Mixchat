import React, { useRef, useState, useCallback, useMemo } from "react";

import {
  FaTimes,
  FaSearch,
} from "react-icons/fa";
import { importSettings } from "../lib/settingsBackup";
import {
  backupSettingsToDrive,
  restoreSettingsFromDrive,
} from "../lib/driveSync";
import { useSettingsContext } from "../contexts/SettingsContext";
import {
  GROUPS,
  GROUP_LABELS,
  type GroupKey,
} from "./settings/types";
import { getAppearanceSettings } from "./settings/AppearanceSettings";
import { getChatSettings } from "./settings/ChatSettings";
import { getLayoutSettings } from "./settings/LayoutSettings";
import { getStreamerSettings } from "./settings/StreamerSettings";
import { getNotificationSettings } from "./settings/NotificationSettings";
import { getBackupSettings } from "./settings/BackupSettings";
import { getHelpSettings } from "./settings/HelpSettings";

interface EmbedConfigModalProps {
  onClose: () => void;
  hasYoutubeSession: boolean;
  hasDriveScope: boolean;
  onReauthYoutube: () => void;
  onYoutubeDriveLogin: () => void;
}

export default function EmbedConfigModal({
  onClose,
  hasYoutubeSession,
  hasDriveScope,
  onReauthYoutube,
  onYoutubeDriveLogin,
}: EmbedConfigModalProps) {
  const s = useSettingsContext();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [driveMessage, setDriveMessage] = useState<string | null>(null);
  const [driveLoading, setDriveLoading] = useState<"save" | "load" | null>(
    null,
  );
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<GroupKey>("appearance");
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [needsReload, setNeedsReload] = useState(false);

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const count = await importSettings(file);
      setImportMessage(`Restored ${count} settings. Reloading...`);
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setImportMessage(err instanceof Error ? err.message : "Import failed");
      setTimeout(() => setImportMessage(null), 3000);
    }
    e.target.value = "";
  }, []);

  const handleDriveSave = useCallback(async () => {
    setDriveLoading("save");
    setDriveMessage(null);
    setShareLink(null);
    setLinkCopied(false);
    const result = await backupSettingsToDrive();
    if (result.ok) {
      setDriveMessage("Settings saved to Google Drive!");
      if (result.webViewLink) {
        setShareLink(result.webViewLink);
      }
    } else {
      setDriveMessage(result.message);
    }
    setDriveLoading(null);
  }, []);

  const handleDriveLoad = useCallback(async () => {
    setDriveLoading("load");
    setDriveMessage(null);
    setShareLink(null);
    const result = await restoreSettingsFromDrive();
    if (result.ok) {
      setDriveMessage(
        `Loaded ${result.count} settings from Drive. Reloading...`,
      );
      setTimeout(() => window.location.reload(), 1200);
    } else {
      setDriveMessage(result.message);
    }
    setDriveLoading(null);
  }, []);

  const handleCopyLink = useCallback(() => {
    if (shareLink) {
      navigator.clipboard.writeText(shareLink).then(() => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      });
    }
  }, [shareLink]);

  const handleNeedsReload = useCallback(() => {
    setNeedsReload(true);
  }, []);

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  // Settings items assembled from category files

  const settingsItems = useMemo(
    () => [
      ...getAppearanceSettings({
        fontSize: s.fontSize,
        onFontSizeChange: s.setFontSize,
        chatFont: s.chatFont,
        onChatFontChange: s.setChatFont,
        chatTheme: s.chatTheme,
        onChatThemeChange: s.setChatTheme,
        splitChatEnabled: s.splitChatEnabled,
        onSplitChatEnabledChange: s.setSplitChatEnabled,
        hideChatTimestamps: s.hideChatTimestamps,
        onHideChatTimestampsChange: s.setHideChatTimestamps,
      }),
      ...getChatSettings({
        unifyChatEnabled: s.unifyChatEnabled,
        onUnifyChatEnabledChange: s.setUnifyChatEnabled,
        useYoutubeEmbed: s.useYoutubeEmbed,
        onUseYoutubeEmbedChange: s.setUseYoutubeEmbed,
        showDeletedMessages: s.showDeletedMessages,
        onShowDeletedMessagesChange: s.setShowDeletedMessages,
        renderThirdPartyEmotesOnYoutube: s.renderThirdPartyEmotesOnYoutube,
        onRenderThirdPartyEmotesOnYoutubeChange: s.setRenderThirdPartyEmotesOnYoutube,
        emoteAutocompleteMode: s.emoteAutocompleteMode,
        onEmoteAutocompleteModeChange: s.setEmoteAutocompleteMode,
        compactActions: s.compactActions,
        onCompactActionsChange: s.setCompactActions,
        keepModActionsVisible: s.keepModActionsVisible,
        onKeepModActionsVisibleChange: s.setKeepModActionsVisible,
        modActionsFirst: s.modActionsFirst,
        onModActionsFirstChange: s.setModActionsFirst,
        doubleClickConfirmModActions: s.doubleClickConfirmModActions,
        onDoubleClickConfirmModActionsChange: s.setDoubleClickConfirmModActions,
      }),
      ...getLayoutSettings({
        embedDefaultOpen: s.embedDefaultOpen,
        onEmbedDefaultOpenChange: s.setEmbedDefaultOpen,
        defaultPlayerType: s.defaultPlayerType,
        onDefaultPlayerTypeChange: s.setDefaultPlayerType,
        defaultHlsQuality: s.defaultHlsQuality,
        onDefaultHlsQualityChange: s.setDefaultHlsQuality,
        onNeedsReload: handleNeedsReload,
        autoFoldSidebar: s.autoFoldSidebar,
        onAutoFoldSidebarChange: s.setAutoFoldSidebar,
      }),
      ...getStreamerSettings({
        streamerToolsEnabled: s.streamerToolsEnabled,
        onStreamerToolsEnabledChange: s.setStreamerToolsEnabled,
        hideViewerCount: s.hideViewerCount,
        onHideViewerCountChange: s.setHideViewerCount,
        ignoredUsers: s.ignoredUsers,
        onIgnoredUsersChange: s.setIgnoredUsers,
        eventSounds: s.eventSounds,
        onEventSoundChange: s.handleEventSoundChange,
        eventSoundVolume: s.eventSoundVolume,
        onEventSoundVolumeChange: s.setEventSoundVolume,
      }),
      ...getNotificationSettings({
        mentionSoundEnabled: s.mentionSoundEnabled,
        onMentionSoundEnabledChange: s.setMentionSoundEnabled,
        mentionVolume: s.mentionVolume,
        onMentionVolumeChange: s.setMentionVolume,
        mentionSoundType: s.mentionSoundType,
        onMentionSoundTypeChange: s.setMentionSoundType,
      }),
      ...getBackupSettings({
        fileInputRef,
        handleImport,
        importMessage,
        handleDriveSave,
        handleDriveLoad,
        handleCopyLink,
        driveLoading,
        driveMessage,
        shareLink,
        linkCopied,
        hasYoutubeSession,
        hasDriveScope,
        onReauthYoutube,
        onYoutubeDriveLogin,
      }),
      ...getHelpSettings(),
    ],
    [
      s.fontSize,
      s.setFontSize,
      s.chatFont,
      s.setChatFont,
      s.chatTheme,
      s.setChatTheme,
      s.splitChatEnabled,
      s.setSplitChatEnabled,
      s.hideChatTimestamps,
      s.setHideChatTimestamps,
      s.unifyChatEnabled,
      s.setUnifyChatEnabled,
      s.useYoutubeEmbed,
      s.setUseYoutubeEmbed,
      s.showDeletedMessages,
      s.setShowDeletedMessages,
      s.renderThirdPartyEmotesOnYoutube,
      s.setRenderThirdPartyEmotesOnYoutube,
      s.emoteAutocompleteMode,
      s.setEmoteAutocompleteMode,
      s.compactActions,
      s.setCompactActions,
      s.keepModActionsVisible,
      s.setKeepModActionsVisible,
      s.modActionsFirst,
      s.setModActionsFirst,
      s.doubleClickConfirmModActions,
      s.setDoubleClickConfirmModActions,
      s.embedDefaultOpen,
      s.setEmbedDefaultOpen,
      s.defaultPlayerType,
      s.setDefaultPlayerType,
      s.defaultHlsQuality,
      s.setDefaultHlsQuality,
      handleNeedsReload,
      s.autoFoldSidebar,
      s.setAutoFoldSidebar,
      s.streamerToolsEnabled,
      s.setStreamerToolsEnabled,
      s.hideViewerCount,
      s.setHideViewerCount,
      s.ignoredUsers,
      s.setIgnoredUsers,
      s.eventSounds,
      s.handleEventSoundChange,
      s.eventSoundVolume,
      s.setEventSoundVolume,
      s.mentionSoundEnabled,
      s.setMentionSoundEnabled,
      s.mentionVolume,
      s.setMentionVolume,
      s.mentionSoundType,
      s.setMentionSoundType,
      fileInputRef,
      handleImport,
      importMessage,
      handleDriveSave,
      handleDriveLoad,
      handleCopyLink,
      driveLoading,
      driveMessage,
      shareLink,
      linkCopied,
      hasYoutubeSession,
      hasDriveScope,
      onReauthYoutube,
      onYoutubeDriveLogin,
    ],
  );

  const groupedSettings = useMemo<Record<GroupKey, typeof settingsItems>>(() => {
    const groups = Object.fromEntries(
      GROUPS.map((g) => [g, [] as typeof settingsItems]),
    ) as Record<GroupKey, typeof settingsItems>;
    for (const item of settingsItems) {
      groups[item.group].push(item);
    }
    return groups;
  }, [settingsItems]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return settingsItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q),
    );
  }, [searchQuery, settingsItems]);

  const handleSearchResultClick = useCallback((group: GroupKey) => {
    setSearchQuery("");
    setActiveTab(group);
    searchInputRef.current?.focus();
  }, []);

  return (
    <div className="embed-config-overlay" onClick={onClose}>
      <div
        className="embed-config-modal-content"
        role="dialog"
        aria-modal="true"
        aria-label="Global Settings"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="embed-config-header">
          <h2 className="embed-config-title">Global Settings</h2>
          <div className="embed-config-header-right">
            <div className="embed-config-search">
              <FaSearch size={14} className="embed-config-search-icon" />
              <input
                ref={searchInputRef}
                type="text"
                className="embed-config-search-input"
                placeholder="Search settings..."
                aria-label="Search settings"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button type="button"
                  className="embed-config-search-clear"
                  onClick={() => setSearchQuery("")}
                  title="Clear search"
                >
                  <FaTimes size={12} />
                </button>
              )}
            </div>
            <button type="button"
              className="embed-config-close-btn"
              onClick={onClose}
              title="Close"
            >
              <FaTimes size={20} />
            </button>
          </div>
        </div>

        {needsReload && (
          <div className="embed-config-reload-banner">
            <span>Default player changed — reload the page to apply.</span>
            <button type="button" onClick={() => window.location.reload()}>Reload now</button>
            <button type="button" className="embed-config-reload-dismiss" onClick={() => setNeedsReload(false)}>Dismiss</button>
          </div>
        )}

        <div className="embed-config-layout">
          <nav className="embed-config-sidebar">
            {GROUPS.map((group) => (
              <button type="button"
                key={group}
                className={`embed-config-sidebar-item${activeTab === group ? " embed-config-sidebar-item--active" : ""}`}
                onClick={() => setActiveTab(group)}
              >
                {GROUP_LABELS[group]}
              </button>
            ))}
          </nav>

          <div className="embed-config-panel">
            {searchQuery ? (
              filteredItems.length > 0 ? (
                <div className="embed-config-search-results">
                  {filteredItems.map((item) => (
                    <div
                      key={item.id}
                      className="embed-config-search-result-item"
                    >
                      <button type="button"
                        className="embed-config-search-result-group"
                        onClick={() => handleSearchResultClick(item.group)}
                      >
                        {GROUP_LABELS[item.group]}
                      </button>
                      <div className="embed-config-search-result-content">
                        {item.render()}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="embed-config-search-empty">
                  <FaSearch
                    size={24}
                    className="embed-config-search-empty-icon"
                  />
                  <p>No settings found for "{searchQuery}"</p>
                </div>
              )
            ) : (
              <>
                <div className="embed-config-group-body">
                  {groupedSettings[activeTab].map((item) => (
                    <div key={item.id}>{item.render()}</div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="embed-config-footer">
          <button type="button" onClick={onClose} className="embed-config-footer-btn">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
