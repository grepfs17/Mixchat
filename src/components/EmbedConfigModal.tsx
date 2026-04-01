import { FaTimes } from 'react-icons/fa';
import type { ChatFont } from '../lib/types';
import { FONT_FAMILY_MAP, CHAT_FONT_OPTIONS } from '../lib/types';

interface EmbedConfigModalProps {
  embedDefaultOpen: boolean;
  onEmbedDefaultOpenChange: (value: boolean) => void;
  unifyChatEnabled: boolean;
  onUnifyChatEnabledChange: (value: boolean) => void;
  fontSize: number;
  onFontSizeChange: (value: number) => void;
  chatFont: ChatFont;
  onChatFontChange: (value: ChatFont) => void;
  mentionSoundEnabled: boolean;
  onMentionSoundEnabledChange: (value: boolean) => void;
  onClose: () => void;
}

export default function EmbedConfigModal({
  embedDefaultOpen,
  onEmbedDefaultOpenChange,
  unifyChatEnabled,
  onUnifyChatEnabledChange,
  fontSize,
  onFontSizeChange,
  chatFont,
  onChatFontChange,
  mentionSoundEnabled,
  onMentionSoundEnabledChange,
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
      <div
        style={{
          backgroundColor: '#1a1a1a',
          borderRadius: '8px',
          border: '1px solid #333333',
          padding: '24px',
          maxWidth: '400px',
          width: '90%',
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
