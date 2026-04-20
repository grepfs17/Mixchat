import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import ChatDisplay, { type ChatDisplayHandle } from './ChatDisplay';
import MobileTouchHintModal from './MobileTouchHintModal';
import NewFeaturesModal from './NewFeaturesModal';
import MessageInput from './MessageInput';
import Notification from './Notification';
import YouTubeChat from './YouTubeChat';
import YouTubeMessageInput from './YouTubeMessageInput';
import UnifiedChat, { type YTMessage, type UnifiedChatHandle } from './UnifiedChat';
import { useTwitchChat } from '../hooks/useTwitchChat';
import type { MentionSoundType } from '../hooks/useTwitchChat';
import { useRaidDetection } from '../hooks/useRaidDetection';
import type { RaidOutEvent } from '../hooks/useRaidDetection';
import RaidNotification from './RaidNotification';
import { initializeEmotes, clearEmoteCache, subscribeTo7TVUpdates } from '../lib/emotes';
import { initializeBadges, clearBadgeCache } from '../lib/badges';
import { getStreamStatus, getRecentMessages, deleteChatMessage, createBan, checkUserModStatus, sendHelixMessage, resolveBroadcasterId, removeBan, clearChat } from '../lib/twitch';
import type { ChatMessage, Platform, PlatformSession, ChatFont } from '../lib/types';

const MAX_DISPLAYED_MESSAGES = 80;
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
  useYoutubeEmbed?: boolean;
  fontSize?: number;
  chatFont?: ChatFont;
  mentionSoundEnabled?: boolean;
  mentionVolume?: number;
  mentionSoundType?: MentionSoundType;
  showDeletedMessages?: boolean;
  /** Called when the viewer clicks "Follow Raid" on the raid banner */
  onFollowRaid?: (channelLogin: string) => void;
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
  youtubeSession,
  unifyChatEnabled = false,
  useYoutubeEmbed = false,
  fontSize = 14,
  chatFont = 'inter' as ChatFont,
  mentionSoundEnabled = true,
  mentionVolume = 0.5,
  mentionSoundType = 'ding' as MentionSoundType,
  showDeletedMessages = true,
  onFollowRaid,
}: ChatAppProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingRaid, setPendingRaid] = useState<RaidOutEvent | null>(null);
  const [isRefreshingEmotes, setIsRefreshingEmotes] = useState(false);
  const [selectedPlatforms, _setSelectedPlatforms] = useState<Platform[]>([]);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | undefined>();
  const [streamIsLive, setStreamIsLive] = useState(false);
  const [streamUptime, setStreamUptime] = useState<string>('');
  const [showPreloadedMessages, _setShowPreloadedMessages] = useState(true);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info'; id?: number } | null>(null);
  const notificationIdRef = React.useRef(0);
  const chatDisplayRef = React.useRef<ChatDisplayHandle>(null);
  const unifiedChatRef = React.useRef<UnifiedChatHandle>(null);
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
  // Optimistic YouTube messages: added instantly on send, removed when the polled feed confirms them
  const [ytOptimisticMessages, setYtOptimisticMessages] = useState<YTMessage[]>([]);

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

  // Reset all YouTube state when the channel changes
  useEffect(() => {
    setManualVideoId('');
    setAutoVideoId(null);
    setYtError(null);
    setShowYoutubeSection(true);
    setYtMessages([]);
  }, [selectedTwitchChannel]);

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
      // If we already have this message ID (or its optimistic placeholder), 
      // replace it with the real one to get full metadata (badges, server timestamp, etc).
      const existingIdx = prev.findIndex((m) => m.id === message.id || m.id === `optimistic_${message.id}`);
      if (existingIdx !== -1) {
        if (prev[existingIdx].optimistic || prev[existingIdx].id.startsWith('optimistic_')) {
          const copy = [...prev];
          copy[existingIdx] = message;
          return copy;
        }
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

  const [badgesReady, setBadgesReady] = useState(false);
  const [isModerator, setIsModerator] = useState(false);
  const [modModeActive, setModModeActive] = useState(false);
  const [isFollowingChannelState, setIsFollowingChannelState] = useState<boolean | null>(null);

  // Ref so handleMessageDeleted closure always reads the latest prop value
  const showDeletedMessagesRef = useRef(showDeletedMessages);
  useEffect(() => { showDeletedMessagesRef.current = showDeletedMessages; }, [showDeletedMessages]);

  useEffect(() => {
    if (twitchSession && selectedTwitchChannelName) {
      const isOwner = (twitchSession.username || '').toLowerCase() === selectedTwitchChannelName.toLowerCase();
      if (isOwner) {
        setIsModerator(true);
      }
    }
  }, [twitchSession, selectedTwitchChannelName]);

  // Check moderator status via API for better reliability (Twitch Helix)
  useEffect(() => {
    const checkModViaApi = async () => {
      if (twitchSession?.accessToken && selectedTwitchChannel && twitchSession.userId) {
        try {
          const isMod = await checkUserModStatus(
            twitchSession.accessToken,
            import.meta.env.PUBLIC_TWITCH_CLIENT_ID,
            selectedTwitchChannel,
            twitchSession.userId
          );
          if (isMod) {
            setIsModerator(true);
          }
        } catch (err) {
          console.error('[ChatApp] API mod check failed:', err);
        }
      }
    };

    checkModViaApi();
  }, [twitchSession?.accessToken, selectedTwitchChannel, twitchSession?.userId]);

  // Cache the current user's own badges so they can be shown on optimistic messages
  const handleOwnBadgesLoaded = useCallback(
    (badges: Record<string, string>, badgeDetails: Record<string, { url: string; title: string }>) => {
      if (Object.keys(badges).length > 0 || Object.keys(badgeDetails).length > 0) {
        currentUserBadgesRef.current = { badges, badgeDetails };
      }
      // Detect moderator or broadcaster badge for the logged-in user in this channel.
      // We also verify username match as a fallback.
      const isOwner = (twitchSession?.username || '').toLowerCase() === selectedTwitchChannelName.toLowerCase();
      const isMod = Boolean(badges && (badges['moderator'] || badges['broadcaster']));
      setIsModerator(isMod || isOwner);
    },
    [twitchSession?.username, selectedTwitchChannelName]
  );

  // Mark a message as deleted or remove it depending on user preference
  const handleMessageDeleted = useCallback((messageId: string) => {
    setMessages((prev) => {
      if (showDeletedMessagesRef.current) {
        return prev.map((m) => m.id === messageId ? { ...m, isDeleted: true } : m);
      } else {
        return prev.filter((m) => m.id !== messageId);
      }
    });
  }, []);

  // Detect outgoing raids via Twitch EventSub WebSocket
  useRaidDetection({
    channelId: selectedTwitchChannel,
    accessToken: twitchSession?.accessToken || '',
    clientId: import.meta.env.PUBLIC_TWITCH_CLIENT_ID,
    enabled: !!(twitchSession?.accessToken && selectedTwitchChannel && badgesReady),
    onRaidOut: (raid) => {
      setPendingRaid(raid);
    },
    onScopeError: () => {
      notificationIdRef.current += 1;
      setNotification({
        message: 'Raid detection unavailable — please re-login to refresh your Twitch session',
        type: 'info',
        id: notificationIdRef.current,
      });
    },
  });

  // Connect to the Twitch chat channel
  const { sendMessage: sendTwitchMessage, slowModeWaitTime, followerModeMinutes } =
    useTwitchChat(
      selectedTwitchChannelName, // Use the channel name (login), not the ID
      twitchSession?.accessToken || '',
      twitchSession?.username || twitchSession?.displayName || '', // Use login (username) for chat
      handleTwitchMessage,
      badgesReady,
      mentionSoundEnabled,
      mentionVolume,
      mentionSoundType,
      handleOwnBadgesLoaded,
      handleMessageDeleted
    );

  // Initialize assets and load recent messages when the selected channel changes
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
      let subscribe7tv: (() => void) | undefined;

      const initializeAssets = async () => {
        // Don't attempt API calls until the access token has been populated by
        // useTokenRefresh. If it's absent we'll be re-triggered once it arrives.
        if (!twitchSession?.accessToken) {
          return;
        }
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

          subscribe7tv = subscribeTo7TVUpdates(selectedTwitchChannel, selectedTwitchChannelName);

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
        // Check whether the logged-in viewer follows this channel (for follower-only chat messaging)
        try {
          if (twitchSession?.accessToken && twitchSession?.userId && selectedTwitchChannelName) {
            const twitchLib = await import('../lib/twitch');
            let follows = await twitchLib.isFollowingChannel(
              twitchSession.accessToken,
              import.meta.env.PUBLIC_TWITCH_CLIENT_ID,
              twitchSession.userId,
              selectedTwitchChannelName,
            );

            // Fallback: if the simple follow check returned false, try fetching
            // the full followed-channels list to guard against Helix anomalies
            // (410/Gone or other transient issues). This is heavier but more
            // reliable when the lightweight check fails.
            if (!follows) {
              try {
                const all = await twitchLib.getAllFollowedChannels(
                  twitchSession.accessToken,
                  import.meta.env.PUBLIC_TWITCH_CLIENT_ID,
                  twitchSession.userId,
                );
                const match = all.some((ch: any) => {
                  const login = (ch.name || '').toLowerCase();
                  const display = (ch.displayName || '').toLowerCase();
                  return login === selectedTwitchChannelName.toLowerCase() || display === selectedTwitchChannelName.toLowerCase();
                });
                if (match) follows = true;
              } catch (fallbackErr) {
                console.warn('Fallback follow-list check failed:', fallbackErr);
              }
            }

            setIsFollowingChannelState(follows);
          } else {
            setIsFollowingChannelState(null);
          }
        } catch (err) {
          console.error('Failed to check follow status:', err);
          setIsFollowingChannelState(null);
        }
      };

      initializeAssets();

      return () => {
        if (subscribe7tv) subscribe7tv();
      };
    }
  }, [selectedTwitchChannelName, selectedTwitchChannel, twitchSession?.userId, twitchSession?.accessToken]);

  // Fetch stream status on channel change or when component mounts
  useEffect(() => {
    const fetchStreamStatus = async () => {
      // Don't call the API until we have a valid token. useTokenRefresh will
      // populate it shortly after page load, re-triggering this effect.
      if (selectedTwitchChannel && twitchSession?.accessToken) {
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
  }, [selectedTwitchChannel, twitchSession, twitchSession?.accessToken]);

  const handleSendMessage = useCallback(
    async (message: string, platforms: Platform[], _replyToId?: string) => {
      if (!message.trim() || platforms.length === 0) return;

      setIsLoading(true);
      try {
        // Send to Twitch if selected
        if (platforms.includes('twitch') && selectedTwitchChannel && twitchSession) {
          try {
            // Detect slash commands and route them through IRC (since Helix doesn't parse them)
            if (message.startsWith('/')) {
              const parts = message.split(/\s+/);
              const cmd = parts[0].toLowerCase();

              // Handle specific moderation commands via Helix for reliability
              if (cmd === '/timeout' || cmd === '/ban' || cmd === '/unban' || cmd === '/untimeout' || cmd === '/clear') {
                try {
                  if (cmd === '/clear') {
                    await clearChat(selectedTwitchChannel, twitchSession.userId);
                    return;
                  }

                  const targetUser = parts[1];
                  if (!targetUser) throw new Error(`${cmd} requires a username`);

                  const resolvedTargetId = await resolveBroadcasterId(targetUser);
                  if (resolvedTargetId === targetUser && !/^\d+$/.test(resolvedTargetId)) {
                    throw new Error(`Could not find user ${targetUser}`);
                  }

                  if (cmd === '/unban' || cmd === '/untimeout') {
                    await removeBan(selectedTwitchChannel, twitchSession.userId, resolvedTargetId);
                  } else {
                    let duration: number | undefined = undefined;
                    let reasonIndex = 2;

                    if (cmd === '/timeout') {
                      const durationStr = parts[2] || '600';
                      // Parse duration like 10s, 5m, 1h, 1d
                      const match = durationStr.match(/^(\d+)([smhd])?$/i);
                      if (match) {
                        const val = parseInt(match[1]);
                        const unit = (match[2] || 's').toLowerCase();
                        const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
                        duration = val * (multipliers[unit] || 1);
                        reasonIndex = 3;
                      } else {
                        duration = 600; // default 10m
                      }
                    }

                    const reason = parts.slice(reasonIndex).join(' ') || null;
                    await createBan(
                      selectedTwitchChannel,
                      twitchSession.userId,
                      resolvedTargetId,
                      duration,
                      reason
                    );
                  }
                  return; // Don't send the command text to chat
                } catch (err: any) {
                  console.error(`Moderation command ${cmd} failed:`, err);
                  notificationIdRef.current += 1;
                  setNotification({ message: err.message || `Failed to execute ${cmd}`, type: 'error', id: notificationIdRef.current });
                  return;
                }
              }

              // Normal slash commands (like /me, /announce) go through IRC
              await sendTwitchMessage(message, replyingTo?.id);
            } else {
              const serverMessageId = await sendHelixMessage(
                selectedTwitchChannel,
                twitchSession.userId,
                message,
                replyingTo?.id
              );

              if (serverMessageId) {
                const optimisticId = `optimistic_${serverMessageId}`;
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
              } else {
                // Fallback to IRC if somehow Helix didn't return an ID (shouldn't happen on success)
                await sendTwitchMessage(message, replyingTo?.id);
              }
            }
          } catch (error) {
            console.error('Failed to send Twitch message:', error);
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

  // Moderation actions (only available when user is a moderator and mod mode is active)
  const handleToggleModMode = useCallback(() => {
    if (!isModerator) return;
    setModModeActive((v) => !v);
  }, [isModerator]);

  const handleDelete = useCallback(async (messageId: string) => {
    if (!twitchSession || !selectedTwitchChannel) return;
    try {
      await deleteChatMessage(selectedTwitchChannel, twitchSession.userId, messageId);
      notificationIdRef.current += 1;
      setNotification({ message: 'Message deleted', type: 'success', id: notificationIdRef.current });
    } catch (err) {
      console.error('Failed to delete message:', err);
      notificationIdRef.current += 1;
      setNotification({ message: 'Failed to delete message', type: 'error', id: notificationIdRef.current });
    }
  }, [selectedTwitchChannel, twitchSession]);

  const handleBan = useCallback(async (userId: string, displayName?: string) => {
    if (!twitchSession || !selectedTwitchChannel) return;
    try {
      await createBan(selectedTwitchChannel, twitchSession.userId, userId, undefined, 'Banned via Mixchat');
      notificationIdRef.current += 1;
      setNotification({ message: `${displayName || userId} banned`, type: 'success', id: notificationIdRef.current });
    } catch (err) {
      console.error('Failed to ban user:', err);
      notificationIdRef.current += 1;
      setNotification({ message: 'Failed to ban user', type: 'error', id: notificationIdRef.current });
    }
  }, [selectedTwitchChannel, twitchSession]);

  const handleTimeout = useCallback(async (userId: string, seconds: number, displayName?: string) => {
    if (!twitchSession || !selectedTwitchChannel) return;
    try {
      await createBan(selectedTwitchChannel, twitchSession.userId, userId, seconds, `Timeout ${seconds}s`);
      notificationIdRef.current += 1;
      setNotification({ message: `${displayName || userId} timed out for ${seconds}s`, type: 'success', id: notificationIdRef.current });
    } catch (err) {
      console.error('Failed to timeout user:', err);
      notificationIdRef.current += 1;
      setNotification({ message: 'Failed to timeout user', type: 'error', id: notificationIdRef.current });
    }
  }, [selectedTwitchChannel, twitchSession]);

  const handleUntimeout = useCallback(async (userName: string) => {
    if (!twitchSession || !selectedTwitchChannel) return;
    try {
      const targetUserId = await resolveBroadcasterId(userName);
      await removeBan(selectedTwitchChannel, twitchSession.userId, targetUserId);
      notificationIdRef.current += 1;
      setNotification({ message: `Removed timeout/ban for ${userName}`, type: 'success', id: notificationIdRef.current });
    } catch (err) {
      console.error('Failed to untimeout user:', err);
      notificationIdRef.current += 1;
      setNotification({ message: 'Failed to remove timeout', type: 'error', id: notificationIdRef.current });
    }
  }, [selectedTwitchChannel, twitchSession]);

  const handleWarn = useCallback(async (userName: string) => {
    if (!sendTwitchMessage) return;
    const reason = prompt(`Enter a warning message for @${userName}:`, 'Please follow the chat rules');
    if (!reason) return;
    try {
      await sendTwitchMessage(`@${userName} ${reason}`, undefined);
      notificationIdRef.current += 1;
      setNotification({ message: `Warned ${userName}`, type: 'success', id: notificationIdRef.current });
    } catch (err) {
      console.error('Failed to send warn message:', err);
      notificationIdRef.current += 1;
      setNotification({ message: 'Failed to warn user', type: 'error', id: notificationIdRef.current });
    }
  }, [sendTwitchMessage]);

  // Extracts comprehensive text from a YTMessage for reconciliation matching
  const getYtMessageText = (m: import('./UnifiedChat').YTMessage) =>
    m.parts.map((p) => (p as any).text || (p as any).emojiText || (p as any).alt || '').join('');

  // Callback to receive YouTube messages in unified mode
  const handleYtMessages = useCallback((msgs: import('./UnifiedChat').YTMessage[]) => {
    setYtOptimisticMessages((prev) => {
      if (!prev.length) return prev;
      // Normalization function to ensure consistent string comparison
      const norm = (s: string) => s.normalize('NFKC').trim().toLowerCase();

      const realKeys = new Set(
        msgs.map((m) => {
          const textKey = norm(getYtMessageText(m));
          // Prioritize channel ID if available, otherwise fall back to author name
          return m.authorChannelId ? `${m.authorChannelId}|${textKey}` : `${norm(m.author)}|${textKey}`;
        })
      );

      const remaining = prev.filter((opt) => {
        const textKey = norm(getYtMessageText(opt));
        const key = opt.authorChannelId ? `${opt.authorChannelId}|${textKey}` : `${norm(opt.author)}|${textKey}`;
        return !realKeys.has(key);
      });

      return remaining.length === prev.length ? prev : remaining;
    });
    setYtMessages(msgs);
  }, []);

  const handleYtOptimisticMessage = useCallback((id: string, text: string) => {
    const optimistic: import('./UnifiedChat').YTMessage = {
      id,
      author: youtubeSession?.displayName || 'You',
      authorChannelId: youtubeSession?.userId,
      authorAvatar: youtubeSession?.profileImageUrl,
      parts: [{ type: 'text', text }],
      timestamp: new Date(),
      optimistic: true,
    };
    setYtOptimisticMessages((prev) => [...prev, optimistic]);
  }, [youtubeSession]);

  const handleYtOptimisticFailed = useCallback((id: string) => {
    setYtOptimisticMessages((prev) => prev.filter((m) => m.id !== id));
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

      {/* Outgoing raid notification */}
      {pendingRaid && (
        <RaidNotification
          raid={pendingRaid}
          onFollowRaid={() => {
            onFollowRaid?.(pendingRaid.targetLogin);
            setPendingRaid(null);
          }}
          onDismiss={() => setPendingRaid(null)}
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
                onMessages={handleYtMessages}
                fontSize={fontSize}
                chatFont={chatFont}
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
              chatFont={chatFont}
              isModerator={isModerator}
              modModeActive={modModeActive}
              onToggleModMode={handleToggleModMode}
              /* Override messages area with UnifiedChat */
              unifiedChatSlot={
                <UnifiedChat
                  ref={unifiedChatRef}
                  twitchMessages={messages}
                  ytMessages={[
                    ...ytMessages,
                    ...ytOptimisticMessages.filter((opt) => {
                      const norm = (s: string) => s.normalize('NFKC').trim().toLowerCase();
                      const optText = norm(getYtMessageText(opt));
                      const optAuthor = norm(opt.author);

                      return !ytMessages.some((m) => {
                        const mText = norm(getYtMessageText(m));
                        // Match by ID if both have it, else match by normalized name
                        if (opt.authorChannelId && m.authorChannelId) {
                          return m.authorChannelId === opt.authorChannelId && mText === optText;
                        }
                        return norm(m.author) === optAuthor && mText === optText;
                      });
                    }),
                  ]}
                  onReply={setReplyingTo}
                  onCopyMessage={() => {
                    notificationIdRef.current += 1;
                    setNotification({ message: 'Message copied!', type: 'success', id: notificationIdRef.current });
                  }}
                  currentUserDisplayName={twitchSession?.displayName}
                  fontSize={fontSize}
                  chatFont={chatFont}
                  isModerator={isModerator}
                  modModeActive={modModeActive}
                  onDeleteMessage={handleDelete}
                  onBanUser={handleBan}
                  onTimeoutUser={handleTimeout}
                  onUntimeoutUser={handleUntimeout}
                  onWarnUser={handleWarn}
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
            onInputFocus={() => unifiedChatRef.current?.scrollToBottom()}
            slowModeWaitTime={slowModeWaitTime}
            followerModeMinutes={followerModeMinutes}
            isFollowing={isFollowingChannelState}
            isModerator={isModerator}
          />

          {/* YouTube message input (when we have a live video) */}
          {linkedYoutubeUrl && youtubeVideoId && (
            <div style={{ borderTop: '1px solid #333' }}>
              {youtubeSession ? (
                <YouTubeMessageInput
                  youtubeVideoId={youtubeVideoId}
                  chatMessages={ytMessages}
                  onOptimisticMessage={handleYtOptimisticMessage}
                  onOptimisticFailed={handleYtOptimisticFailed}
                  onError={(msg) => {
                    notificationIdRef.current += 1;
                    setNotification({ message: msg, type: 'error', id: notificationIdRef.current });
                  }}
                />
              ) : (
                <div style={{ padding: '8px 12px', fontSize: '12px', color: '#aaa', textAlign: 'center', backgroundColor: '#0f0f0f' }}>
                  <button
                    onClick={() => (document.querySelector<HTMLElement>('.login-btn.youtube-btn') as HTMLElement | null)?.click()}
                    style={{ color: '#ff6b6b', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 'inherit' }}
                  >Login with YouTube</button> to send messages
                </div>
              )}
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
                    {useYoutubeEmbed ? (
                      <iframe
                        src={`https://www.youtube.com/live_chat?v=${youtubeVideoId}&embed_domain=${window.location.hostname}&dark_theme=1`}
                        style={{ width: '100%', height: '100%', border: 'none' }}
                        title="YouTube Live Chat"
                      />
                    ) : (
                      <YouTubeChat
                        videoId={youtubeVideoId}
                        onMessages={handleYtMessages}
                        optimisticMessages={ytOptimisticMessages}
                        fontSize={fontSize}
                        chatFont={chatFont}
                      />
                    )}
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
                  {youtubeSession ? (
                    <YouTubeMessageInput
                      youtubeVideoId={youtubeVideoId}
                      chatMessages={ytMessages}
                      onOptimisticMessage={handleYtOptimisticMessage}
                      onOptimisticFailed={handleYtOptimisticFailed}
                      onError={(msg) => {
                        notificationIdRef.current += 1;
                        setNotification({ message: msg, type: 'error', id: notificationIdRef.current });
                      }}
                    />
                  ) : (
                    <div style={{ padding: '8px 12px', fontSize: '12px', color: '#aaa', textAlign: 'center', backgroundColor: '#0f0f0f' }}>
                      <button
                        onClick={() => (document.querySelector<HTMLElement>('.login-btn.youtube-btn') as HTMLElement | null)?.click()}
                        style={{ color: '#ff6b6b', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 'inherit' }}
                      >Login with YouTube</button> to send messages
                    </div>
                  )}
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
              ref={chatDisplayRef}
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
              chatFont={chatFont}
              isModerator={isModerator}
              modModeActive={modModeActive}
              onToggleModMode={handleToggleModMode}
              onDeleteMessage={handleDelete}
              onBanUser={handleBan}
              onTimeoutUser={handleTimeout}
              onUntimeoutUser={handleUntimeout}
              onWarnUser={handleWarn}
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
            onInputFocus={() => chatDisplayRef.current?.scrollToBottom()}
            slowModeWaitTime={slowModeWaitTime}
            followerModeMinutes={followerModeMinutes}
            isFollowing={isFollowingChannelState}
            isModerator={isModerator}
          />
        </>
      )}
      <NewFeaturesModal />
      <MobileTouchHintModal twitchConnected={twitchConnected} />
    </div>
  );
}
