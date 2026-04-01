import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import ChatDisplay from './ChatDisplay';
import MessageInput from './MessageInput';
import Notification from './Notification';
import YouTubeChat, { type YouTubeEmote } from './YouTubeChat';
import YouTubeMessageInput from './YouTubeMessageInput';
import UnifiedChat, { type YTMessage } from './UnifiedChat';
import { useTwitchChat } from '../hooks/useTwitchChat';
import { initializeEmotes, clearEmoteCache } from '../lib/emotes';
import { initializeBadges, clearBadgeCache } from '../lib/badges';
import { getStreamStatus, getRecentMessages } from '../lib/twitch';
import type { ChatMessage, Platform, PlatformSession } from '../lib/types';

const MAX_DISPLAYED_MESSAGES = 150;
const STREAM_STATUS_POLL_INTERVAL = 60000;
const UPTIME_UPDATE_INTERVAL = 1000;

/** Formats a stream start time into a human-readable uptime string. */
function calculateUptime(startedAt: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - startedAt.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffDay > 0) return `${diffDay}d ${diffHour % 24}h ${diffMin % 60}m`;
  if (diffHour > 0) return `${diffHour}h ${diffMin % 60}m ${diffSec % 60}s`;
  if (diffMin > 0) return `${diffMin}m ${diffSec % 60}s`;
  return `${diffSec}s`;
}

interface ChatAppProps {
  twitchConnected: boolean;
  selectedTwitchChannel?: string;
  selectedTwitchChannelName?: string;
  selectedTwitchChannelDisplayName?: string;
  twitchSession?: PlatformSession;
  onToggleSidebar?: () => void;
  sidebarVisible?: boolean;
  showStreamEmbed?: boolean;
  onToggleStreamEmbed?: () => void;
  viewerCount?: number | null;
  linkedYoutubeUrl?: string;
  /** Full YouTube session (may exist while accessToken is still being refreshed) */
  youtubeSession?: PlatformSession;
  unifyChatEnabled?: boolean;
  fontSize?: number;
  mentionSoundEnabled?: boolean;
}

export default function ChatApp({
  twitchConnected,
  selectedTwitchChannel = '',
  selectedTwitchChannelName = '',
  selectedTwitchChannelDisplayName = '',
  twitchSession,
  onToggleSidebar,
  sidebarVisible = true,
  showStreamEmbed = true,
  onToggleStreamEmbed,
  viewerCount,
  linkedYoutubeUrl,
  youtubeSession: _youtubeSession,
  unifyChatEnabled = false,
  fontSize = 14,
  mentionSoundEnabled = true,
}: ChatAppProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshingEmotes, setIsRefreshingEmotes] = useState(false);
  const [selectedPlatforms, _setSelectedPlatforms] = useState<Platform[]>([]);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | undefined>();
  const [streamIsLive, setStreamIsLive] = useState(false);
  const [streamUptime, setStreamUptime] = useState<string>('');
  const [showPreloadedMessages, _setShowPreloadedMessages] = useState(true);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info'; id?: number } | null>(null);
  const notificationIdRef = React.useRef(0);
  const preloadedMessagesRef = useRef<Set<string>>(new Set());
  // Cache the current user's own badge data so optimistic messages can show badges
  const currentUserBadgesRef = useRef<{ badges: Record<string, string>; badgeDetails: Record<string, { url: string; title: string }> }>({ badges: {}, badgeDetails: {} });
  const streamStartedAtRef = useRef<Date | null>(null);
  const [manualVideoId, setManualVideoId] = useState<string>('');
  const [autoVideoId, setAutoVideoId] = useState<string | null>(null);
  const [ytLoading, setYtLoading] = useState(false);
  const [ytError, setYtError] = useState<string | null>(null);
  const [showYoutubeSection, setShowYoutubeSection] = useState(true);

  // Collected YouTube messages for unified mode
  const [ytMessages, setYtMessages] = useState<YTMessage[]>([]);

  // Emote registry shared between YouTubeChat (discovery) and YouTubeMessageInput (autocomplete)
  const ytEmoteRegistryRef = useRef<Map<string, YouTubeEmote>>(new Map());

  // Effective video ID: manual override > auto-detected > static URL parse
  const youtubeVideoId = useMemo(() => {
    if (manualVideoId) return manualVideoId;
    if (autoVideoId) return autoVideoId;
    if (!linkedYoutubeUrl) return null;

    // Try to extract from standard video URL (not channel URLs)
    let videoId = null;
    try {
      if (linkedYoutubeUrl.includes('v=')) {
        videoId = new URLSearchParams(new URL(linkedYoutubeUrl).search).get('v');
      } else if (linkedYoutubeUrl.includes('youtu.be/')) {
        videoId = linkedYoutubeUrl.split('youtu.be/')[1].split('?')[0];
      } else if (linkedYoutubeUrl.includes('/live/')) {
        videoId = linkedYoutubeUrl.split('/live/')[1].split('?')[0];
      }
    } catch (e) {
      console.warn('Failed to parse YouTube URL:', e);
    }
    return videoId;
  }, [linkedYoutubeUrl, manualVideoId, autoVideoId]);

  // Auto-fetch live video ID from the YouTube API when a channel URL is linked
  useEffect(() => {
    if (!linkedYoutubeUrl) {
      setAutoVideoId(null);
      setYtError(null);
      return;
    }

    // Skip API call if the URL is already a direct video link
    if (linkedYoutubeUrl.includes('v=') || linkedYoutubeUrl.includes('youtu.be/') || linkedYoutubeUrl.includes('/live/')) {
      return;
    }

    let cancelled = false;
    const fetchLiveVideoId = async () => {
      setYtLoading(true);
      setYtError(null);
      // Do not clear `autoVideoId` here — clearing before the fetch causes
      // the YouTube iframe to unmount and remount every poll. Only update
      // `autoVideoId` after we receive a result, and only if it changed.
      try {
        const params = new URLSearchParams();
        params.append('channelUrl', linkedYoutubeUrl);
        
        const res = await fetch(`/api/youtube-live?${params.toString()}`);

        const data = await res.json();
        if (cancelled) return;

        if (res.ok && data.videoId) {
          setAutoVideoId((prev) => (prev !== data.videoId ? data.videoId : prev));
          setYtError(null);
        } else {
          // If we got a 200 but videoId is null, it's just not live.
          // Don't treat it as a hard error unless it's a non-200.
          if (!res.ok) {
            setYtError(data.error || 'Failed to check for live stream');
          } else {
            setYtError('No live stream found');
            setAutoVideoId(null);
          }
        }

      } catch (err) {
        if (!cancelled) {
          setYtError('Failed to check for live stream');
          console.error('YouTube live fetch error:', err);
        }
      } finally {
        if (!cancelled) setYtLoading(false);
      }
    };

    fetchLiveVideoId();

    // Re-check periodically in case the stream starts later (reduced frequency)
    const interval = setInterval(fetchLiveVideoId, 600000); // 10 minutes

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [linkedYoutubeUrl]);

  // Reset manual video ID when channel changes
  useEffect(() => {
    setManualVideoId('');
    setAutoVideoId(null);
    setYtError(null);
    setShowYoutubeSection(true);
    setYtMessages([]);
  }, [selectedTwitchChannel]);

  // Merge newly discovered emotes into the registry
  const handleYtEmotesDiscovered = useCallback((emotes: YouTubeEmote[]) => {
    for (const e of emotes) {
      ytEmoteRegistryRef.current.set(e.name, e);
    }
    // No re-render needed — registry is a ref, autocomplete reads it on keystroke
  }, []);

  // Update document title with channel name
  useEffect(() => {
    if (selectedTwitchChannelDisplayName) {
      document.title = `Mixchat - ${selectedTwitchChannelDisplayName}`;
    } else {
      document.title = 'Mixchat - Multi-Platform Live Chat';
    }
  }, [selectedTwitchChannelDisplayName]);

  // Handle incoming messages from Twitch chat
  const handleTwitchMessage = useCallback((message: ChatMessage) => {
    // Cache the current user's badge data from real (non-optimistic) messages so
    // subsequent optimistic placeholders can display the correct badges immediately.
    if (message.isCurrentUser && !message.optimistic) {
      const hasBadges =
        (message.badgeDetails && Object.keys(message.badgeDetails).length > 0) ||
        (message.badges && Object.keys(message.badges).length > 0);
      if (hasBadges) {
        currentUserBadgesRef.current = {
          badges: message.badges || {},
          badgeDetails: message.badgeDetails || {},
        };
      }
    }

    setMessages((prev) => {
      // Prevent duplicate messages by ID
      if (prev.some((m) => m.id === message.id)) {
        return prev;
      }

      // Only attempt to reconcile optimistic placeholders for messages
      // that likely belong to the current session user.
      const sessionName = (twitchSession?.displayName || twitchSession?.username || '').toLowerCase();
      const isFromSession = Boolean(
        message.isCurrentUser ||
        (message.userId && message.userId === twitchSession?.userId) ||
        (message.author && sessionName && message.author.toLowerCase() === sessionName)
      );

      const normalize = (s?: string) => (s || '').normalize('NFKC').trim().toLowerCase();
      const serverNorm = normalize(message.content);

      if (isFromSession) {
        // Try matching optimistic placeholder by several heuristics.
        let matchIndex = -1;

        // 1) Exact userId + content + same reply target
        if (message.userId) {
          matchIndex = prev.findIndex((m) =>
            m.optimistic &&
            m.userId === message.userId &&
            normalize(m.content) === serverNorm &&
            ((m.replyTo?.id || '') === (message.replyTo?.id || ''))
          );
        }

        // 2) Author name match + content + reply target
        if (matchIndex === -1 && message.author) {
          matchIndex = prev.findIndex((m) =>
            m.optimistic &&
            m.author &&
            m.author.toLowerCase() === message.author.toLowerCase() &&
            normalize(m.content) === serverNorm &&
            ((m.replyTo?.id || '') === (message.replyTo?.id || ''))
          );
        }

        // 3) Timestamp proximity (within 10s) + content
        if (matchIndex === -1) {
          const serverTs = message.timestamp ? new Date(message.timestamp).getTime() : Date.now();
          matchIndex = prev.findIndex((m) =>
            m.optimistic &&
            Math.abs((m.timestamp?.getTime() || 0) - serverTs) < 10000 &&
            normalize(m.content) === serverNorm &&
            ((m.replyTo?.id || '') === (message.replyTo?.id || ''))
          );
        }

        if (matchIndex !== -1) {
          const copy = [...prev];
          copy[matchIndex] = message;
          return copy.length > MAX_DISPLAYED_MESSAGES ? copy.slice(-MAX_DISPLAYED_MESSAGES) : copy;
        }
      }

      const updated = [...prev, message];
      return updated.length > MAX_DISPLAYED_MESSAGES ? updated.slice(-MAX_DISPLAYED_MESSAGES) : updated;
    });
  }, [twitchSession]);

  // Use Twitch chat hook - pass the channel NAME not ID
  const [badgesReady, setBadgesReady] = useState(false);
  const { sendMessage: sendTwitchMessage } =
    useTwitchChat(
      selectedTwitchChannelName, // Use the channel name (login), not the ID
      twitchSession?.accessToken || '',
      twitchSession?.username || twitchSession?.displayName || '', // Use login (username) for chat
      handleTwitchMessage,
      badgesReady,
      mentionSoundEnabled
    );

  // Simulate loading chat messages from selected channel
  useEffect(() => {
    // Reset badge cache and readiness when channel changes
    clearBadgeCache();
    setBadgesReady(false);
    if (selectedTwitchChannelName && selectedTwitchChannel) {
      // Clear messages when channel changes
      setMessages([]);
      preloadedMessagesRef.current.clear();

      // Load recent messages from RecentMessages API
      const loadRecentMessages = async (): Promise<ChatMessage[]> => {
        try {
          const recentMessages = await getRecentMessages(selectedTwitchChannelName);

          // Mark these as preloaded messages so we can track them
          recentMessages.forEach(msg => preloadedMessagesRef.current.add(msg.id));

          // Only add to display if preloaded messages are enabled
          if (showPreloadedMessages) {
            // Ensure unique messages by filtering by ID
            const uniqueRecent = recentMessages.filter((msg, index, self) =>
              index === self.findIndex((t) => t.id === msg.id)
            );
            setMessages(uniqueRecent);
          }
          return recentMessages;
        } catch (error) {
          console.error('Failed to load recent messages:', error);
          return [];
        }
      };

      // Initialize emotes and badges first, then load recent messages to ensure
      // badges are ready for the initial historical messages.
      const initializeAssets = async () => {
        try {
          await Promise.all([
            initializeEmotes(
              selectedTwitchChannel,
              selectedTwitchChannelName,
              twitchSession?.userId
            ),
            initializeBadges(
              selectedTwitchChannel,
              twitchSession?.accessToken || '',
              import.meta.env.PUBLIC_TWITCH_CLIENT_ID
            ),
          ]);
          setBadgesReady(true);
          const recentMessages = await loadRecentMessages();

          // Seed the current user's badge cache from historical messages so that
          // optimistic placeholders show the correct badges immediately, even
          // before the first real server echo has been received this session.
          if (twitchSession?.userId && recentMessages.length > 0) {
            const ownMessage = [...recentMessages].reverse().find(
              (msg) => msg.userId === twitchSession!.userId
            );
            if (ownMessage) {
              const hasBadges =
                (ownMessage.badgeDetails && Object.keys(ownMessage.badgeDetails).length > 0) ||
                (ownMessage.badges && Object.keys(ownMessage.badges).length > 0);
              if (hasBadges) {
                currentUserBadgesRef.current = {
                  badges: ownMessage.badges || {},
                  badgeDetails: ownMessage.badgeDetails || {},
                };
              }
            }
          }
        } catch (err) {
          console.error('Failed to initialize chat assets:', err);
        }
      };

      initializeAssets();
    }
  }, [selectedTwitchChannelName, selectedTwitchChannel, twitchSession?.userId]);

  // Fetch stream status on channel change or when component mounts
  useEffect(() => {
    const fetchStreamStatus = async () => {
      if (selectedTwitchChannel && twitchSession) {
        try {
          const status = await getStreamStatus(
            twitchSession.accessToken,
            import.meta.env.PUBLIC_TWITCH_CLIENT_ID,
            selectedTwitchChannel
          );
          if (status) {
            setStreamIsLive(status.isLive);
            if (status.isLive && status.startedAt) {
              streamStartedAtRef.current = status.startedAt;
              setStreamUptime(calculateUptime(status.startedAt));
            } else {
              streamStartedAtRef.current = null;
              setStreamUptime('');
            }
          }
        } catch (error) {
          console.error('Failed to fetch stream status:', error);
        }
      }
    };

    fetchStreamStatus();

    const statusInterval = setInterval(fetchStreamStatus, STREAM_STATUS_POLL_INTERVAL);
    // Update the uptime display every second using the locally-cached startedAt.
    // This avoids making an API call every second — the status poll above already
    // refreshes startedAt at STREAM_STATUS_POLL_INTERVAL.
    const uptimeInterval = setInterval(() => {
      if (streamStartedAtRef.current) {
        setStreamUptime(calculateUptime(streamStartedAtRef.current));
      }
    }, UPTIME_UPDATE_INTERVAL);

    return () => {
      clearInterval(statusInterval);
      clearInterval(uptimeInterval);
    };
  }, [selectedTwitchChannel, twitchSession]);

  const handleSendMessage = useCallback(
    async (message: string, platforms: Platform[], _replyToId?: string) => {
      if (!message.trim() || platforms.length === 0) return;

      setIsLoading(true);
      try {
        // Send to Twitch if selected
        if (platforms.includes('twitch') && selectedTwitchChannel && twitchSession) {
          // Add an optimistic message so replies show immediately. When the
          // server echoes the message back the display will replace it.
          const optimisticId = `optimistic_${Date.now()}_${Math.random()}`;
          const optimisticMessage: ChatMessage = {
            id: optimisticId,
            platform: 'twitch',
            author: twitchSession.displayName || twitchSession.username || 'You',
            content: message,
            timestamp: new Date(),
            userId: twitchSession.userId,
            authorColor: '#FFFFFF',
            authorAvatar: twitchSession.profileImageUrl,
            replyTo: replyingTo ? {
              id: replyingTo.id,
              author: replyingTo.author,
              content: replyingTo.content,
            } : undefined,
            mentionsUser: false,
            emotes: {},
            isBot: false,
            badges: currentUserBadgesRef.current.badges,
            badgeDetails: currentUserBadgesRef.current.badgeDetails,
            isCurrentUser: true,
            optimistic: true,
          };

          setMessages((prev) => [...prev, optimisticMessage]);

          try {
            await sendTwitchMessage(message, replyingTo?.id);
          } catch (error) {
            console.error('Failed to send Twitch message:', error);
            // Remove optimistic message on failure
            setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
            notificationIdRef.current += 1;
            setNotification({ message: 'Failed to send message', type: 'error', id: notificationIdRef.current });
          }

          setReplyingTo(undefined);
        }
      } catch (error) {
        console.error('Failed to send message:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [selectedTwitchChannel, sendTwitchMessage, twitchSession, replyingTo]
  );

  const handleRefreshEmotes = useCallback(async () => {
    console.log('User initiated emote reload');
    setIsRefreshingEmotes(true);
    try {
      clearEmoteCache();
      await initializeEmotes(
        selectedTwitchChannel,
        selectedTwitchChannelName,
        twitchSession?.userId
      );
      notificationIdRef.current += 1;
      setNotification({ message: 'Emotes reloaded successfully!', type: 'success', id: notificationIdRef.current });
    } catch (err) {
      console.error('Failed to reinitialize emotes:', err);
      notificationIdRef.current += 1;
      setNotification({ message: '❌ Failed to reload emotes', type: 'error', id: notificationIdRef.current });
    } finally {
      setIsRefreshingEmotes(false);
    }
  }, [selectedTwitchChannel, selectedTwitchChannelName, twitchSession?.userId]);

  // Callback to receive YouTube messages in unified mode
  const handleYtMessages = useCallback((msgs: import('./UnifiedChat').YTMessage[]) => {
    setYtMessages(msgs);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}

      {/* UNIFIED CHAT MODE */}
      {unifyChatEnabled ? (
        <>
          {/* Hidden YouTubeChat to keep polling YouTube messages */}
          {linkedYoutubeUrl && youtubeVideoId && (
            <div style={{ display: 'none' }} aria-hidden="true">
              <YouTubeChat
                videoId={youtubeVideoId}
                onEmotesDiscovered={handleYtEmotesDiscovered}
                onMessages={handleYtMessages}
                fontSize={fontSize}
              />
            </div>
          )}

          {/* Twitch ChatDisplay header + unified messages body */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <ChatDisplay
              messages={messages}
              isLoading={isLoading}
              selectedPlatforms={selectedPlatforms}
              onReply={(message) => setReplyingTo(message)}
              channelName={selectedTwitchChannelName}
              channelDisplayName={selectedTwitchChannelDisplayName}
              streamTitle=''
              isStreamLive={streamIsLive}
              streamUptime={streamUptime}
              viewerCount={viewerCount}
              onRefreshEmotes={handleRefreshEmotes}
              isRefreshingEmotes={isRefreshingEmotes}
              onToggleSidebar={onToggleSidebar}
              sidebarVisible={sidebarVisible}
              onCopyMessage={() => {
                notificationIdRef.current += 1;
                setNotification({ message: 'Message copied!', type: 'success', id: notificationIdRef.current });
              }}
              showStreamEmbed={showStreamEmbed}
              onToggleStreamEmbed={onToggleStreamEmbed}
              currentUserDisplayName={twitchSession?.displayName}
              fontSize={fontSize}
              /* Override messages area with UnifiedChat */
              unifiedChatSlot={
                <UnifiedChat
                  twitchMessages={messages}
                  ytMessages={ytMessages}
                  onReply={setReplyingTo}
                  onCopyMessage={() => {
                    notificationIdRef.current += 1;
                    setNotification({ message: 'Message copied!', type: 'success', id: notificationIdRef.current });
                  }}
                  currentUserDisplayName={twitchSession?.displayName}
                  fontSize={fontSize}
                />
              }
            />
          </div>

          {/* Twitch message input */}
          <MessageInput
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
            isConnected={{ twitch: twitchConnected }}
            replyingTo={replyingTo}
            onCancelReply={() => setReplyingTo(undefined)}
            chatMessages={messages}
            currentUsername={twitchSession?.username || ''}
          />

          {/* YouTube message input (when we have a live video) */}
          {linkedYoutubeUrl && youtubeVideoId && (
            <div style={{ borderTop: '1px solid #333' }}>
              <YouTubeMessageInput
                youtubeVideoId={youtubeVideoId}
                emoteRegistry={ytEmoteRegistryRef}
                onError={(msg) => {
                  notificationIdRef.current += 1;
                  setNotification({ message: msg, type: 'error', id: notificationIdRef.current });
                }}
              />
            </div>
          )}
        </>
      ) : (
        <>
          {/* NORMAL SPLIT MODE */}

          {linkedYoutubeUrl && showYoutubeSection && (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderBottom: '2px solid #333' }}>
              {youtubeVideoId ? (
                <>
                  <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                    <YouTubeChat
                      videoId={youtubeVideoId}
                      onEmotesDiscovered={handleYtEmotesDiscovered}
                      fontSize={fontSize}
                    />
                    <div style={{ position: 'absolute', top: '4px', right: '4px', display: 'flex', gap: '4px' }}>
                      <button
                        onClick={() => { setManualVideoId(''); setAutoVideoId(null); }}
                        style={{ background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '4px', padding: '2px 6px', fontSize: '10px', cursor: 'pointer' }}
                      >
                        Change Video
                      </button>
                      <button
                        onClick={() => setShowYoutubeSection(false)}
                        style={{ background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '4px', padding: '2px 6px', fontSize: '10px', cursor: 'pointer' }}
                        title="Hide YouTube chat"
                      >
                        Remove Chat
                      </button>
                    </div>
                  </div>
                  {/* YouTube message input */}
                  <YouTubeMessageInput
                    youtubeVideoId={youtubeVideoId}
                    emoteRegistry={ytEmoteRegistryRef}
                    onError={(msg) => {
                      notificationIdRef.current += 1;
                      setNotification({ message: msg, type: 'error', id: notificationIdRef.current });
                    }}
                  />
                </>
              ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f0f0f', padding: '20px', gap: '10px' }}>
                  {ytLoading ? (
                    <p style={{ color: '#aaa', fontSize: '13px', textAlign: 'center' }}>
                      🔍 Looking for live stream on YouTube…
                    </p>
                  ) : (
                    <>
                      <p style={{ color: '#aaa', fontSize: '13px', textAlign: 'center' }}>
                        YouTube linked: {linkedYoutubeUrl}<br />
                        {ytError ? (
                          <span style={{ color: '#f87171' }}>{ytError}. You can enter a video ID manually:</span>
                        ) : (
                          <span>No live stream detected. Enter a video ID manually:</span>
                        )}
                      </p>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="text"
                          placeholder="e.g. zFQFquAw74o or full URL"
                          className="channel-search"
                          style={{ padding: '6px 10px', fontSize: '13px', width: '220px', backgroundColor: '#222', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const val = e.currentTarget.value;
                              let vid = val;
                              if (val.includes('v=')) vid = new URLSearchParams(new URL(val).search).get('v') || val;
                              else if (val.includes('youtu.be/')) vid = val.split('youtu.be/')[1].split('?')[0];
                              else if (val.includes('/live/')) vid = val.split('/live/')[1].split('?')[0];
                              setManualVideoId(vid);
                            }
                          }}
                        />
                        <button
                          onClick={(e) => {
                            const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                            const val = input.value;
                            let vid = val;
                            if (val.includes('v=')) vid = new URLSearchParams(new URL(val).search).get('v') || val;
                            else if (val.includes('youtu.be/')) vid = val.split('youtu.be/')[1].split('?')[0];
                            else if (val.includes('/live/')) vid = val.split('/live/')[1].split('?')[0];
                            setManualVideoId(vid);
                          }}
                          style={{ background: '#FF0000', color: '#fff', border: 'none', borderRadius: '4px', padding: '6px 12px', cursor: 'pointer' }}
                        >
                          Load
                        </button>
                        <button
                          onClick={() => setShowYoutubeSection(false)}
                          style={{ background: '#333', color: '#fff', border: 'none', borderRadius: '4px', padding: '6px 12px', cursor: 'pointer', fontSize: '13px' }}
                        >
                          Remove Chat
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <ChatDisplay
              messages={messages}
              isLoading={isLoading}
              selectedPlatforms={selectedPlatforms}
              onReply={(message) => setReplyingTo(message)}
              channelName={selectedTwitchChannelName}
              channelDisplayName={selectedTwitchChannelDisplayName}
              streamTitle=''
              isStreamLive={streamIsLive}
              streamUptime={streamUptime}
              viewerCount={viewerCount}
              onRefreshEmotes={handleRefreshEmotes}
              isRefreshingEmotes={isRefreshingEmotes}
              onToggleSidebar={onToggleSidebar}
              sidebarVisible={sidebarVisible}
              onCopyMessage={() => {
                notificationIdRef.current += 1;
                setNotification({ message: 'Message copied!', type: 'success', id: notificationIdRef.current });
              }}
              showStreamEmbed={showStreamEmbed}
              onToggleStreamEmbed={onToggleStreamEmbed}
              currentUserDisplayName={twitchSession?.displayName}
            />
          </div>

          <MessageInput
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
            isConnected={{ twitch: twitchConnected }}
            replyingTo={replyingTo}
            onCancelReply={() => setReplyingTo(undefined)}
            chatMessages={messages}
            currentUsername={twitchSession?.username || ''}
          />
        </>
      )}
    </div>
  );
}
