import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface TwitchChannel {
  id: string;
  name: string;
  displayName: string;
  title: string;
  profileImageUrl?: string;
}

interface ChannelSelectorProps {
  channels: TwitchChannel[];
  selectedChannel: string;
  onChannelChange: (channelId: string) => void;
  platform: 'twitch' | 'youtube';
}

export default function ChannelSelector({
  channels,
  selectedChannel,
  onChannelChange,
  platform,
}: ChannelSelectorProps) {
  const [manualChannel, setManualChannel] = useState('');

  if (channels.length === 0) return null;

  const styles = {
    container: {
      padding: '8px',
      background: '#1a1a1a',
      boxShadow: 'none',
    },
    label: {
      fontSize: '0.75rem',
      fontWeight: '600',
      color: '#94a3b8',
      marginBottom: '8px',
      display: 'block',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.5px',
    },
    listContainer: {
      display: 'flex',
      flexWrap: 'wrap' as const,
      gap: '8px',
      marginBottom: '12px',
    },
    channelItem: (isSelected: boolean) => ({
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      cursor: 'pointer',
      padding: '6px',
      borderRadius: '8px',
      border: isSelected ? '2px solid #3b82f6' : '2px solid transparent',
      backgroundColor: isSelected ? '#1e3a5f' : 'transparent',
      transition: 'all 0.2s ease',
      flex: '0 0 auto',
    }),
    profileImage: {
      width: '48px',
      height: '48px',
      borderRadius: '50%',
      objectFit: 'cover' as const,
      marginBottom: '4px',
      border: '2px solid #333333',
    },
    channelName: {
      fontSize: '0.75rem',
      color: '#e2e8f0',
      textAlign: 'center' as const,
      maxWidth: '60px',
      overflow: 'hidden' as const,
      textOverflow: 'ellipsis' as const,
      whiteSpace: 'nowrap' as const,
    },
  };

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; channel: TwitchChannel } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onAnyClick = () => setContextMenu(null);
    if (contextMenu) {
      window.addEventListener('click', onAnyClick);
      window.addEventListener('contextmenu', onAnyClick);
    }
    return () => {
      window.removeEventListener('click', onAnyClick);
      window.removeEventListener('contextmenu', onAnyClick);
    };
  }, [contextMenu]);

  const openContextMenuAt = (x: number, y: number, channel: TwitchChannel) => {
    setContextMenu({ x, y, channel });
  };

  const handleTouchStart = (channel: TwitchChannel, e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    const x = touch.clientX;
    const y = touch.clientY;
    if (longPressTimer.current) clearTimeout(longPressTimer.current as any);
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      openContextMenuAt(x, y, channel);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current as any);
      longPressTimer.current = null;
    }
  };

  const handleTouchMove = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current as any);
      longPressTimer.current = null;
    }
  };

  const handleManualJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualChannel.trim()) {
      onChannelChange(manualChannel.trim().toLowerCase());
      setManualChannel('');
    }
  };

  return (
    <div style={styles.container as React.CSSProperties}>
      <label style={styles.label}>
        {platform === 'twitch' ? '📺 Channels' : '▶ Streams'}
      </label>

      <div style={styles.listContainer as React.CSSProperties}>
        {channels.map((channel) => (
          <div
            key={channel.id}
            style={styles.channelItem(selectedChannel === channel.id) as React.CSSProperties}
            onClick={() => onChannelChange(channel.id)}
            title={channel.displayName}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openContextMenuAt(e.clientX, e.clientY, channel);
            }}
            onTouchStart={(e) => handleTouchStart(channel, e)}
            onTouchEnd={handleTouchEnd}
            onTouchMove={handleTouchMove}
          >
            {channel.profileImageUrl && (
              <img
                src={channel.profileImageUrl}
                alt={channel.displayName}
                style={styles.profileImage as React.CSSProperties}
              />
            )}
            <span style={styles.channelName as React.CSSProperties}>
              {channel.displayName}
            </span>
          </div>
        ))}
      </div>

      {contextMenu && createPortal(
        <div
          className="context-menu channel-context-menu"
          onContextMenu={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 9999 }}
        >
          <div className="context-menu-header">{contextMenu.channel.displayName}</div>
          <button onClick={() => { onChannelChange(contextMenu.channel.id); setContextMenu(null); }}>Join</button>
          <button onClick={() => { window.open(platform === 'twitch' ? `https://twitch.tv/${contextMenu?.channel.name}` : `https://youtube.com/${contextMenu?.channel.name}`, '_blank'); setContextMenu(null); }}>Open in {platform === 'twitch' ? 'Twitch' : 'YouTube'}</button>
          <button onClick={() => { const text = contextMenu?.channel.name || ''; if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {}); setContextMenu(null); }}>Copy name</button>
        </div>,
        document.body,
      )}

      <div style={{ marginTop: '12px' }}>
        <label style={styles.label}>Or join manually</label>
        <form onSubmit={handleManualJoin} style={{ display: 'flex', gap: '3px' }}>
          <input
            type="text"
            value={manualChannel}
            onChange={(e) => setManualChannel(e.target.value)}
            placeholder="Enter channel name"
            style={{
              flex: 1,
              padding: '6px',
              border: '1px solid #333333',
              fontSize: '0.85rem',
              backgroundColor: '#0a0a0a',
              color: '#e2e8f0',
              minWidth: '0',
            }}
          />
          <button
            type="submit"
            disabled={!manualChannel.trim()}
            style={{
              padding: '6px 8px',
              border: 'none',
              fontSize: '0.85rem',
              cursor: manualChannel.trim() ? 'pointer' : 'not-allowed',
              backgroundColor: manualChannel.trim() ? '#555555' : '#333333',
              color: '#e2e8f0',
              flexShrink: 0,
            }}
          >
            Join
          </button>
        </form>
      </div>
    </div>
  );
}
