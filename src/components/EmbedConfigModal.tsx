import React, { useRef, useState, useCallback, useMemo } from "react";
import {
  FaTimes,
  FaSearch,
  FaDownload,
  FaUpload,
  FaCloudUploadAlt,
  FaCloudDownloadAlt,
  FaLink,
  FaCheck,
  FaTrash,
  FaPlay,
} from "react-icons/fa";
import type { ChatFont, ChatTheme } from "../lib/types";
import {
  FONT_FAMILY_MAP,
  CHAT_FONT_OPTIONS,
  THEME_OPTIONS,
} from "../lib/types";
import {
  playMentionSoundPreview,
  MENTION_SOUND_OPTIONS,
} from "../hooks/chat/useTwitchChat";
import { exportSettings, importSettings } from "../lib/settingsBackup";
import {
  backupSettingsToDrive,
  restoreSettingsFromDrive,
} from "../lib/driveSync";
import type { SettingsProps } from "../lib/settings/types";

const GROUPS = [
  "appearance",
  "chat",
  "layout",
  "streamer",
  "notifications",
  "backup",
  "help",
] as const;
type GroupKey = (typeof GROUPS)[number];

const GROUP_LABELS: Record<GroupKey, string> = {
  appearance: "Appearance",
  chat: "Chat",
  layout: "Layout",
  streamer: "Streamer",
  notifications: "Notifications",
  backup: "Backup & Restore",
  help: "Help",
};

interface EmbedConfigModalProps extends SettingsProps {
  onClose: () => void;
}

export default function EmbedConfigModal({
  embedDefaultOpen,
  onEmbedDefaultOpenChange,
  unifyChatEnabled,
  onUnifyChatEnabledChange,
  useYoutubeEmbed,
  onUseYoutubeEmbedChange,
  fontSize,
  onFontSizeChange,
  chatFont,
  onChatFontChange,
  mentionSoundEnabled,
  onMentionSoundEnabledChange,
  mentionVolume,
  onMentionVolumeChange,
  mentionSoundType,
  onMentionSoundTypeChange,
  showDeletedMessages,
  onShowDeletedMessagesChange,
  compactActions,
  onCompactActionsChange,
  keepModActionsVisible,
  onKeepModActionsVisibleChange,
  modActionsFirst,
  onModActionsFirstChange,
  doubleClickConfirmModActions,
  onDoubleClickConfirmModActionsChange,
  splitChatEnabled,
  onSplitChatEnabledChange,
  chatTheme,
  onChatThemeChange,
  hideViewerCount,
  onHideViewerCountChange,
  hideChatTimestamps,
  onHideChatTimestampsChange,
  eventSounds,
  onEventSoundChange,
  eventSoundVolume,
  onEventSoundVolumeChange,
  ignoredUsers,
  onIgnoredUsersChange,
  hasYoutubeSession,
  onReauthYoutube,
  streamerToolsEnabled,
  onStreamerToolsEnabledChange,
  defaultPlayerType,
  onDefaultPlayerTypeChange,
  defaultHlsQuality,
  onDefaultHlsQualityChange,
  renderThirdPartyEmotesOnYoutube,
  onRenderThirdPartyEmotesOnYoutubeChange,
  onClose,
}: EmbedConfigModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [driveMessage, setDriveMessage] = useState<string | null>(null);
  const [driveLoading, setDriveLoading] = useState<"save" | "load" | null>(
    null,
  );
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<GroupKey>("appearance");
  const [eventSoundsCollapsed, setEventSoundsCollapsed] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [ignoredUserInput, setIgnoredUserInput] = useState("");
  const [needsReload, setNeedsReload] = useState(false);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
  };

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

  const EVENT_SOUND_TYPES = [
    { key: "subscription", label: "New Subscription" },
    { key: "resub", label: "Resubscription" },
    { key: "subgift", label: "Gift Subscription" },
    { key: "redemption", label: "Channel Points Redemption" },
    { key: "highlight", label: "Highlighted Message" },
    { key: "raid", label: "Raid" },
    { key: "watch-streak", label: "Watch Streak" },
    { key: "announcement", label: "Announcement" },
    { key: "reward-gift", label: "Reward Gift" },
  ];

  const soundFileInputRef = useRef<HTMLInputElement>(null);
  const [currentEventType, setCurrentEventType] = useState<string>("");

  const handleSoundFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !currentEventType) return;

      if (!file.type.startsWith("audio/")) {
        alert("Please select a valid audio file.");
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        alert("Audio file must be less than 5MB.");
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        onEventSoundChange(currentEventType, dataUrl);
        setCurrentEventType("");
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    [currentEventType, onEventSoundChange],
  );

  const playEventSound = useCallback(
    (eventType: string) => {
      const soundData = eventSounds[eventType];
      if (!soundData) return;

      const audio = new Audio(soundData);
      audio.volume = Math.max(0, Math.min(1, eventSoundVolume));
      audio.play().catch(() => {});
    },
    [eventSounds, eventSoundVolume],
  );

  const removeEventSound = useCallback(
    (eventType: string) => {
      onEventSoundChange(eventType, null);
    },
    [onEventSoundChange],
  );

  interface SettingsItem {
    id: string;
    group: GroupKey;
    label: string;
    description: string;
    render: () => React.ReactNode;
  }

  const settingsItems = useMemo<SettingsItem[]>(
    () => [
      {
        id: "font-size",
        group: "appearance",
        label: "Chat Font Size",
        description: "Adjust the size of the text in the chat window",
        render: () => (
          <div className="embed-config-section">
            <label className="embed-config-label">
              Chat Font Size:{" "}
              <span className="embed-config-value">{fontSize}px</span>
            </label>
            <div className="embed-config-range-row">
              <span className="embed-config-range-bound">12px</span>
              <input
                type="range"
                min="12"
                max="32"
                step="1"
                value={fontSize}
                onChange={(e) => onFontSizeChange(parseInt(e.target.value))}
                className="embed-config-range"
              />
              <span className="embed-config-range-bound">32px</span>
            </div>
            <p className="embed-config-description">
              Adjust the size of the text in the chat window.
            </p>
          </div>
        ),
      },
      {
        id: "chat-font",
        group: "appearance",
        label: "Chat Font",
        description: "Choose the font used in the chat window",
        render: () => (
          <div className="embed-config-section">
            <label className="embed-config-label">Chat Font</label>
            <select
              value={chatFont}
              onChange={(e) => onChatFontChange(e.target.value as ChatFont)}
              className="embed-config-select"
              style={{ fontFamily: FONT_FAMILY_MAP[chatFont] }}
            >
              {CHAT_FONT_OPTIONS.map(({ value, label }) => (
                <option
                  key={value}
                  value={value}
                  style={{ fontFamily: FONT_FAMILY_MAP[value] }}
                >
                  {label}
                </option>
              ))}
            </select>
            <p className="embed-config-description">
              Choose the font used in the chat window.
            </p>
          </div>
        ),
      },
      {
        id: "chat-theme",
        group: "appearance",
        label: "Chat Theme",
        description: "Choose the background and hover colors for chat messages",
        render: () => (
          <div className="embed-config-section">
            <label className="embed-config-label">Chat Theme</label>
            <div className="embed-config-theme-grid">
        {(() => {
          let lastSection = "";
          return THEME_OPTIONS.map(({ value, label, preview, section }) => {
            const showSection = section && section !== lastSection;
            lastSection = section || lastSection;
            return (
              <React.Fragment key={value}>
                {showSection && (
                  <div className="embed-config-theme-section">{section}</div>
                )}
                <button
                  onClick={() => onChatThemeChange(value as ChatTheme)}
                  className={`embed-config-theme-btn${chatTheme === value ? " embed-config-theme-btn--active" : ""}`}
                >
                  <div className="embed-config-theme-preview">
                    <div
                      className="embed-config-theme-preview-bg"
                      style={{ backgroundColor: preview.bg }}
                    />
                    <div
                      className="embed-config-theme-preview-hover"
                      style={{ backgroundColor: preview.hover }}
                    />
                    <div
                      className="embed-config-theme-preview-accent"
                      style={{ backgroundColor: preview.accent }}
                    />
                  </div>
                  <span className="embed-config-theme-label">{label}</span>
                  {chatTheme === value && (
                    <span className="embed-config-theme-check">✓</span>
                  )}
                </button>
              </React.Fragment>
            );
          });
        })()}
            </div>
            <p className="embed-config-description">
              Choose the background and hover colors for chat messages.
            </p>
          </div>
        ),
      },
      {
        id: "split-chat",
        group: "appearance",
        label: "Split chat",
        description:
          "Messages show a subtle darker background to visually separate each message",
        render: () => (
          <div className="embed-config-section">
            <label className="embed-config-checkbox-label">
              <input
                type="checkbox"
                checked={splitChatEnabled}
                onChange={(e) => onSplitChatEnabledChange(e.target.checked)}
              />
              <span>Split chat</span>
            </label>
            <p className="embed-config-description embed-config-description--indented">
              When enabled, messages show a subtle darker background to visually
              separate each message.
            </p>
          </div>
        ),
      },
      {
        id: "hide-timestamps",
        group: "appearance",
        label: "Hide chat timestamps",
        description: "The time a message was sent will be hidden",
        render: () => (
          <div className="embed-config-section">
            <label className="embed-config-checkbox-label">
              <input
                type="checkbox"
                checked={hideChatTimestamps}
                onChange={(e) => onHideChatTimestampsChange(e.target.checked)}
              />
              <span>Hide chat timestamps</span>
            </label>
            <p className="embed-config-description embed-config-description--indented">
              When enabled, the time a message was sent will be hidden.
            </p>
          </div>
        ),
      },
      {
        id: "unify-chats",
        group: "chat",
        label: "Unify chats",
        description:
          "Twitch and YouTube messages appear together in a single chronological feed",
        render: () => (
          <div className="embed-config-section">
            <label className="embed-config-checkbox-label">
              <input
                type="checkbox"
                checked={unifyChatEnabled}
                onChange={(e) => onUnifyChatEnabledChange(e.target.checked)}
              />
              <span>Unify chats</span>
            </label>
            <p className="embed-config-description embed-config-description--indented">
              When enabled, Twitch and YouTube messages appear together in a
              single chronological feed. Each platform keeps its own styling and
              features.
            </p>
          </div>
        ),
      },
      {
        id: "youtube-embed",
        group: "chat",
        label: "Use official YouTube chat embed",
        description:
          "Replaces the custom YouTube chat with the official iframe embed",
        render: () => (
          <div className="embed-config-section">
            <label className="embed-config-checkbox-label">
              <input
                type="checkbox"
                checked={useYoutubeEmbed}
                onChange={(e) => onUseYoutubeEmbedChange(e.target.checked)}
              />
              <span>Use official YouTube chat embed</span>
            </label>
            <p className="embed-config-description embed-config-description--indented">
              Replaces the custom YouTube chat with the official iframe embed.
              Note: This disables some features like custom emotes and unified
              chat for YouTube.
            </p>
          </div>
        ),
      },
      {
        id: "show-deleted",
        group: "chat",
        label: "Show deleted messages",
        description:
          "Deleted messages are hidden behind a click-to-reveal link",
        render: () => (
          <div className="embed-config-section">
            <label className="embed-config-checkbox-label">
              <input
                type="checkbox"
                checked={showDeletedMessages}
                onChange={(e) => onShowDeletedMessagesChange(e.target.checked)}
              />
              <span>Show deleted messages</span>
            </label>
            <p className="embed-config-description embed-config-description--indented">
              When enabled, deleted messages are hidden behind a click-to-reveal
              link. When disabled, they are removed from chat entirely.
            </p>
          </div>
        ),
      },
      {
        id: "render-third-party-emotes-on-youtube",
        group: "chat",
        label: "Render 7TV / BTTV / FFZ emotes in YouTube chat",
        description:
          "Resolve third-party emote names inside YouTube live chat messages as images",
        render: () => (
          <div className="embed-config-section">
            <label className="embed-config-checkbox-label">
              <input
                type="checkbox"
                checked={renderThirdPartyEmotesOnYoutube}
                onChange={(e) =>
                  onRenderThirdPartyEmotesOnYoutubeChange(e.target.checked)
                }
              />
              <span>Render 7TV / BTTV / FFZ emotes in YouTube chat</span>
            </label>
            <p className="embed-config-description embed-config-description--indented">
              When enabled, any word in a YouTube chat message that matches a
              7TV, BTTV, or FFZ emote name is rendered as an image. Uses the
              same emote set as the currently selected Twitch channel, so the
              scope is global + channel-specific just like Twitch chat. Only
              Mixchat users will see the emotes. The message is still sent as
              plain text on YouTube and other viewers see the raw names.
            </p>
          </div>
        ),
      },
      {
        id: "hide-inline-actions",
        group: "chat",
        label: "Hide inline action buttons",
        description:
          "The small reply/copy/mod buttons are hidden from each message",
        render: () => (
          <div className="embed-config-section">
            <label className="embed-config-checkbox-label">
              <input
                type="checkbox"
                checked={compactActions}
                onChange={(e) => onCompactActionsChange(e.target.checked)}
              />
              <span>Hide inline action buttons</span>
            </label>
            <p className="embed-config-description embed-config-description--indented">
              When enabled, the small reply/copy/mod buttons are hidden from
              each message. You can still access all actions by right-clicking
              (long press on mobile) a message to open the context menu.
            </p>
            {compactActions && (
              <label className="embed-config-checkbox-label embed-config-checkbox-label--suboption">
                <input
                  type="checkbox"
                  checked={keepModActionsVisible}
                  onChange={(e) =>
                    onKeepModActionsVisibleChange(e.target.checked)
                  }
                />
                <span>Keep mod actions visible</span>
              </label>
            )}
            {compactActions && (
              <p className="embed-config-description embed-config-description--indented">
                When enabled, moderator action buttons (delete, timeout, ban,
                warn) remain visible even when inline action buttons are hidden.
              </p>
            )}
          </div>
        ),
      },
      {
        id: "mod-actions-first",
        group: "chat",
        label: "Show mod actions at the start of the message",
        description:
          "Move the moderator action buttons (delete, timeout, ban, warn) to the start of the message, before the timestamp and badges",
        render: () => (
          <div className="embed-config-section">
            <label className="embed-config-checkbox-label">
              <input
                type="checkbox"
                checked={modActionsFirst}
                onChange={(e) => onModActionsFirstChange(e.target.checked)}
              />
              <span>Show mod actions at the start of the message</span>
            </label>
            <p className="embed-config-description embed-config-description--indented">
              When enabled, the mod action buttons (delete, timeout, ban, warn)
              appear at the <strong>start</strong> of each message instead of
              the end, putting them before the timestamp, badges and author.
              Reply and copy buttons stay at the end. Only visible while
              moderator mode is on.
            </p>
          </div>
        ),
      },
      {
        id: "double-click-confirm-mod-actions",
        group: "chat",
        label: "Double-click to confirm mod actions",
        description:
          "Require a double-click to confirm moderator actions (delete, timeout, ban, warn)",
        render: () => (
          <div className="embed-config-section">
            <label className="embed-config-checkbox-label">
              <input
                type="checkbox"
                checked={doubleClickConfirmModActions}
                onChange={(e) =>
                  onDoubleClickConfirmModActionsChange(e.target.checked)
                }
              />
              <span>Double-click to confirm mod actions</span>
            </label>
            <p className="embed-config-description embed-config-description--indented">
              When enabled, you must double-click moderator action buttons
              (delete, timeout, ban, warn) to confirm the action. This helps
              prevent accidental moderation actions.
            </p>
          </div>
        ),
      },
      {
        id: "embed-default",
        group: "layout",
        label: "Open stream embed by default",
        description: "The stream embed will be visible when you open Mixchat",
        render: () => (
          <div className="embed-config-section">
            <label className="embed-config-checkbox-label">
              <input
                type="checkbox"
                checked={embedDefaultOpen}
                onChange={(e) => onEmbedDefaultOpenChange(e.target.checked)}
              />
              <span>Open stream embed by default</span>
            </label>
            <p className="embed-config-description embed-config-description--indented">
              If enabled, the stream embed will be visible when you open
              Mixchat. If disabled, the chat will take up the full width.
            </p>
          </div>
        ),
      },
      {
        id: "default-player",
        group: "layout",
        label: "Default player",
        description:
          "Choose which player to use for Twitch streams. M3U8 (HLS) uses less bandwidth and avoids third-party cookies.",
        render: () => (
          <div className="embed-config-section">
            <label className="embed-config-label">Default player</label>
            <select
              value={defaultPlayerType}
              onChange={(e) => {
                onDefaultPlayerTypeChange(
                  e.target.value as "embed" | "m3u8",
                );
                setNeedsReload(true);
              }}
              className="embed-config-select"
            >
              <option value="embed">Twitch</option>
              <option value="m3u8">M3U8 (experimental)</option>
            </select>
            <p className="embed-config-description">
              Twitch uses the official embed player. M3U8 plays the raw video
              stream directly and uses less bandwidth, but is experimental.
            </p>
          </div>
        ),
      },
      {
        id: "default-hls-quality",
        group: "layout",
        label: "Default HLS resolution",
        description:
          "When using the M3U8 player, start with this resolution.",
        render: () => (
          <div className="embed-config-section">
            <label className="embed-config-label">Default HLS resolution</label>
            <select
              value={defaultHlsQuality}
              onChange={(e) => onDefaultHlsQualityChange(e.target.value)}
              className="embed-config-select"
            >
              <option value="highest">Highest available</option>
              <option value="1080p">1080p</option>
              <option value="720p">720p</option>
              <option value="480p">480p</option>
              <option value="360p">360p</option>
              <option value="160p">160p</option>
              <option value="audio_only">Audio only</option>
            </select>
            <p className="embed-config-description">
              Default resolution for the M3U8 player. Falls back to the closest
              available quality if the exact resolution is not available.
            </p>
          </div>
        ),
      },
      {
        id: "streamer-tools",
        group: "streamer",
        label: "Streamer tools",
        description:
          "Show a Streamer tools button on your own channel with moderation helpers like giveaways",
        render: () => (
          <div className="embed-config-section">
            <label className="embed-config-checkbox-label">
              <input
                type="checkbox"
                checked={streamerToolsEnabled}
                onChange={(e) => onStreamerToolsEnabledChange(e.target.checked)}
              />
              <span>Streamer tools</span>
            </label>
            <p className="embed-config-description embed-config-description--indented">
              When enabled, a <strong>Streamer tools</strong> button appears in
              the chat header while you are viewing your own channel. It
              currently contains a <strong>Giveaway</strong> tool and a
              <strong> Song Queue</strong> tool that lets chatters submit
              YouTube links in chat and follow along on a shareable public
              page.
            </p>
          </div>
        ),
      },
      {
        id: "hide-viewer-count",
        group: "streamer",
        label: "Hide viewer count",
        description:
          "The viewer count is hidden while viewing your own channel",
        render: () => (
          <div className="embed-config-section">
            <label className="embed-config-checkbox-label">
              <input
                type="checkbox"
                checked={hideViewerCount}
                onChange={(e) => onHideViewerCountChange(e.target.checked)}
              />
              <span>Hide viewer count</span>
            </label>
            <p className="embed-config-description embed-config-description--indented">
              When enabled, the viewer count is hidden while viewing your own
              channel.
            </p>
          </div>
        ),
      },
      {
        id: "ignored-users",
        group: "streamer",
        label: "Ignored Users",
        description:
          "Hide messages from specific users and show a badge counter instead",
        render: () => (
          <div className="embed-config-section">
            <label className="embed-config-label">Ignored Users</label>
            <div className="embed-config-ignored-users-input-row">
              <input
                type="text"
                className="embed-config-ignored-users-input"
                placeholder="Enter username..."
                value={ignoredUserInput}
                onChange={(e) => setIgnoredUserInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && ignoredUserInput.trim()) {
                    const username = ignoredUserInput.trim().toLowerCase();
                    if (!ignoredUsers.includes(username)) {
                      onIgnoredUsersChange([...ignoredUsers, username]);
                    }
                    setIgnoredUserInput("");
                  }
                }}
              />
              <button
                className="embed-config-ignored-users-add-btn"
                disabled={!ignoredUserInput.trim()}
                onClick={() => {
                  const username = ignoredUserInput.trim().toLowerCase();
                  if (username && !ignoredUsers.includes(username)) {
                    onIgnoredUsersChange([...ignoredUsers, username]);
                    setIgnoredUserInput("");
                  }
                }}
              >
                Add
              </button>
            </div>
            <p className="embed-config-description embed-config-description--indented">
              Messages from ignored users will be hidden from chat. A badge
              counter will show how many messages were ignored. This is meant to
              avoid seeing your own bots messages and let you center more in
              actual messages.
            </p>
            {ignoredUsers.length > 0 && (
              <div className="embed-config-ignored-users-list">
                {ignoredUsers.map((user) => (
                  <div key={user} className="embed-config-ignored-user-item">
                    <span className="embed-config-ignored-user-name">
                      {user}
                    </span>
                    <button
                      className="embed-config-ignored-user-remove"
                      onClick={() =>
                        onIgnoredUsersChange(
                          ignoredUsers.filter((u) => u !== user),
                        )
                      }
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ),
      },
      {
        id: "event-sounds",
        group: "streamer",
        label: "Event Sounds",
        description: "Upload custom sounds for different chat events",
        render: () => (
          <div className="embed-config-section">
            <button
              className="embed-config-event-sounds-header"
              onClick={() => setEventSoundsCollapsed((v) => !v)}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <label className="embed-config-label embed-config-label--clickable">
                  Event Sounds
                </label>
                {Object.keys(eventSounds).length > 0 && (
                  <span className="embed-config-event-sounds-count">
                    {Object.keys(eventSounds).length}
                  </span>
                )}
              </div>
              <svg
                className={`embed-config-group-chevron${eventSoundsCollapsed ? " embed-config-group-chevron--collapsed" : ""}`}
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M2.5 4.5L6 8L9.5 4.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <p className="embed-config-description">
              Upload custom sounds for different chat events. Sounds play
              automatically when these events occur.
            </p>
            {!eventSoundsCollapsed && (
              <div className="embed-config-event-sounds">
                <div
                  className="embed-config-section"
                  style={{ padding: "0 0 8px" }}
                >
                  <label className="embed-config-volume-label">
                    Volume:{" "}
                    <span className="embed-config-volume-value">
                      {Math.round(eventSoundVolume * 100)}%
                    </span>
                  </label>
                  <div className="embed-config-volume-row">
                    <span className="embed-config-volume-bound">0%</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={eventSoundVolume}
                      onChange={(e) =>
                        onEventSoundVolumeChange(parseFloat(e.target.value))
                      }
                      className="embed-config-range"
                    />
                    <span className="embed-config-volume-bound">100%</span>
                  </div>
                </div>
                {EVENT_SOUND_TYPES.map(({ key, label }) => {
                  const hasSound = !!eventSounds[key];
                  return (
                    <div key={key} className="embed-config-event-sound-item">
                      <span className="embed-config-event-sound-label">
                        {label}
                      </span>
                      <div className="embed-config-event-sound-actions">
                        {hasSound ? (
                          <>
                            <button
                              onClick={() => playEventSound(key)}
                              className="embed-config-event-sound-btn embed-config-event-sound-btn--play"
                              title="Play sound"
                            >
                              <FaPlay size={10} />
                            </button>
                            <button
                              onClick={() => removeEventSound(key)}
                              className="embed-config-event-sound-btn embed-config-event-sound-btn--remove"
                              title="Remove sound"
                            >
                              <FaTrash size={10} />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => {
                              setCurrentEventType(key);
                              soundFileInputRef.current?.click();
                            }}
                            className="embed-config-event-sound-btn embed-config-event-sound-btn--upload"
                          >
                            <FaUpload size={10} /> Upload
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <input
              ref={soundFileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleSoundFileUpload}
              style={{ display: "none" }}
            />
          </div>
        ),
      },
      {
        id: "mention-sound",
        group: "notifications",
        label: "Play sound on mention",
        description:
          "Plays a notification sound when someone mentions your name",
        render: () => (
          <div className="embed-config-section">
            <label className="embed-config-checkbox-label">
              <input
                type="checkbox"
                checked={mentionSoundEnabled}
                onChange={(e) => onMentionSoundEnabledChange(e.target.checked)}
              />
              <span>Play sound on mention</span>
            </label>
            <p className="embed-config-description embed-config-description--indented">
              Plays a notification sound when someone mentions your name or
              replies to your message.
            </p>
            {mentionSoundEnabled && (
              <div className="embed-config-mention-options">
                <div>
                  <label className="embed-config-volume-label">
                    Volume:{" "}
                    <span className="embed-config-volume-value">
                      {Math.round(mentionVolume * 100)}%
                    </span>
                  </label>
                  <div className="embed-config-volume-row">
                    <span className="embed-config-volume-bound">0%</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={mentionVolume}
                      onChange={(e) =>
                        onMentionVolumeChange(parseFloat(e.target.value))
                      }
                      className="embed-config-range"
                    />
                    <span className="embed-config-volume-bound">100%</span>
                  </div>
                </div>
                <div>
                  <label className="embed-config-sound-label">Sound</label>
                  <div className="embed-config-sound-options">
                    {MENTION_SOUND_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          onMentionSoundTypeChange(opt.value);
                          playMentionSoundPreview(mentionVolume, opt.value);
                        }}
                        className={`embed-config-sound-btn${mentionSoundType === opt.value ? " embed-config-sound-btn--active" : ""}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="embed-config-sound-hint">
                    Click a sound to preview it.
                  </p>
                </div>
              </div>
            )}
          </div>
        ),
      },
      {
        id: "export-import",
        group: "backup",
        label: "Export / Import settings",
        description: "Export your settings to a json file or import from one",
        render: () => (
          <div className="embed-config-backup-section">
            <p className="embed-config-backup-description">
              Export your settings, favorites, and linked YouTube channels to a
              json file. Import them later to restore — even on a different
              device.
            </p>
            <div className="embed-config-backup-buttons">
              <button
                onClick={exportSettings}
                className="embed-config-backup-btn"
              >
                <FaDownload size={13} /> Export
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="embed-config-backup-btn"
              >
                <FaUpload size={13} /> Import
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImport}
                style={{ display: "none" }}
              />
            </div>
            {importMessage && (
              <p
                className={`embed-config-backup-message ${importMessage.includes("Restored") ? "embed-config-backup-message--success" : "embed-config-backup-message--error"}`}
              >
                {importMessage}
              </p>
            )}
          </div>
        ),
      },
      {
        id: "google-drive",
        group: "backup",
        label: "Google Drive backup",
        description:
          "Save and load your settings directly from your Google Drive",
        render: () => (
          <div className="embed-config-backup-section">
            <p className="embed-config-backup-description">
              {hasYoutubeSession
                ? "Save and load your settings directly from your Google Drive. Requires Google sign-in with Drive access."
                : "Sign in with Google to save and load settings from Google Drive."}
            </p>
            <div className="embed-config-backup-buttons">
              <button
                onClick={handleDriveSave}
                className="embed-config-backup-btn embed-config-drive-btn"
                disabled={driveLoading !== null || !hasYoutubeSession}
              >
                {driveLoading === "save" ? (
                  <>
                    <span className="embed-config-spinner" /> Saving...
                  </>
                ) : (
                  <>
                    <FaCloudUploadAlt size={13} /> Save to Drive
                  </>
                )}
              </button>
              <button
                onClick={handleDriveLoad}
                className="embed-config-backup-btn embed-config-drive-btn"
                disabled={driveLoading !== null || !hasYoutubeSession}
              >
                {driveLoading === "load" ? (
                  <>
                    <span className="embed-config-spinner" /> Loading...
                  </>
                ) : (
                  <>
                    <FaCloudDownloadAlt size={13} /> Load from Drive
                  </>
                )}
              </button>
            </div>
            {driveMessage && (
              <p
                className={`embed-config-backup-message ${driveMessage.includes("saved") || driveMessage.includes("Loaded") ? "embed-config-backup-message--success" : "embed-config-backup-message--error"}`}
              >
                {driveMessage}
              </p>
            )}
            {shareLink && (
              <div className="embed-config-share-link">
                <span className="embed-config-share-link-url" title={shareLink}>
                  {shareLink}
                </span>
                <button
                  onClick={handleCopyLink}
                  className="embed-config-share-link-copy"
                  title="Copy link"
                >
                  {linkCopied ? <FaCheck size={12} /> : <FaLink size={12} />}
                </button>
              </div>
            )}
            {!hasYoutubeSession && (
              <button
                onClick={onReauthYoutube}
                className="embed-config-backup-btn embed-config-reauth-btn"
              >
                Sign in with Google
              </button>
            )}
          </div>
        ),
      },
      {
        id: "help-wizards",
        group: "help",
        label: "Guided wizards",
        description:
          "Re-open the onboarding wizards at any time to revisit their choices",
        render: () => (
          <div className="embed-config-backup-section">
            <p className="embed-config-backup-description">
              Re-open any of the guided wizards to revisit their choices. They
              don't change your existing settings unless you finish them.
            </p>
            <div className="embed-config-backup-buttons">
              <button
                onClick={() =>
                  window.dispatchEvent(new CustomEvent("mixchat:show-onboarding"))
                }
                className="embed-config-backup-btn"
                type="button"
              >
                <FaPlay size={12} /> Show setup wizard
              </button>
              <button
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("mixchat:show-mobile-hint"),
                  )
                }
                className="embed-config-backup-btn"
                type="button"
              >
                <FaPlay size={12} /> Show mobile controls wizard
              </button>
            </div>
          </div>
        ),
      },
    ],
    [
      fontSize,
      chatFont,
      chatTheme,
      splitChatEnabled,
      hideChatTimestamps,
      unifyChatEnabled,
      useYoutubeEmbed,
      showDeletedMessages,
      compactActions,
      embedDefaultOpen,
      hideViewerCount,
      ignoredUsers,
      eventSounds,
      eventSoundVolume,
      mentionSoundEnabled,
      mentionVolume,
      mentionSoundType,
      hasYoutubeSession,
      driveLoading,
      shareLink,
      linkCopied,
      exportSettings,
      handleDriveSave,
      handleDriveLoad,
      handleCopyLink,
      onReauthYoutube,
      onFontSizeChange,
      onChatFontChange,
      onChatThemeChange,
      onSplitChatEnabledChange,
      onHideChatTimestampsChange,
      onUnifyChatEnabledChange,
      onUseYoutubeEmbedChange,
      onShowDeletedMessagesChange,
      onCompactActionsChange,
      onEmbedDefaultOpenChange,
      onHideViewerCountChange,
      onIgnoredUsersChange,
      onEventSoundVolumeChange,
      onEventSoundChange,
      onMentionSoundEnabledChange,
      onMentionVolumeChange,
      onMentionSoundTypeChange,
      playEventSound,
      removeEventSound,
      handleSoundFileUpload,
      handleImport,
      ignoredUserInput,
      streamerToolsEnabled,
      onStreamerToolsEnabledChange,
      defaultPlayerType,
      onDefaultPlayerTypeChange,
      defaultHlsQuality,
      onDefaultHlsQualityChange,
      renderThirdPartyEmotesOnYoutube,
      onRenderThirdPartyEmotesOnYoutubeChange,
    ],
  );

  const groupedSettings = useMemo<Record<GroupKey, SettingsItem[]>>(() => {
    const groups = Object.fromEntries(
      GROUPS.map((g) => [g, [] as SettingsItem[]]),
    ) as Record<GroupKey, SettingsItem[]>;
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
        onClick={(e) => e.stopPropagation()}
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
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  className="embed-config-search-clear"
                  onClick={() => setSearchQuery("")}
                  title="Clear search"
                >
                  <FaTimes size={12} />
                </button>
              )}
            </div>
            <button
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
            <button onClick={() => window.location.reload()}>Reload now</button>
            <button className="embed-config-reload-dismiss" onClick={() => setNeedsReload(false)}>Dismiss</button>
          </div>
        )}

        <div className="embed-config-layout">
          <nav className="embed-config-sidebar">
            {GROUPS.map((group) => (
              <button
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
                      <button
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
          <button onClick={onClose} className="embed-config-footer-btn">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
