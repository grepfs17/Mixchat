import React, { useState } from 'react';

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
