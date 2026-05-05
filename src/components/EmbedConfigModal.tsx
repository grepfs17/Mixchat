import { useRef, useState, useCallback } from 'react';
import { FaTimes, FaDownload, FaUpload, FaChevronDown, FaCloudUploadAlt, FaCloudDownloadAlt, FaLink, FaCheck } from 'react-icons/fa';
import type { ChatFont, ChatTheme } from '../lib/types';
import { FONT_FAMILY_MAP, CHAT_FONT_OPTIONS, THEME_OPTIONS } from '../lib/types';
import { playMentionSoundPreview, MENTION_SOUND_OPTIONS, type MentionSoundType } from '../hooks/useTwitchChat';
import { exportSettings, importSettings } from '../lib/settingsBackup';
import { saveSettingsToDrive, loadSettingsFromDrive } from '../lib/googleDrive';

const GROUPS = ['appearance', 'chat', 'layout', 'streamer', 'notifications', 'backup'] as const;
type GroupKey = typeof GROUPS[number];

interface EmbedConfigModalProps {
  embedDefaultOpen: boolean;
  onEmbedDefaultOpenChange: (value: boolean) => void;
  unifyChatEnabled: boolean;
  onUnifyChatEnabledChange: (value: boolean) => void;
  useYoutubeEmbed: boolean;
  onUseYoutubeEmbedChange: (value: boolean) => void;
  fontSize: number;
  onFontSizeChange: (value: number) => void;
  chatFont: ChatFont;
  onChatFontChange: (value: ChatFont) => void;
  mentionSoundEnabled: boolean;
  onMentionSoundEnabledChange: (value: boolean) => void;
  mentionVolume: number;
  onMentionVolumeChange: (value: number) => void;
  mentionSoundType: MentionSoundType;
  onMentionSoundTypeChange: (value: MentionSoundType) => void;
  showDeletedMessages: boolean;
  onShowDeletedMessagesChange: (value: boolean) => void;
  compactActions: boolean;
  onCompactActionsChange: (value: boolean) => void;
  splitChatEnabled: boolean;
  onSplitChatEnabledChange: (value: boolean) => void;
  chatTheme: ChatTheme;
  onChatThemeChange: (value: ChatTheme) => void;
  hideViewerCount: boolean;
  onHideViewerCountChange: (value: boolean) => void;
  hasYoutubeSession: boolean;
  onReauthYoutube: () => void;
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
  splitChatEnabled,
  onSplitChatEnabledChange,
  chatTheme,
  onChatThemeChange,
  hideViewerCount,
  onHideViewerCountChange,
  hasYoutubeSession,
  onReauthYoutube,
  onClose,
}: EmbedConfigModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [driveMessage, setDriveMessage] = useState<string | null>(null);
  const [driveLoading, setDriveLoading] = useState<'save' | 'load' | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<GroupKey, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const g of GROUPS) init[g] = false;
    return init as Record<GroupKey, boolean>;
  });

  const toggle = (key: GroupKey) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const count = await importSettings(file);
      setImportMessage(`Restored ${count} settings. Reloading...`);
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setImportMessage(err instanceof Error ? err.message : 'Import failed');
      setTimeout(() => setImportMessage(null), 3000);
    }
    e.target.value = '';
  };

  const handleDriveSave = useCallback(async () => {
    setDriveLoading('save');
    setDriveMessage(null);
    setShareLink(null);
    setLinkCopied(false);
    try {
      const backup = {
        _version: 1,
        _app: 'mixchat',
        _exportedAt: new Date().toISOString(),
        settings: Object.fromEntries(
          [
            'mixchat_video_ratio', 'mixchat_favorite_channels', 'mixchat_embed_default_open',
            'mixchat_unify_chat', 'mixchat_split_chat', 'mixchat_use_youtube_embed',
            'mixchat_font_size', 'mixchat_chat_font', 'mixchat_chat_theme', 'mixchat_mention_sound',
            'mixchat_mention_volume', 'mixchat_mention_sound_type',
            'mixchat_show_deleted_messages', 'mixchat_compact_actions',
            'mixchat_hide_viewer_count',
            'mixchat_chat_split_ratio', 'mixchat_watched_streamers',
            'mixchat_youtube_links', 'disabled_emotes_v1',
          ].flatMap(k => {
            const v = localStorage.getItem(k);
            return v !== null ? [[k, v]] as [string, string][] : [] as [string, string][];
          })
        ),
      };

      const result = await saveSettingsToDrive(JSON.stringify(backup, null, 2));
      setDriveMessage('Settings saved to Google Drive!');
      if (result.webViewLink) {
        setShareLink(result.webViewLink);
      }
    } catch (err: any) {
      if (err?.message?.includes('Drive permission') || err?.message?.includes('insufficient') || err?.message?.includes('sign in again')) {
        setDriveMessage('Drive access required. Click "Re-auth with Drive" below.');
      } else {
        setDriveMessage(err instanceof Error ? err.message : 'Failed to save to Drive');
      }
    } finally {
      setDriveLoading(null);
    }
  }, []);

  const handleDriveLoad = useCallback(async () => {
    setDriveLoading('load');
    setDriveMessage(null);
    setShareLink(null);
    try {
      const result = await loadSettingsFromDrive();
      let count = 0;
      for (const [key, value] of Object.entries(result.settings)) {
        localStorage.setItem(key, value);
        count++;
      }
      setDriveMessage(`Loaded ${count} settings from Drive. Reloading...`);
      setTimeout(() => window.location.reload(), 1200);
    } catch (err: any) {
      if (err?.message?.includes('Drive permission') || err?.message?.includes('insufficient') || err?.message?.includes('sign in again')) {
        setDriveMessage('Drive access required. Click "Re-auth with Drive" below.');
      } else {
        setDriveMessage(err instanceof Error ? err.message : 'Failed to load from Drive');
      }
    } finally {
      setDriveLoading(null);
    }
  }, []);

  const handleCopyLink = useCallback(() => {
    if (shareLink) {
      navigator.clipboard.writeText(shareLink).then(() => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      });
    }
  }, [shareLink]);

  return (
    <div className="embed-config-overlay" onClick={onClose}>
      <div className="embed-config-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="embed-config-header">
          <h2 className="embed-config-title">Global Settings</h2>
          <button className="embed-config-close-btn" onClick={onClose} title="Close">
            <FaTimes size={20} />
          </button>
        </div>

        {/* Appearance */}
        <div className="embed-config-group">
          <button className="embed-config-group-header" onClick={() => toggle('appearance')}>
            <h3 className="embed-config-group-title">Appearance</h3>
            <FaChevronDown size={12} className={`embed-config-group-chevron${collapsed.appearance ? ' embed-config-group-chevron--collapsed' : ''}`} />
          </button>
          {!collapsed.appearance && (
            <div className="embed-config-group-body">
              <div className="embed-config-section">
                <label className="embed-config-label">
                  Chat Font Size: <span className="embed-config-value">{fontSize}px</span>
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

              <div className="embed-config-section">
                <label className="embed-config-label">Chat Font</label>
                <select
                  value={chatFont}
                  onChange={(e) => onChatFontChange(e.target.value as ChatFont)}
                  className="embed-config-select"
                  style={{ fontFamily: FONT_FAMILY_MAP[chatFont] }}
                >
                  {CHAT_FONT_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value} style={{ fontFamily: FONT_FAMILY_MAP[value] }}>
                      {label}
                    </option>
                  ))}
                </select>
                <p className="embed-config-description">
                  Choose the font used in the chat window.
                </p>
              </div>

              <div className="embed-config-section">
                <label className="embed-config-label">Chat Theme</label>
                <div className="embed-config-theme-grid">
                  {THEME_OPTIONS.map(({ value, label, preview }) => (
                    <button
                      key={value}
                      onClick={() => onChatThemeChange(value as ChatTheme)}
                      className={`embed-config-theme-btn${chatTheme === value ? ' embed-config-theme-btn--active' : ''}`}
                    >
                      <div className="embed-config-theme-preview">
                        <div className="embed-config-theme-preview-bg" style={{ backgroundColor: preview.bg }} />
                        <div className="embed-config-theme-preview-hover" style={{ backgroundColor: preview.hover }} />
                      </div>
                      <span className="embed-config-theme-label">{label}</span>
                      {chatTheme === value && <span className="embed-config-theme-check">✓</span>}
                    </button>
                  ))}
                </div>
                <p className="embed-config-description">
                  Choose the background and hover colors for chat messages.
                </p>
              </div>

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
                  When enabled, messages show a subtle darker background to visually separate each message.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Chat */}
        <div className="embed-config-group">
          <button className="embed-config-group-header" onClick={() => toggle('chat')}>
            <h3 className="embed-config-group-title">Chat</h3>
            <FaChevronDown size={12} className={`embed-config-group-chevron${collapsed.chat ? ' embed-config-group-chevron--collapsed' : ''}`} />
          </button>
          {!collapsed.chat && (
            <div className="embed-config-group-body">
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
                  When enabled, Twitch and YouTube messages appear together in a single chronological feed. Each platform keeps its own styling and features.
                </p>
              </div>

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
                  Replaces the custom YouTube chat with the official iframe embed. Note: This disables some features like custom emotes and unified chat for YouTube.
                </p>
              </div>

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
                  When enabled, messages deleted by a moderator remain visible but are dimmed and marked as deleted. When disabled, they are removed from chat.
                </p>
              </div>

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
                  When enabled, the small reply/copy/mod buttons are hidden from each message. You can still access all actions by right-clicking (long press on mobile) a message to open the context menu.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Layout */}
        <div className="embed-config-group">
          <button className="embed-config-group-header" onClick={() => toggle('layout')}>
            <h3 className="embed-config-group-title">Layout</h3>
            <FaChevronDown size={12} className={`embed-config-group-chevron${collapsed.layout ? ' embed-config-group-chevron--collapsed' : ''}`} />
          </button>
          {!collapsed.layout && (
            <div className="embed-config-group-body">
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
                  If enabled, the stream embed will be visible when you open Mixchat. If disabled, the chat will take up the full width.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Streamer options */}
        <div className="embed-config-group">
          <button className="embed-config-group-header" onClick={() => toggle('streamer')}>
            <h3 className="embed-config-group-title">Streamer options</h3>
            <FaChevronDown size={12} className={`embed-config-group-chevron${collapsed.streamer ? ' embed-config-group-chevron--collapsed' : ''}`} />
          </button>
          {!collapsed.streamer && (
            <div className="embed-config-group-body">
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
                  When enabled, the viewer count is hidden while viewing your own channel.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="embed-config-group">
          <button className="embed-config-group-header" onClick={() => toggle('notifications')}>
            <h3 className="embed-config-group-title">Notifications</h3>
            <FaChevronDown size={12} className={`embed-config-group-chevron${collapsed.notifications ? ' embed-config-group-chevron--collapsed' : ''}`} />
          </button>
          {!collapsed.notifications && (
            <div className="embed-config-group-body">
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
                  Plays a notification sound when someone mentions your name or replies to your message.
                </p>

                {mentionSoundEnabled && (
                  <div className="embed-config-mention-options">
                    <div>
                      <label className="embed-config-volume-label">
                        Volume: <span className="embed-config-volume-value">{Math.round(mentionVolume * 100)}%</span>
                      </label>
                      <div className="embed-config-volume-row">
                        <span className="embed-config-volume-bound">0%</span>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={mentionVolume}
                          onChange={(e) => onMentionVolumeChange(parseFloat(e.target.value))}
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
                            className={`embed-config-sound-btn${mentionSoundType === opt.value ? ' embed-config-sound-btn--active' : ''}`}
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
            </div>
          )}
        </div>

        {/* Backup / Restore */}
        <div className="embed-config-group">
          <button className="embed-config-group-header" onClick={() => toggle('backup')}>
            <h3 className="embed-config-group-title">Backup & Restore</h3>
            <FaChevronDown size={12} className={`embed-config-group-chevron${collapsed.backup ? ' embed-config-group-chevron--collapsed' : ''}`} />
          </button>
          {!collapsed.backup && (
            <div className="embed-config-group-body">
              <div className="embed-config-backup-section">
                <p className="embed-config-backup-description">
                  Export your settings, favorites, and linked YouTube channels to a json file. Import them later to restore — even on a different device.
                </p>
                <div className="embed-config-backup-buttons">
                  <button onClick={exportSettings} className="embed-config-backup-btn">
                    <FaDownload size={13} /> Export
                  </button>
                  <button onClick={() => fileInputRef.current?.click()} className="embed-config-backup-btn">
                    <FaUpload size={13} /> Import
                  </button>
                  <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
                </div>
                {importMessage && (
                  <p className={`embed-config-backup-message ${importMessage.includes('Restored') ? 'embed-config-backup-message--success' : 'embed-config-backup-message--error'}`}>
                    {importMessage}
                  </p>
                )}
              </div>

              <div className="embed-config-backup-section">
                <p className="embed-config-backup-description">
                  {hasYoutubeSession
                    ? 'Save and load your settings directly from your Google Drive. Requires Google sign-in with Drive access.'
                    : 'Sign in with Google to save and load settings from Google Drive.'}
                </p>
                <div className="embed-config-backup-buttons">
                  <button
                    onClick={handleDriveSave}
                    className="embed-config-backup-btn embed-config-drive-btn"
                    disabled={driveLoading !== null || !hasYoutubeSession}
                  >
                    {driveLoading === 'save' ? (
                      <><span className="embed-config-spinner" /> Saving...</>
                    ) : (
                      <><FaCloudUploadAlt size={13} /> Save to Drive</>
                    )}
                  </button>
                  <button
                    onClick={handleDriveLoad}
                    className="embed-config-backup-btn embed-config-drive-btn"
                    disabled={driveLoading !== null || !hasYoutubeSession}
                  >
                    {driveLoading === 'load' ? (
                      <><span className="embed-config-spinner" /> Loading...</>
                    ) : (
                      <><FaCloudDownloadAlt size={13} /> Load from Drive</>
                    )}
                  </button>
                </div>
                {driveMessage && (
                  <p className={`embed-config-backup-message ${driveMessage.includes('saved') || driveMessage.includes('Loaded') ? 'embed-config-backup-message--success' : 'embed-config-backup-message--error'}`}>
                    {driveMessage}
                  </p>
                )}
                {shareLink && (
                  <div className="embed-config-share-link">
                    <span className="embed-config-share-link-url" title={shareLink}>{shareLink}</span>
                    <button onClick={handleCopyLink} className="embed-config-share-link-copy" title="Copy link">
                      {linkCopied ? <FaCheck size={12} /> : <FaLink size={12} />}
                    </button>
                  </div>
                )}
                {!hasYoutubeSession && (
                  <button onClick={onReauthYoutube} className="embed-config-backup-btn embed-config-reauth-btn">
                    Sign in with Google
                  </button>
                )}
              </div>
            </div>
          )}
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