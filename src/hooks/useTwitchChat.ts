import { useState, useEffect, useCallback, useRef } from 'react';
import { StaticAuthProvider } from '@twurple/auth';
import { ChatClient, UserState } from '@twurple/chat';
import { getBadgeDetail } from '../lib/badges';
import type { ChatMessage } from '../lib/types';

// Cache for user info - limit to 500 entries for memory efficiency
const userInfoCache = new Map<string, { displayName: string; profileImageUrl: string | null }>();
const MAX_CACHE_SIZE = 500;

export type MentionSoundType = 'ding' | 'double' | 'chime' | 'pop' | 'ping';

export const MENTION_SOUND_OPTIONS: { value: MentionSoundType; label: string }[] = [
  { value: 'ding', label: 'Ding' },
  { value: 'double', label: 'Double Beep' },
  { value: 'chime', label: 'Chime' },
  { value: 'pop', label: 'Pop' },
  { value: 'ping', label: 'Ping' },
];

// Cache for source channel (shared chat) info keyed by channel ID
// Twitch IRC does NOT send source-room-login — we fetch it from the API
const sourceChannelInfoCache = new Map<string, { login: string | null; avatar: string | null }>();

function setUserInfoCache(userId: string, info: { displayName: string; profileImageUrl: string | null }) {
  // Limit cache size to prevent memory leaks
  if (userInfoCache.size >= MAX_CACHE_SIZE) {
    const firstKey = userInfoCache.keys().next().value;
    if (firstKey !== undefined) {
      userInfoCache.delete(firstKey);
    }
  }
  userInfoCache.set(userId, info);
}

// Async function to get user info
async function getUserInfo(userId: string, accessToken: string) {
  if (userInfoCache.has(userId)) {
    return userInfoCache.get(userId);
  }

  try {
    const response = await fetch(`/api/user-info?userId=${userId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (response.ok) {
      const data = await response.json();
      setUserInfoCache(userId, data);
      return data;
    }
  } catch (error) {
    console.error('Failed to fetch user info:', error);
  }

  return null;
}

// Async function to get a source channel's login + avatar (for shared chat)
// NOTE: Twitch IRC only sends source-room-id, never source-room-login, so we
// must look up the login name via the API.
async function getSourceChannelInfo(
  channelId: string,
  accessToken: string
): Promise<{ login: string | null; avatar: string | null }> {
  if (sourceChannelInfoCache.has(channelId)) {
    return sourceChannelInfoCache.get(channelId)!;
  }

  try {
    const response = await fetch(`/api/user-info?userId=${channelId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.ok) {
      const data = await response.json();
      const info = {
        login: (data.login as string | null) ?? null,
        avatar: (data.profileImageUrl as string | null) ?? null,
      };
      sourceChannelInfoCache.set(channelId, info);
      return info;
    }
  } catch (error) {
    console.error('Failed to fetch source channel info:', error);
  }

  const fallback = { login: null, avatar: null };
  sourceChannelInfoCache.set(channelId, fallback);
  return fallback;
}

// Single shared AudioContext — reusing it avoids the browser suspending a
// freshly-created context that has no prior user-gesture association.
let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

/** Primes the shared AudioContext on the first user interaction so it is
 *  already in a running state when a mention arrives. Call this once on any
 *  click/keydown in the app. */
export function primeAudioContext() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

/** Plays a notification sound using the Web Audio API. Exported for previewing in the settings modal. */
export function playMentionSoundPreview(volume: number, type: MentionSoundType) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const play = () => {
    try {
      const now = ctx.currentTime;
      const beep = (freq: number, start: number, duration: number, wave: OscillatorType = 'sine') => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = wave;
        osc.frequency.setValueAtTime(freq, now + start);
        gain.gain.setValueAtTime(volume, now + start);
        gain.gain.exponentialRampToValueAtTime(0.001, now + start + duration);
        osc.start(now + start);
        osc.stop(now + start + duration);
      };
      switch (type) {
        case 'ding':   beep(880, 0, 0.25); break;
        case 'double': beep(880, 0, 0.1); beep(880, 0.18, 0.1); break;
        case 'chime':  beep(1047, 0, 0.2); beep(784, 0.22, 0.2); break;
        case 'pop':    beep(440, 0, 0.08, 'square'); break;
        case 'ping':   beep(1200, 0, 0.4); break;
      }
    } catch { /* audio not supported */ }
  };

  if (ctx.state === 'suspended') {
    ctx.resume().then(play).catch(() => {});
  } else {
    play();
  }
}

function playMentionSound(volume: number, type: MentionSoundType) {
  playMentionSoundPreview(volume, type);
}

export function useTwitchChat(
  channelName: string,
  accessToken: string,
  username: string,
  onMessage: (message: ChatMessage) => void,
  enabled: boolean = true,
  mentionSoundEnabled: boolean = true,
  mentionVolume: number = 0.5,
  mentionSoundType: MentionSoundType = 'ding',
  onOwnBadgesLoaded?: (badges: Record<string, string>, badgeDetails: Record<string, { url: string; title: string }>) => void
) {
  const [isConnected, setIsConnected] = useState(false);
  const [client, setClient] = useState<ChatClient | null>(null);

  // Refs so the stale closure inside the IRC handler always reads the latest
  // values without tearing down and rebuilding the WebSocket.
  const mentionSoundEnabledRef = useRef(mentionSoundEnabled);
  const mentionVolumeRef = useRef(mentionVolume);
  const mentionSoundTypeRef = useRef(mentionSoundType);
  useEffect(() => { mentionSoundEnabledRef.current = mentionSoundEnabled; }, [mentionSoundEnabled]);
  useEffect(() => { mentionVolumeRef.current = mentionVolume; }, [mentionVolume]);
  useEffect(() => { mentionSoundTypeRef.current = mentionSoundType; }, [mentionSoundType]);

  // Retrieve Client ID from env; it's required for twurple's AuthProvider
  const clientId = import.meta.env.PUBLIC_TWITCH_CLIENT_ID;

  useEffect(() => {
    if (!enabled) return;
    if (!channelName || !accessToken || !username || !clientId) {
      if (enabled && !clientId) {
        console.error('Twitch Client ID is missing (PUBLIC_TWITCH_CLIENT_ID env var)');
      }
      return;
    }

    let active = true;

    // Use StaticAuthProvider for client-side chat
    const authProvider = new StaticAuthProvider(clientId, accessToken);

    // Initialize the Twurple ChatClient
    const newClient = new ChatClient({
      authProvider,
      channels: [channelName],
      // reconnect handled by default in twurple
    });

    newClient.onConnect(() => {
      if (!active) return;
      console.log(`Connected to ${channelName}`);
      setIsConnected(true);
    });

    newClient.onDisconnect(() => {
      if (!active) return;
      console.log('Disconnected from Twitch chat');
      setIsConnected(false);
    });


    newClient.irc.onTypedMessage(UserState, (msg) => {
      if (!active || !onOwnBadgesLoaded) return;
      const badgesStr = msg.tags.get('badges') || '';
      const badgeImages: Record<string, string> = {};
      const badgeDetailsMap: Record<string, { url: string; title: string }> = {};
      if (badgesStr) {
        badgesStr.split(',').forEach((badge) => {
          const [name, version] = badge.split('/');
          if (!name || !version) return;
          const detail = getBadgeDetail(name, version);
          if (detail) {
            badgeImages[name] = detail.url;
            badgeDetailsMap[name] = { url: detail.url, title: detail.title };
          }
        });
      }
      onOwnBadgesLoaded(badgeImages, badgeDetailsMap);
    });

    newClient.onMessage((_channel, _user, message, msg) => {
      if (!active) return;

      const replyInfo = msg.parentMessageId ? {
        id: msg.parentMessageId,
        author: msg.parentMessageUserDisplayName || msg.parentMessageUserName || '',
        content: msg.parentMessageText || '',
      } : undefined;

      const mentionsUser = (
        message.toLowerCase().includes(`@${username.toLowerCase()}`) ||
        (replyInfo?.author.toLowerCase() === username.toLowerCase())
      );

      // Map Twitch emotes - Twurple provides emote data in msg.emotes
      const twitchEmotes: Record<string, string[]> = {};
      msg.emoteOffsets.forEach((offsets, emoteId) => {
        twitchEmotes[emoteId] = offsets;
      });

      const isBot = msg.userInfo.badges.has('bot');

      const badgeImages: Record<string, string> = {};
      const badgeDetails: Record<string, { url: string; title: string }> = {};
      msg.userInfo.badges.forEach((version, badgeName) => {
        const detail = getBadgeDetail(badgeName, version);
        if (detail) {
          badgeImages[badgeName] = detail.url;
          badgeDetails[badgeName] = { url: detail.url, title: detail.title };
        }
      });

      const cachedUserInfo = msg.userInfo.userId ? userInfoCache.get(msg.userInfo.userId) : undefined;

      // Twitch Shared Chat: the IRC tags include source-room-id to identify the
      // originating channel. NOTE: Twitch does NOT send a source-room-login tag;
      // the login name must be fetched from the API.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawTags = (msg as any).tags as Map<string, string> | undefined;
      const sourceRoomId: string | undefined = rawTags?.get('source-room-id') || undefined;
      // Only treat as shared-chat if the source room differs from the current channel
      const isSharedChat = Boolean(
        sourceRoomId &&
        msg.channelId &&
        sourceRoomId !== msg.channelId
      );

      const cachedSourceInfo = isSharedChat && sourceRoomId
        ? sourceChannelInfoCache.get(sourceRoomId)
        : undefined;

      const chatMessage: ChatMessage = {
        id: msg.id,
        platform: 'twitch',
        author: msg.userInfo.displayName || msg.userInfo.userName || 'Anonymous',
        content: msg.isCheer ? `${message} [${msg.bits} bits]` : message,
        timestamp: msg.date,
        userId: msg.userInfo.userId,
        authorColor: msg.userInfo.color || '#FFFFFF',
        authorAvatar: cachedUserInfo?.profileImageUrl || undefined,
        replyTo: replyInfo,
        mentionsUser,
        emotes: twitchEmotes,
        isBot,
        badges: badgeImages,
        badgeDetails,
        isCurrentUser: msg.userInfo.userName.toLowerCase() === username.toLowerCase(),
        messageType: msg.isRedemption ? 'redemption' : (msg.isCheer ? 'cheer' : 'chat'),
        rewardId: msg.isRedemption ? (msg.rewardId || undefined) : undefined,
        sourceChannelId: isSharedChat ? sourceRoomId : undefined,
        sourceChannelLogin: cachedSourceInfo?.login || undefined,
        sourceChannelAvatar: cachedSourceInfo?.avatar || undefined,
      };

      // Resolve author avatar + source channel info asynchronously.
      // Always create both promises (resolving to null when not needed) so that
      // the destructured indices are always [userInfo, sourceInfo] regardless
      // of which combination is required — avoids an off-by-one index bug.
      const needsUserInfo = !cachedUserInfo && !!msg.userInfo.userId;
      const needsSourceAvatar = isSharedChat && !!sourceRoomId && !sourceChannelInfoCache.has(sourceRoomId);

      if (needsUserInfo || needsSourceAvatar) {
        const userInfoPromise = needsUserInfo && msg.userInfo.userId
          ? getUserInfo(msg.userInfo.userId, accessToken)
          : Promise.resolve(null);
        const sourceInfoPromise = needsSourceAvatar && sourceRoomId
          ? getSourceChannelInfo(sourceRoomId, accessToken)
          : Promise.resolve(null);

        Promise.all([userInfoPromise, sourceInfoPromise]).then(([userInfoResult, sourceInfoResult]) => {
          const resolvedAvatar = (userInfoResult as { profileImageUrl?: string | null } | null)?.profileImageUrl;
          const resolvedSource = sourceInfoResult as { login: string | null; avatar: string | null } | null;
          onMessage({
            ...chatMessage,
            authorAvatar: resolvedAvatar || chatMessage.authorAvatar,
            sourceChannelLogin: resolvedSource?.login || chatMessage.sourceChannelLogin || undefined,
            sourceChannelAvatar: resolvedSource?.avatar || chatMessage.sourceChannelAvatar || undefined,
          });
        }).catch(() => {
          onMessage(chatMessage);
        });

        if (mentionsUser && mentionSoundEnabledRef.current) {
          playMentionSound(mentionVolumeRef.current, mentionSoundTypeRef.current);
        }
        return;
      }

      onMessage(chatMessage);

      if (mentionsUser && mentionSoundEnabledRef.current) {
        playMentionSound(mentionVolumeRef.current, mentionSoundTypeRef.current);
      }
    });

    newClient.onAction((_channel, _user, message, msg) => {
      if (!active) return;

      const badgeImages: Record<string, string> = {};
      const badgeDetails: Record<string, { url: string; title: string }> = {};
      msg.userInfo.badges.forEach((version, badgeName) => {
        const detail = getBadgeDetail(badgeName, version);
        if (detail) {
          badgeImages[badgeName] = detail.url;
          badgeDetails[badgeName] = { url: detail.url, title: detail.title };
        }
      });

      const cachedUserInfo = msg.userInfo.userId ? userInfoCache.get(msg.userInfo.userId) : undefined;

      const chatMessage: ChatMessage = {
        id: msg.id,
        platform: 'twitch',
        author: msg.userInfo.displayName || msg.userInfo.userName || 'Anonymous',
        content: message,
        timestamp: msg.date,
        userId: msg.userInfo.userId,
        authorColor: msg.userInfo.color || '#FFFFFF',
        authorAvatar: cachedUserInfo?.profileImageUrl || undefined,
        mentionsUser: false,
        emotes: {},
        isBot: msg.userInfo.badges.has('bot'),
        badges: badgeImages,
        badgeDetails,
        isCurrentUser: msg.userInfo.userName.toLowerCase() === username.toLowerCase(),
        messageType: 'chat',
      };

      onMessage(chatMessage);
    });

    newClient.onSub((_channel, _user, subInfo, msg) => {
      if (!active) return;
      const tier = subInfo.plan === 'Prime' ? 'Prime' : subInfo.plan === '3000' ? '3' : subInfo.plan === '2000' ? '2' : '1';
      const subMessage = `subscribed with ${subInfo.plan === 'Prime' ? 'Prime Gaming' : `a Tier ${tier} subscription`}${subInfo.message ? ` - ${subInfo.message}` : ''}`;

      const badgeImages: Record<string, string> = {};
      const badgeDetails: Record<string, { url: string; title: string }> = {};
      msg.userInfo.badges.forEach((version, badgeName) => {
        const detail = getBadgeDetail(badgeName, version);
        if (detail) {
          badgeImages[badgeName] = detail.url;
          badgeDetails[badgeName] = { url: detail.url, title: detail.title };
        }
      });

      const chatMessage: ChatMessage = {
        id: msg.id,
        platform: 'twitch',
        author: msg.userInfo.displayName || msg.userInfo.userName || 'Anonymous',
        content: subMessage,
        timestamp: msg.date,
        userId: msg.userInfo.userId,
        authorColor: msg.userInfo.color || '#FFFFFF',
        mentionsUser: false,
        emotes: {},
        isBot: false,
        badges: badgeImages,
        badgeDetails,
        messageType: 'subscription',
      };

      onMessage(chatMessage);
    });

    newClient.onResub((_channel, _user, subInfo, msg) => {
      if (!active) return;
      const monthsCount = subInfo.months;
      const monthLabel = monthsCount === 1 ? 'month' : 'months';
      const resubMessage = `resubscribed for ${monthsCount} ${monthLabel}${subInfo.message ? ` - ${subInfo.message}` : ''}`;

      const badgeImages: Record<string, string> = {};
      const badgeDetails: Record<string, { url: string; title: string }> = {};
      msg.userInfo.badges.forEach((version, badgeName) => {
        const detail = getBadgeDetail(badgeName, version);
        if (detail) {
          badgeImages[badgeName] = detail.url;
          badgeDetails[badgeName] = { url: detail.url, title: detail.title };
        }
      });

      const chatMessage: ChatMessage = {
        id: msg.id,
        platform: 'twitch',
        author: msg.userInfo.displayName || msg.userInfo.userName || 'Anonymous',
        content: resubMessage,
        timestamp: msg.date,
        userId: msg.userInfo.userId,
        authorColor: msg.userInfo.color || '#FFFFFF',
        mentionsUser: false,
        emotes: {},
        isBot: false,
        badges: badgeImages,
        badgeDetails,
        messageType: 'resub',
      };

      onMessage(chatMessage);
    });

    newClient.onSubGift((_channel, recipient, subInfo, msg) => {
      if (!active) return;
      const tier = subInfo.plan === '3000' ? '3' : subInfo.plan === '2000' ? '2' : '1';
      const giftMessage = `gifted a Tier ${tier} subscription to ${recipient}`;

      const badgeImages: Record<string, string> = {};
      const badgeDetails: Record<string, { url: string; title: string }> = {};
      msg.userInfo.badges.forEach((version, badgeName) => {
        const detail = getBadgeDetail(badgeName, version);
        if (detail) {
          badgeImages[badgeName] = detail.url;
          badgeDetails[badgeName] = { url: detail.url, title: detail.title };
        }
      });

      const chatMessage: ChatMessage = {
        id: msg.id,
        platform: 'twitch',
        author: msg.userInfo.displayName || msg.userInfo.userName || 'Anonymous',
        content: giftMessage,
        timestamp: msg.date,
        userId: msg.userInfo.userId,
        authorColor: msg.userInfo.color || '#FFFFFF',
        mentionsUser: false,
        emotes: {},
        isBot: false,
        badges: badgeImages,
        badgeDetails,
        messageType: 'subgift',
      };

      onMessage(chatMessage);
    });

    // Handle community gifted subs (mass gifts)
    newClient.onCommunitySub((_channel, _user, giftInfo, msg) => {
      if (!active) return;
      const tier = giftInfo.plan === '3000' ? '3' : giftInfo.plan === '2000' ? '2' : '1';
      const giftMessage = `gifted ${giftInfo.count} Tier ${tier} subscriptions to the community!`;

      const badgeImages: Record<string, string> = {};
      const badgeDetails: Record<string, { url: string; title: string }> = {};
      msg.userInfo.badges.forEach((version, badgeName) => {
        const detail = getBadgeDetail(badgeName, version);
        if (detail) {
          badgeImages[badgeName] = detail.url;
          badgeDetails[badgeName] = { url: detail.url, title: detail.title };
        }
      });

      const chatMessage: ChatMessage = {
        id: msg.id,
        platform: 'twitch',
        author: msg.userInfo.displayName || msg.userInfo.userName || 'Anonymous',
        content: giftMessage,
        timestamp: msg.date,
        userId: msg.userInfo.userId,
        authorColor: msg.userInfo.color || '#FFFFFF',
        mentionsUser: false,
        emotes: {},
        isBot: false,
        badges: badgeImages,
        badgeDetails,
        messageType: 'subgift',
      };

      onMessage(chatMessage);
    });

    newClient.connect();

    setClient(newClient);

    return () => {
      active = false;
      if (newClient) {
        newClient.quit();
      }
    };
  }, [channelName, accessToken, username, onMessage, enabled, clientId, onOwnBadgesLoaded]);

  const sendMessage = useCallback(
    async (message: string, replyToMessageId?: string) => {
      if (!client || !isConnected) {
        throw new Error('Not connected to chat');
      }

      try {
        if (replyToMessageId) {
          // Twurple supports replies natively
          await client.say(channelName, message, { replyTo: replyToMessageId });
        } else {
          await client.say(channelName, message);
        }
      } catch (error) {
        console.error('Failed to send message:', error);
        throw error;
      }
    },
    [client, isConnected, channelName]
  );

  return { isConnected, sendMessage };
}
