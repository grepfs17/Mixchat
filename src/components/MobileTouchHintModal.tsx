import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MdContentCopy, MdMoreVert } from 'react-icons/md';
import { isMobileDevice } from '../lib/device';

const STORAGE_KEY = 'mixchat_mobile_hint_seen';

interface MobileTouchHintModalProps {
  twitchConnected: boolean;
}

export default function MobileTouchHintModal({ twitchConnected }: MobileTouchHintModalProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!twitchConnected) return;
    if (!isMobileDevice()) return;
    if (localStorage.getItem(STORAGE_KEY)) return;
    setVisible(true);
  }, [twitchConnected]);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  }

  if (!visible) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.75)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.2s ease',
      }}
      onClick={dismiss}
    >
      <div
        style={{
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border-medium)',
          borderRadius: 'var(--radius-2xl)',
          padding: '28px 24px 22px',
          maxWidth: '320px',
          width: '100%',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
        onClick={(e) => e.stopPropagation()}
      >

        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: '28px',
              marginBottom: '8px',
              lineHeight: 1,
            }}
          >
            📱
          </div>
          <h2
            style={{
              margin: 0,
              fontSize: '17px',
              fontWeight: 700,
              color: 'var(--color-text-white)',
              letterSpacing: '-0.01em',
            }}
          >
            Mobile Controls
          </h2>
          <p
            style={{
              margin: '6px 0 0',
              fontSize: '13px',
              color: 'var(--color-text-secondary)',
            }}
          >
            Quick gestures for chat messages
          </p>
        </div>


        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <HintRow
            icon={<MdMoreVert size={20} color="var(--color-twitch)" />}
            action="Long press"
            description="a message to open the context menu"
          />
          <HintRow
            icon={<MdContentCopy size={18} color="var(--color-twitch)" />}
            action="Double tap"
            description="a message to copy it"
          />
        </div>

        <button
          onClick={dismiss}
          style={{
            background: 'var(--color-twitch)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius-xl)',
            padding: '11px 0',
            fontSize: '15px',
            fontWeight: 600,
            cursor: 'pointer',
            width: '100%',
            marginTop: '4px',
          }}
        >
          Got it!
        </button>
      </div>
    </div>,
    document.body,
  );
}

interface HintRowProps {
  icon: React.ReactNode;
  action: string;
  description: string;
}

function HintRow({ icon, action, description }: HintRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        background: 'var(--color-bg-tertiary)',
        borderRadius: 'var(--radius-xl)',
        padding: '12px 14px',
      }}
    >
      <div
        style={{
          flexShrink: 0,
          width: '36px',
          height: '36px',
          borderRadius: 'var(--radius-full)',
          background: 'rgba(145,70,255,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </div>
      <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-primary)', lineHeight: '1.4' }}>
        <strong style={{ color: 'var(--color-text-white)', fontWeight: 600 }}>{action}</strong>
        {' '}
        {description}
      </p>
    </div>
  );
}
