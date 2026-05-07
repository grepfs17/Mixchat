import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useTwitchChat } from './useTwitchChat';
import type { MentionSoundType } from './useTwitchChat';
import { useRaidDetection } from './useRaidDetection';
import type { RaidOutEvent } from './useRaidDetection';
import { initializeEmotes, clearEmoteCache, subscribeTo7TVUpdates } from '../lib/emotes';
import { initializeBadges, clearBadgeCache } from '../lib/badges';
import {
  getStreamStatus,
  getRecentMessages,
  deleteChatMessage,
  createBan,
  checkUserModStatus,
  sendHelixMessage,
  resolveBroadcasterId,
  removeBan,
  clearChat,
  getChannelInfo,
  updateChannelInfo,
  searchCategories,
} from '../lib/twitch';
import type { ChatMessage, Platform, PlatformSession, ChatFont, ChatTheme, MessageType } from '../lib/types';
import { MAX_DISPLAYED_MESSAGES } from '../lib/types';
import type { YTMessage } from '../components/chat/unified/types';
import type { ChatDisplayHandle } from '../components/chat/display';
import type { UnifiedChatHandle } from '../components/chat/unified';

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

export interface ChatAppStateProps {
  twitchConnected: boolean;
  selectedTwitchChannel?: string;
  selectedTwitchChannelName?: string;
  selectedTwitchChannelDisplayName?: string;
  twitchSession?: PlatformSession;
  linkedYoutubeUrl?: string;
  youtubeSession?: PlatformSession;
  unifyChatEnabled?: boolean;
  compactActions?: boolean;
  useYoutubeEmbed?: boolean;
  fontSize?: number;
  chatFont?: ChatFont;
  mentionSoundEnabled?: boolean;
  mentionVolume?: number;
  mentionSoundType?: MentionSoundType;
  showDeletedMessages?: boolean;
  splitChatEnabled?: boolean;
  chatTheme?: ChatTheme;
  hideViewerCount?: boolean;
  eventSounds?: Record<string, string>;
  onFollowRaid?: (channelLogin: string) => void;
  viewerCount?: number | null;
  onToggleSidebar?: () => void;
  sidebarVisible?: boolean;
  showStreamEmbed?: boolean;
  onToggleStreamEmbed?: () => void;
}

export function useChatAppState({
  selectedTwitchChannel = '',
  selectedTwitchChannelName = '',
  selectedTwitchChannelDisplayName = '',
  twitchSession,
  linkedYoutubeUrl,
  youtubeSession,
  unifyChatEnabled = false,
  mentionSoundEnabled = true,
  mentionVolume = 0.2,
  mentionSoundType = 'ding' as MentionSoundType,
  showDeletedMessages = true,
  eventSounds = {},
}: ChatAppStateProps) {
  // ── State ──
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingRaid, setPendingRaid] = useState<RaidOutEvent | null>(null);
  const [isRefreshingEmotes, setIsRefreshingEmotes] = useState(false);
  const [selectedPlatforms, _setSelectedPlatforms] = useState<Platform[]>([]);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | undefined>();
  const [streamIsLive, setStreamIsLive] = useState(false);
  const [streamUptime, setStreamUptime] = useState<string>('');
  const [streamTitle, setStreamTitle] = useState<string>('');
  const [streamGameName, setStreamGameName] = useState<string>('');
  const [streamGameId, setStreamGameId] = useState<string>('');
  const [showPreloadedMessages, _setShowPreloadedMessages] = useState(true);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info'; id?: number } | null>(null);
  const notificationIdRef = useRef(0);
  const chatDisplayRef = useRef<ChatDisplayHandle>(null);
  const unifiedChatRef = useRef<UnifiedChatHandle>(null);
  const preloadedMessagesRef = useRef<Set<string>>(new Set());
  const currentUserBadgesRef = useRef<{ badges: Record<string, string>; badgeDetails: Record<string, { url: string; title: string }> }>({ badges: {}, badgeDetails: {} });
  const streamStartedAtRef = useRef<Date | null>(null);
  const [manualVideoId, setManualVideoId] = useState<string>('');
  const [autoVideoId, setAutoVideoId] = useState<string | null>(null);
  const [ytLoading, setYtLoading] = useState(false);
  const [ytError, setYtError] = useState<string | null>(null);
  const [showYoutubeSection, setShowYoutubeSection] = useState(true);
  const [chatSplitRatio, setChatSplitRatio] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mixchat_chat_split_ratio');
      return saved ? parseFloat(saved) : 50;
    }
    return 50;
  });
  const [isDraggingChatSplit, setIsDraggingChatSplit] = useState(false);
  const [ytMessages, setYtMessages] = useState<YTMessage[]>([]);
  const [ytOptimisticMessages, setYtOptimisticMessages] = useState<YTMessage[]>([]);
  const [badgesReady, setBadgesReady] = useState(false);
  const [isModerator, setIsModerator] = useState(false);
  const [modModeActive, setModModeActive] = useState(false);
  const [isFollowingChannelState, setIsFollowingChannelState] = useState<boolean | null>(null);

  // ── Refs synced with props ──
  const showDeletedMessagesRef = useRef(showDeletedMessages);
  useEffect(() => { showDeletedMessagesRef.current = showDeletedMessages; }, [showDeletedMessages]);

  // ── Drag split handler ──
  useEffect(() => {
    if (!isDraggingChatSplit) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = document.querySelector('[data-chat-app-container]');
      if (!container) return;
      const rect = container.getBoundingClientRect();
      let percentage = ((e.clientY - rect.top) / rect.height) * 100;
      if (percentage < 20) percentage = 20;
      if (percentage > 80) percentage = 80;
      setChatSplitRatio(percentage);
    };

    const handleMouseUp = () => {
      setIsDraggingChatSplit(false);
      localStorage.setItem('mixchat_chat_split_ratio', chatSplitRatio.toString());
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingChatSplit, chatSplitRatio]);

  // ── YouTube video ID memo ──
  const youtubeVideoId = useMemo(() => {
    if (manualVideoId) return manualVideoId;
    if (autoVideoId) return autoVideoId;
    if (!linkedYoutubeUrl) return null;
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

  // ── Auto-fetch live video ID ──
  useEffect(() => {
    if (!linkedYoutubeUrl) {
      setAutoVideoId(null);
      setYtError(null);
      return;
    }
    if (linkedYoutubeUrl.includes('v=') || linkedYoutubeUrl.includes('youtu.be/') || linkedYoutubeUrl.includes('/live/')) {
      return;
    }

    let cancelled = false;
    const abortController = new AbortController();
    const fetchLiveVideoId = async () => {
      setYtLoading(true);
      setYtError(null);
      try {
        const params = new URLSearchParams();
        params.append('channelUrl', linkedYoutubeUrl);
        const res = await fetch(`/api/youtube-live?${params.toString()}`, { signal: abortController.signal });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.videoId) {
          setAutoVideoId((prev) => (prev !== data.videoId ? data.videoId : prev));
          setYtError(null);
        } else {
          if (!res.ok) {
            setYtError(data.error || 'Failed to check for live stream');
          } else {
            setYtError('No live stream found');
            setAutoVideoId(null);
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!cancelled) {
          setYtError('Failed to check for live stream');
          console.error('YouTube live fetch error:', err);
        }
      } finally {
        if (!cancelled) setYtLoading(false);
      }
    };

    fetchLiveVideoId();
    const interval = setInterval(fetchLiveVideoId, 600000);

    return () => {
      cancelled = true;
      abortController.abort();
      clearInterval(interval);
    };
  }, [linkedYoutubeUrl]);

  // ── Reset YouTube state on channel change ──
  useEffect(() => {
    setManualVideoId('');
    setAutoVideoId(null);
    setYtError(null);
    setShowYoutubeSection(true);
    setYtMessages([]);
  }, [selectedTwitchChannel]);

  // ── Update document title ──
  useEffect(() => {
    if (selectedTwitchChannelDisplayName) {
      document.title = `Mixchat - ${selectedTwitchChannelDisplayName}`;
    } else {
      document.title = 'Mixchat - Multi-Platform Live Chat';
    }
  }, [selectedTwitchChannelDisplayName]);

  // ── Twitch message handler ──
  const handleTwitchMessage = useCallback((message: ChatMessage) => {
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
      const existingIdx = prev.findIndex((m) => m.id === message.id || m.id === `optimistic_${message.id}`);
      if (existingIdx !== -1) {
        if (prev[existingIdx].optimistic || prev[existingIdx].id.startsWith('optimistic_')) {
          const copy = [...prev];
          copy[existingIdx] = message;
          return copy;
        }
        return prev;
      }

      const sessionName = (twitchSession?.displayName || twitchSession?.username || '').toLowerCase();
      const isFromSession = Boolean(
        message.isCurrentUser ||
        (message.userId && message.userId === twitchSession?.userId) ||
        (message.author && sessionName && message.author.toLowerCase() === sessionName)
      );

      const normalize = (s?: string) => (s || '').normalize('NFKC').trim().toLowerCase();
      const serverNorm = normalize(message.content);

      if (isFromSession) {
        let matchIndex = -1;

        if (message.userId) {
          matchIndex = prev.findIndex((m) =>
            m.optimistic &&
            m.userId === message.userId &&
            normalize(m.content) === serverNorm &&
            ((m.replyTo?.id || '') === (message.replyTo?.id || ''))
          );
        }

        if (matchIndex === -1 && message.author) {
          matchIndex = prev.findIndex((m) =>
            m.optimistic &&
            m.author &&
            m.author.toLowerCase() === message.author.toLowerCase() &&
            normalize(m.content) === serverNorm &&
            ((m.replyTo?.id || '') === (message.replyTo?.id || ''))
          );
        }

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

  // ── Moderator status effects ──
  useEffect(() => {
    if (twitchSession && selectedTwitchChannelName) {
      const isOwnerByName = (twitchSession.username || '').toLowerCase() === selectedTwitchChannelName.toLowerCase();
      const isOwnerById = twitchSession.userId && selectedTwitchChannel ? twitchSession.userId === selectedTwitchChannel : false;
      if (isOwnerByName || isOwnerById) {
        setIsModerator(true);
        setModModeActive(true);
      } else {
        setModModeActive(false);
      }
    } else {
      setModModeActive(false);
    }
  }, [twitchSession, selectedTwitchChannelName, selectedTwitchChannel]);

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

  // ── Own badges loaded handler ──
  const handleOwnBadgesLoaded = useCallback(
    (badges: Record<string, string>, badgeDetails: Record<string, { url: string; title: string }>) => {
      if (Object.keys(badges).length > 0 || Object.keys(badgeDetails).length > 0) {
        currentUserBadgesRef.current = { badges, badgeDetails };
      }
      const isOwnerByName = (twitchSession?.username || '').toLowerCase() === selectedTwitchChannelName.toLowerCase();
      const isOwnerById = twitchSession?.userId && selectedTwitchChannel ? twitchSession.userId === selectedTwitchChannel : false;
      const isOwner = isOwnerByName || isOwnerById;
      const isMod = Boolean(badges && (badges['moderator'] || badges['broadcaster']));
      setIsModerator(isMod || isOwner);
    },
    [twitchSession?.username, twitchSession?.userId, selectedTwitchChannelName, selectedTwitchChannel]
  );

  // ── Message deleted handler ──
  const handleMessageDeleted = useCallback((messageId: string) => {
    setMessages((prev) => {
      if (showDeletedMessagesRef.current) {
        return prev.map((m) => m.id === messageId ? { ...m, isDeleted: true } : m);
      } else {
        return prev.filter((m) => m.id !== messageId);
      }
    });
  }, []);

  // ── Raid detection ──
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

  // ── Twitch chat connection ──
  const { sendMessage: sendTwitchMessage, slowModeWaitTime, followerModeMinutes } =
    useTwitchChat(
      selectedTwitchChannelName,
      twitchSession?.accessToken || '',
      twitchSession?.username || twitchSession?.displayName || '',
      handleTwitchMessage,
      badgesReady,
      mentionSoundEnabled,
      mentionVolume,
      mentionSoundType,
      eventSounds,
      handleOwnBadgesLoaded,
      handleMessageDeleted
    );

  // ── Initialize assets on channel change ──
  useEffect(() => {
    clearBadgeCache();
    setBadgesReady(false);
    setStreamTitle('');
    setStreamGameName('');
    if (selectedTwitchChannelName && selectedTwitchChannel) {
      setMessages([]);
      preloadedMessagesRef.current.clear();

      const loadRecentMessages = async (): Promise<ChatMessage[]> => {
        try {
          const recentMessages = await getRecentMessages(selectedTwitchChannelName);
          recentMessages.forEach(msg => preloadedMessagesRef.current.add(msg.id));
          if (showPreloadedMessages) {
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

      let subscribe7tv: (() => void) | undefined;

      const initializeAssets = async () => {
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
        try {
          if (twitchSession?.accessToken && twitchSession?.userId && selectedTwitchChannelName) {
            const twitchLib = await import('../lib/twitch');
            let follows = await twitchLib.isFollowingChannel(
              twitchSession.accessToken,
              import.meta.env.PUBLIC_TWITCH_CLIENT_ID,
              twitchSession.userId,
              selectedTwitchChannelName,
            );
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

  // ── Stream status polling ──
  useEffect(() => {
    const fetchStreamStatus = async () => {
      if (selectedTwitchChannel && twitchSession?.accessToken) {
        try {
          const status = await getStreamStatus(
            twitchSession.accessToken,
            import.meta.env.PUBLIC_TWITCH_CLIENT_ID,
            selectedTwitchChannel
          );
          if (status) {
            setStreamIsLive(status.isLive);
            setStreamTitle(status.isLive ? (status.title || '') : '');
            setStreamGameName(status.isLive ? (status.gameName || '') : '');
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
    const uptimeInterval = setInterval(() => {
      if (streamStartedAtRef.current) {
        setStreamUptime(calculateUptime(streamStartedAtRef.current));
      }
    }, UPTIME_UPDATE_INTERVAL);

    return () => {
      clearInterval(statusInterval);
      clearInterval(uptimeInterval);
    };
  }, [selectedTwitchChannel, twitchSession?.accessToken]);

  // ── Channel info polling ──
  useEffect(() => {
    const fetchChannelInfo = async () => {
      if (selectedTwitchChannel && twitchSession?.accessToken) {
        try {
          const info = await getChannelInfo(
            twitchSession.accessToken,
            import.meta.env.PUBLIC_TWITCH_CLIENT_ID,
            selectedTwitchChannel
          );
          if (info) {
            setStreamTitle(info.title);
            setStreamGameName(info.gameName);
            setStreamGameId(info.gameId);
          }
        } catch (error) {
          console.error('Failed to fetch channel info:', error);
        }
      }
    };

    fetchChannelInfo();
    const interval = setInterval(fetchChannelInfo, 30000);
    return () => clearInterval(interval);
  }, [selectedTwitchChannel, twitchSession?.accessToken]);

  // ── Send message handler ──
  const handleSendMessage = useCallback(
    async (message: string, platforms: Platform[], _replyToId?: string) => {
      if (!message.trim() || platforms.length === 0) return;

      setIsLoading(true);
      try {
        if (platforms.includes('twitch') && selectedTwitchChannel && twitchSession) {
          try {
            if (message.startsWith('/')) {
              const parts = message.split(/\s+/);
              const cmd = parts[0].toLowerCase();

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
                    setMessages((prev) => [
                      ...prev,
                      {
                        id: `untimeout-${targetUser}-${Date.now()}`,
                        platform: 'twitch' as Platform,
                        author: 'System',
                        content: `${targetUser} timeout/ban was removed.`,
                        timestamp: new Date(),
                        userId: 'system',
                        authorColor: '#22c55e',
                        mentionsUser: false,
                        emotes: {},
                        isBot: true,
                        badges: {},
                        badgeDetails: {},
                        messageType: 'untimeout' as MessageType,
                        targetUsername: targetUser,
                      },
                    ]);
                    notificationIdRef.current += 1;
                    setNotification({ message: `Removed timeout/ban for ${targetUser}`, type: 'success', id: notificationIdRef.current });
                  } else {
                    let duration: number | undefined = undefined;
                    let reasonIndex = 2;

                    if (cmd === '/timeout') {
                      const durationStr = parts[2] || '600';
                      const match = durationStr.match(/^(\d+)([smhd])?$/i);
                      if (match) {
                        const val = parseInt(match[1]);
                        const unit = (match[2] || 's').toLowerCase();
                        const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
                        duration = val * (multipliers[unit] || 1);
                        reasonIndex = 3;
                      } else {
                        duration = 600;
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
                  return;
                } catch (err: any) {
                  console.error(`Moderation command ${cmd} failed:`, err);
                  notificationIdRef.current += 1;
                  setNotification({ message: err.message || `Failed to execute ${cmd}`, type: 'error', id: notificationIdRef.current });
                  return;
                }
              }

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

                setMessages((prev) => {
                  const hasRealById = prev.some((m) => m.id === serverMessageId && !m.optimistic);
                  if (hasRealById) return prev;

                  const hasRealByContent = prev.some((m) =>
                    !m.optimistic &&
                    m.isCurrentUser &&
                    m.userId === twitchSession?.userId &&
                    m.content === message &&
                    ((m.replyTo?.id || '') === (replyingTo?.id || ''))
                  );
                  if (hasRealByContent) return prev;

                  const optimisticIdExists = prev.some((m) => m.id === optimisticId);
                  if (optimisticIdExists) return prev;

                  const updated = [...prev, optimisticMessage];
                  return updated.length > MAX_DISPLAYED_MESSAGES ? updated.slice(-MAX_DISPLAYED_MESSAGES) : updated;
                });
              } else {
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
        if (unifyChatEnabled) {
          unifiedChatRef.current?.scrollToBottom();
        } else {
          chatDisplayRef.current?.scrollToBottom();
        }
      }
    },
    [selectedTwitchChannel, sendTwitchMessage, twitchSession, replyingTo, unifyChatEnabled]
  );

  // ── Refresh emotes ──
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

  // ── Moderation actions ──
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
      setMessages((prev) => [
        ...prev,
        {
          id: `untimeout-${userName}-${Date.now()}`,
          platform: 'twitch' as Platform,
          author: 'System',
          content: `${userName} timeout/ban was removed.`,
          timestamp: new Date(),
          userId: 'system',
          authorColor: '#22c55e',
          mentionsUser: false,
          emotes: {},
          isBot: true,
          badges: {},
          badgeDetails: {},
          messageType: 'untimeout' as MessageType,
          targetUsername: userName,
        },
      ]);
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

  const handleUpdateTitle = useCallback(async (title: string) => {
    if (!twitchSession?.accessToken || !selectedTwitchChannel) return;
    try {
      const ok = await updateChannelInfo(
        twitchSession.accessToken,
        import.meta.env.PUBLIC_TWITCH_CLIENT_ID,
        selectedTwitchChannel,
        { title }
      );
      if (ok) {
        setStreamTitle(title);
        notificationIdRef.current += 1;
        setNotification({ message: 'Title updated', type: 'success', id: notificationIdRef.current });
      } else {
        notificationIdRef.current += 1;
        setNotification({ message: 'Failed to update title (missing permission?)', type: 'error', id: notificationIdRef.current });
      }
    } catch {
      notificationIdRef.current += 1;
      setNotification({ message: 'Failed to update title', type: 'error', id: notificationIdRef.current });
    }
  }, [twitchSession, selectedTwitchChannel]);

  const handleUpdateCategory = useCallback(async (gameId: string, gameName: string) => {
    if (!twitchSession?.accessToken || !selectedTwitchChannel) return;
    try {
      const ok = await updateChannelInfo(
        twitchSession.accessToken,
        import.meta.env.PUBLIC_TWITCH_CLIENT_ID,
        selectedTwitchChannel,
        { gameId }
      );
      if (ok) {
        setStreamGameName(gameName);
        setStreamGameId(gameId);
        notificationIdRef.current += 1;
        setNotification({ message: 'Category updated', type: 'success', id: notificationIdRef.current });
      } else {
        notificationIdRef.current += 1;
        setNotification({ message: 'Failed to update category (missing permission?)', type: 'error', id: notificationIdRef.current });
      }
    } catch {
      notificationIdRef.current += 1;
      setNotification({ message: 'Failed to update category', type: 'error', id: notificationIdRef.current });
    }
  }, [twitchSession, selectedTwitchChannel]);

  const handleSearchCategories = useCallback(async (query: string): Promise<Array<{ id: string; name: string }>> => {
    if (!twitchSession?.accessToken) return [];
    try {
      return await searchCategories(
        twitchSession.accessToken,
        import.meta.env.PUBLIC_TWITCH_CLIENT_ID,
        query
      );
    } catch {
      return [];
    }
  }, [twitchSession]);

  // ── YouTube helpers ──
  const getYtMessageText = useCallback((m: YTMessage) =>
    m.parts.map((p) => (p as any).text || (p as any).emojiText || (p as any).alt || '').join(''),
  []);

  const handleYtMessages = useCallback((msgs: YTMessage[]) => {
    setYtOptimisticMessages((prev) => {
      if (!prev.length) return prev;
      const norm = (s: string) => s.normalize('NFKC').trim().toLowerCase();

      const realKeys = new Set(
        msgs.map((m) => {
          const textKey = norm(getYtMessageText(m));
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
  }, [getYtMessageText]);

  const handleYtOptimisticMessage = useCallback((id: string, text: string) => {
    const optimistic: YTMessage = {
      id,
      author: youtubeSession?.displayName || 'You',
      authorChannelId: youtubeSession?.userId,
      authorAvatar: youtubeSession?.profileImageUrl,
      parts: [{ type: 'text', text }],
      timestamp: new Date(),
      optimistic: true,
    };
    setYtOptimisticMessages((prev) => [...prev, optimistic]);
    if (unifyChatEnabled) {
      unifiedChatRef.current?.scrollToBottom();
    }
  }, [youtubeSession, unifyChatEnabled]);

  const handleYtOptimisticFailed = useCallback((id: string) => {
    setYtOptimisticMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return {
    // State
    messages,
    isLoading,
    pendingRaid,
    isRefreshingEmotes,
    selectedPlatforms,
    replyingTo,
    streamIsLive,
    streamUptime,
    streamTitle,
    streamGameName,
    streamGameId,
    showPreloadedMessages,
    notification,
    chatDisplayRef,
    unifiedChatRef,
    manualVideoId,
    autoVideoId,
    ytLoading,
    ytError,
    showYoutubeSection,
    chatSplitRatio,
    isDraggingChatSplit,
    ytMessages,
    ytOptimisticMessages,
    youtubeVideoId,
    badgesReady,
    isModerator,
    modModeActive,
    isFollowingChannelState,
    notificationIdRef,

    // Setters
    setReplyingTo,
    setShowYoutubeSection,
    setIsDraggingChatSplit,
    setManualVideoId,
    setAutoVideoId,
    setNotification,
    setPendingRaid,

    // Handlers
    handleSendMessage,
    handleRefreshEmotes,
    handleToggleModMode,
    handleDelete,
    handleBan,
    handleTimeout,
    handleUntimeout,
    handleWarn,
    handleUpdateTitle,
    handleUpdateCategory,
    handleSearchCategories,
    handleYtMessages,
    handleYtOptimisticMessage,
    handleYtOptimisticFailed,
    getYtMessageText,

    // From useTwitchChat
    sendTwitchMessage,
    slowModeWaitTime,
    followerModeMinutes,
  };
}
