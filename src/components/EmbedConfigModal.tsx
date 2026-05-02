import { useRef, useState } from 'react';
import { FaTimes, FaDownload, FaUpload } from 'react-icons/fa';
import type { ChatFont } from '../lib/types';
import { FONT_FAMILY_MAP, CHAT_FONT_OPTIONS } from '../lib/types';
import { playMentionSoundPreview, MENTION_SOUND_OPTIONS, type MentionSoundType } from '../hooks/useTwitchChat';
import { exportSettings, importSettings } from '../lib/settingsBackup';

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
  onClose,
}: EmbedConfigModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);

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

  return (
    <div className="embed-config-overlay" onClick={onClose}>
      <div className="embed-config-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="embed-config-header">
          <h2 className="embed-config-title">Global Settings</h2>
          <button className="embed-config-close-btn" onClick={onClose} title="Close">
            <FaTimes size={20} />
          </button>
        </div>

        {/* Font Size */}
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

        {/* Font Family */}
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

        {/* Open embed by default */}
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

        {/* Unify chats */}
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

        {/* Split chat */}
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

        {/* YouTube embed */}
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

        {/* Mention sound */}
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

        {/* Show deleted messages */}
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

        {/* Compact actions */}
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

        {/* Backup / Restore */}
        <div className="embed-config-backup-section">
          <label className="embed-config-backup-label">Backup & Restore</label>
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

        <div className="embed-config-footer">
          <button onClick={onClose} className="embed-config-footer-btn">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
