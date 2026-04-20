import { FaTimes } from 'react-icons/fa';
import type { ChatFont } from '../lib/types';
import { FONT_FAMILY_MAP, CHAT_FONT_OPTIONS } from '../lib/types';
import { playMentionSoundPreview, MENTION_SOUND_OPTIONS, type MentionSoundType } from '../hooks/useTwitchChat';

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
  // New prop: compact actions
  compactActions,
  onCompactActionsChange,
  onClose,
}: EmbedConfigModalProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: '0',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: '1000',
      }}
      onClick={onClose}
    >
      <div className="embed-config-modal-content"
        style={{
          backgroundColor: '#1a1a1a',
          borderRadius: '8px',
          border: '1px solid #333333',
          padding: '24px',
          maxWidth: '400px',
          width: '90%',
          maxHeight: '90svh',
          overflowY: 'auto',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.8)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
          }}
        >
          <h2
            style={{
              margin: 0,
              color: '#e2e8f0',
              fontSize: '18px',
              fontWeight: '600',
            }}
          >
            Global Settings
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#999',
              cursor: 'pointer',
              padding: '0',
              display: 'flex',
              alignItems: 'center',
              lineHeight: '1',
            }}
            title="Close"
          >
            <FaTimes size={20} />
          </button>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '12px',
              color: '#e2e8f0',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            Chat Font Size: <span style={{ color: '#6366f1', marginLeft: '4px' }}>{fontSize}px</span>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>12px</span>
            <input
              type="range"
              min="12"
              max="32"
              step="1"
              value={fontSize}
              onChange={(e) => onFontSizeChange(parseInt(e.target.value))}
              style={{
                flex: 1,
                cursor: 'pointer',
                accentColor: '#6366f1',
                height: '4px',
              }}
            />
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>32px</span>
          </div>
          <p
            style={{
              marginTop: '8px',
              color: '#94a3b8',
              fontSize: '12px',
            }}
          >
            Adjust the size of the text in the chat window.
          </p>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '12px',
              color: '#e2e8f0',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            Chat Font
          </label>
          <select
            value={chatFont}
            onChange={(e) => onChatFontChange(e.target.value as ChatFont)}
            style={{
              width: '100%',
              padding: '8px 12px',
              backgroundColor: '#0a0a0a',
              border: '1px solid #333333',
              borderRadius: '6px',
              color: '#e2e8f0',
              fontSize: '14px',
              fontFamily: FONT_FAMILY_MAP[chatFont],
              cursor: 'pointer',
            }}
          >
            {CHAT_FONT_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value} style={{ fontFamily: FONT_FAMILY_MAP[value] }}>
                {label}
              </option>
            ))}
          </select>
          <p
            style={{
              marginTop: '8px',
              color: '#94a3b8',
              fontSize: '12px',
            }}
          >
            Choose the font used in the chat window.
          </p>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              cursor: 'pointer',
              color: '#e2e8f0',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={embedDefaultOpen}
              onChange={(e) => onEmbedDefaultOpenChange(e.target.checked)}
              style={{
                width: '18px',
                height: '18px',
                cursor: 'pointer',
                accentColor: '#6366f1',
              }}
            />
            <span style={{ fontSize: '14px' }}>
              Open stream embed by default
            </span>
          </label>
          <p
            style={{
              marginTop: '8px',
              color: '#94a3b8',
              fontSize: '12px',
              margin: '8px 0 0 30px',
            }}
          >
            If enabled, the stream embed will be visible when you open Mixchat. If disabled, the chat will take up the full width.
          </p>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              cursor: 'pointer',
              color: '#e2e8f0',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={unifyChatEnabled}
              onChange={(e) => onUnifyChatEnabledChange(e.target.checked)}
              style={{
                width: '18px',
                height: '18px',
                cursor: 'pointer',
                accentColor: '#6366f1',
              }}
            />
            <span style={{ fontSize: '14px' }}>
              Unify chats
            </span>
          </label>
          <p
            style={{
              marginTop: '8px',
              color: '#94a3b8',
              fontSize: '12px',
              margin: '8px 0 0 30px',
            }}
          >
            When enabled, Twitch and YouTube messages appear together in a single chronological feed. Each platform keeps its own styling and features.
          </p>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              cursor: 'pointer',
              color: '#e2e8f0',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={useYoutubeEmbed}
              onChange={(e) => onUseYoutubeEmbedChange(e.target.checked)}
              style={{
                width: '18px',
                height: '18px',
                cursor: 'pointer',
                accentColor: '#6366f1',
              }}
            />
            <span style={{ fontSize: '14px' }}>
              Use official YouTube chat embed
            </span>
          </label>
          <p
            style={{
              marginTop: '8px',
              color: '#94a3b8',
              fontSize: '12px',
              margin: '8px 0 0 30px',
            }}
          >
            Replaces the custom YouTube chat with the official iframe embed. Note: This disables some features like custom emotes and unified chat for YouTube.
          </p>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              cursor: 'pointer',
              color: '#e2e8f0',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={mentionSoundEnabled}
              onChange={(e) => onMentionSoundEnabledChange(e.target.checked)}
              style={{
                width: '18px',
                height: '18px',
                cursor: 'pointer',
                accentColor: '#6366f1',
              }}
            />
            <span style={{ fontSize: '14px' }}>
              Play sound on mention
            </span>
          </label>
          <p
            style={{
              marginTop: '8px',
              color: '#94a3b8',
              fontSize: '12px',
              margin: '8px 0 0 30px',
            }}
          >
            Plays a notification sound when someone mentions your name or replies to your message.
          </p>

          {mentionSoundEnabled && (
            <div style={{ marginLeft: '30px', marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Volume */}
              <div>
                <label style={{ color: '#e2e8f0', fontSize: '13px', display: 'block', marginBottom: '6px' }}>
                  Volume: <span style={{ color: '#6366f1' }}>{Math.round(mentionVolume * 100)}%</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>0%</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={mentionVolume}
                    onChange={(e) => onMentionVolumeChange(parseFloat(e.target.value))}
                    style={{ flex: 1, cursor: 'pointer', accentColor: '#6366f1', height: '4px' }}
                  />
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>100%</span>
                </div>
              </div>

              {/* Sound type */}
              <div>
                <label style={{ color: '#e2e8f0', fontSize: '13px', display: 'block', marginBottom: '8px' }}>
                  Sound
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {MENTION_SOUND_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        onMentionSoundTypeChange(opt.value);
                        playMentionSoundPreview(mentionVolume, opt.value);
                      }}
                      style={{
                        padding: '5px 12px',
                        border: mentionSoundType === opt.value ? '2px solid #6366f1' : '1px solid #444',
                        borderRadius: '6px',
                        backgroundColor: mentionSoundType === opt.value ? '#1e1e3f' : '#0a0a0a',
                        color: '#e2e8f0',
                        fontSize: '13px',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: '11px' }}>
                  Click a sound to preview it.
                </p>
              </div>
            </div>
          )}
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              cursor: 'pointer',
              color: '#e2e8f0',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={showDeletedMessages}
              onChange={(e) => onShowDeletedMessagesChange(e.target.checked)}
              style={{
                width: '18px',
                height: '18px',
                cursor: 'pointer',
                accentColor: '#6366f1',
              }}
            />
            <span style={{ fontSize: '14px' }}>
              Show deleted messages
            </span>
          </label>
          <p
            style={{
              marginTop: '8px',
              color: '#94a3b8',
              fontSize: '12px',
              margin: '8px 0 0 30px',
            }}
          >
            When enabled, messages deleted by a moderator remain visible but are dimmed and marked as deleted. When disabled, they are removed from chat.
          </p>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              cursor: 'pointer',
              color: '#e2e8f0',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={compactActions}
              onChange={(e) => onCompactActionsChange(e.target.checked)}
              style={{
                width: '18px',
                height: '18px',
                cursor: 'pointer',
                accentColor: '#6366f1',
              }}
            />
            <span style={{ fontSize: '14px' }}>
              Hide inline action buttons
            </span>
          </label>
          <p
            style={{
              marginTop: '8px',
              color: '#94a3b8',
              fontSize: '12px',
              margin: '8px 0 0 30px',
            }}
          >
            When enabled, the small reply/copy/mod buttons are hidden from each message and . You can still access all actions by right-clicking (long press on mobile) a message to open the context menu.
          </p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              border: '1px solid #333333',
              backgroundColor: '#0a0a0a',
              color: '#e2e8f0',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#1a1a1a';
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#555555';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#0a0a0a';
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#333333';
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
