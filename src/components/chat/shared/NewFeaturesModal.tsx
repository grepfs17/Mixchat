import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MdLogout } from 'react-icons/md';
import { GiCrossedSwords } from 'react-icons/gi';

const STORAGE_KEY = 'mixchat_new_features_seen_v1';

export default function NewFeaturesModal() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        try {
            if (localStorage.getItem(STORAGE_KEY)) return;
            setVisible(true);
        } catch (e) {
            // If localStorage is inaccessible, silently fail safe.
            console.warn('NewFeaturesModal localStorage check failed', e);
        }
    }, []);

    function dismiss() {
        try {
            localStorage.setItem(STORAGE_KEY, '1');
        } catch (_) { }
        setVisible(false);
    }

    function logoutAndReload() {
        try {
            localStorage.removeItem('mixchat_sessions');
        } catch (_) { }
        // Mark as seen so it doesn't immediately reappear after reload
        try { localStorage.setItem(STORAGE_KEY, '1'); } catch (_) { }
        window.location.reload();
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
                    padding: '24px',
                    maxWidth: '420px',
                    width: '100%',
                    boxShadow: 'var(--shadow-lg)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '18px',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div style={{ fontSize: '28px' }}>📢</div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: 'var(--color-text-white)' }}>What's new</h2>
                        <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                            New version 0.9.0 Beta
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <div style={{ flexShrink: 0, width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(145,70,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <GiCrossedSwords size={20} color="var(--color-accent)" />
                        </div>
                        <div>
                            <strong style={{ color: 'var(--color-text-white)', fontWeight: 700 }}>Moderator Mode</strong>
                            <div style={{ fontSize: '13px', color: 'var(--color-text-primary)', marginTop: '6px' }}>
                                Moderation tools have been added. Moderators can now manage chat from the app. <br/> You will find a new icon next to the Reload Emotes.</div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <div style={{ flexShrink: 0, width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(0,120,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <MdLogout size={18} color="var(--color-text-white)" />
                        </div>
                        <div>
                            <strong style={{ color: 'var(--color-text-white)', fontWeight: 700 }}> ⚠️ Please relogin</strong>
                            <div style={{ fontSize: '13px', color: 'var(--color-text-primary)', marginTop: '6px' }}>To enable moderator features and updated permissions, please log out and sign in again.</div>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                        onClick={logoutAndReload}
                        style={{ background: 'var(--color-accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-xl)', padding: '10px 12px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', flex: 1 }}
                    >
                        Log out & relogin
                    </button>
                    <button
                        onClick={dismiss}
                        style={{ background: 'transparent', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-medium)', borderRadius: 'var(--radius-xl)', padding: '10px 12px', fontSize: '14px', cursor: 'pointer' }}
                    >
                        Dismiss
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
