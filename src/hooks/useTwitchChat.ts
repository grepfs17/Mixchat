import { useState, useEffect, useCallback, useRef } from 'react';
import { StaticAuthProvider } from '@twurple/auth';
import { ChatClient, UserState, UserNotice } from '@twurple/chat';
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

// Twitch IRC does NOT send the reward title in the message tags (only
// the reward ID is present). We fetch the title from the Helix API once and
// cache it so subsequent redemptions of the same reward are instant.
const rewardTitleCache = new Map<string, string>();

async function getRewardTitle(
  rewardId: string,
  broadcasterId: string,
  accessToken: string,
): Promise<string | null> {
  if (rewardTitleCache.has(rewardId)) {
    return rewardTitleCache.get(rewardId)!;
  }

  try {
    const response = await fetch(
      `/api/twitch-proxy?path=/helix/channel_points/custom_rewards&broadcaster_id=${broadcasterId}&id=${encodeURIComponent(rewardId)}`,
    );
    if (response.ok) {
      const data = await response.json();
      const title: string | undefined = data?.data?.[0]?.title;
      if (title) {
        rewardTitleCache.set(rewardId, title);
        return title;
      } else {
        console.warn('[getRewardTitle] API returned ok but no title found. Response:', data);
      }
    } else {
      const body = await response.text().catch(() => '(unreadable)');
      console.warn(`[getRewardTitle] API returned ${response.status} for rewardId=${rewardId} broadcasterId=${broadcasterId}. Body:`, body);
    }
  } catch (error) {
    console.error('Failed to fetch reward title:', error);
  }

  return null;
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
    ctx.resume().catch(() => { });
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
        case 'ding': beep(880, 0, 0.25); break;
        case 'double': beep(880, 0, 0.1); beep(880, 0.18, 0.1); break;
        case 'chime': beep(1047, 0, 0.2); beep(784, 0.22, 0.2); break;
        case 'pop': beep(440, 0, 0.08, 'square'); break;
        case 'ping': beep(1200, 0, 0.4); break;
      }
    } catch { /* audio not supported */ }
  };

  if (ctx.state === 'suspended') {
    ctx.resume().then(play).catch(() => { });
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
  onOwnBadgesLoaded?: (badges: Record<string, string>, badgeDetails: Record<string, { url: string; title: string }>) => void,
  onMessageDeleted?: (messageId: string) => void,
) {
  const [isConnected, setIsConnected] = useState(false);
  const [client, setClient] = useState<ChatClient | null>(null);
  const [slowModeWaitTime, setSlowModeWaitTime] = useState<number | null>(null);
  // null = follower mode off, 0 = any follower, N = must have followed for N minutes
  const [followerModeMinutes, setFollowerModeMinutes] = useState<number | null>(null);

  // Refs so the stale closure inside the IRC handler always reads the latest
  // values without tearing down and rebuilding the WebSocket.
  const mentionSoundEnabledRef = useRef(mentionSoundEnabled);
  const mentionVolumeRef = useRef(mentionVolume);
  const mentionSoundTypeRef = useRef(mentionSoundType);
  const onMessageDeletedRef = useRef(onMessageDeleted);
  // Broadcaster ID is resolved once in onConnect and reused by onMessage to
  // look up reward titles without re-fetching the users endpoint each time.
  const broadcasterIdRef = useRef<string | null>(null);
  // A promise that resolves to the broadcaster ID once fetched; redemptions
  // that arrive before the ID is ready can await this instead of skipping.
  const broadcasterIdResolveRef = useRef<((id: string) => void) | null>(null);
  const broadcasterIdPromiseRef = useRef<Promise<string>>(new Promise<string>((resolve) => {
    broadcasterIdResolveRef.current = resolve;
  }));
  useEffect(() => { mentionSoundEnabledRef.current = mentionSoundEnabled; }, [mentionSoundEnabled]);
  useEffect(() => { mentionVolumeRef.current = mentionVolume; }, [mentionVolume]);
  useEffect(() => { mentionSoundTypeRef.current = mentionSoundType; }, [mentionSoundType]);
  useEffect(() => { onMessageDeletedRef.current = onMessageDeleted; }, [onMessageDeleted]);

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

      // Fetch channel chat settings
      (async () => {
        try {
          // Step 1: resolve login name → broadcaster ID
          const usersRes = await fetch(
            `/api/twitch-proxy?path=/helix/users&login=${encodeURIComponent(channelName)}`,
          );
          if (!usersRes.ok) return;
          const usersData = await usersRes.json();
          const broadcasterId: string | undefined = usersData?.data?.[0]?.id;
          if (!broadcasterId) return;
          if (active) {
            broadcasterIdRef.current = broadcasterId;
            broadcasterIdResolveRef.current?.(broadcasterId);
          }

          // Step 2: fetch chat settings
          const settingsRes = await fetch(
            `/api/twitch-proxy?path=/helix/chat/settings&broadcaster_id=${broadcasterId}`,
          );
          if (!settingsRes.ok) return;
          const settingsData = await settingsRes.json();
          console.log('[useTwitchChat] chat settings response:', settingsData);
          const slowMode: boolean = settingsData?.data?.[0]?.slow_mode ?? false;
          const waitTime: number | null = slowMode
            ? (settingsData?.data?.[0]?.slow_mode_wait_time ?? 30)
            : null;
          console.log(`[useTwitchChat] slow_mode=${slowMode}, slow_mode_wait_time=${waitTime} for channel "${channelName}"`);
          const followerMode: boolean = settingsData?.data?.[0]?.follower_mode ?? false;
          const followerMinutes: number | null = followerMode
            ? (settingsData?.data?.[0]?.follower_mode_duration ?? 0)
            : null;
          console.log(`[useTwitchChat] follower_mode=${followerMode}, follower_mode_duration=${followerMinutes} for channel "${channelName}"`);
          if (active) {
            setSlowModeWaitTime(waitTime);
            setFollowerModeMinutes(followerMinutes);
          }

          // Step 3: pre-fetch ALL custom rewards and cache their titles so that
          // when a redemption IRC message arrives, the title is already in cache.
          // This only succeeds when the logged-in user is the broadcaster of this
          // channel (Twitch requires channel:read:redemptions AND the token user
          // must match the broadcaster). For viewers it returns 403 — that's fine.
          try {
            const rewardsRes = await fetch(
              `/api/twitch-proxy?path=/helix/channel_points/custom_rewards&broadcaster_id=${broadcasterId}`,
            );
            if (rewardsRes.ok) {
              const rewardsData = await rewardsRes.json();
              const rewards: { id: string; title: string }[] = rewardsData?.data ?? [];
              rewards.forEach((r) => {
                if (r.id && r.title) rewardTitleCache.set(r.id, r.title);
              });
              console.log(`[useTwitchChat] Pre-cached ${rewards.length} custom reward title(s) for channel "${channelName}"`);
            } else {
              const body = await rewardsRes.text().catch(() => '(unreadable)');
              console.info(`[useTwitchChat] Could not pre-fetch custom rewards (${rewardsRes.status}) — reward titles will not be shown. This is expected when viewing another broadcaster's channel. Body:`, body);
            }
          } catch {
            // Non-fatal — viewers will simply not see reward titles
          }
        } catch {
          // Non-fatal
        }
      })();
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
      // NOTE: Twitch IRC does NOT send a reward title tag — only the reward ID
      // is present. We resolve the title from the cache populated by getRewardTitle.
      const cachedRewardTitle = (msg.isRedemption && msg.rewardId)
        ? rewardTitleCache.get(msg.rewardId)
        : undefined;
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
        rewardTitle: cachedRewardTitle,
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
      // Fetch reward title when there is a rewardId and no cached title yet.
      // Even if broadcasterIdRef is not populated yet, we still need to fetch;
      // in that case we await the broadcasterIdPromise so we don't miss it.
      const needsRewardTitle = !!chatMessage.rewardId && !chatMessage.rewardTitle;

      if (needsUserInfo || needsSourceAvatar || needsRewardTitle) {
        const userInfoPromise = needsUserInfo && msg.userInfo.userId
          ? getUserInfo(msg.userInfo.userId, accessToken)
          : Promise.resolve(null);
        const sourceInfoPromise = needsSourceAvatar && sourceRoomId
          ? getSourceChannelInfo(sourceRoomId, accessToken)
          : Promise.resolve(null);
        const rewardTitlePromise = (needsRewardTitle && chatMessage.rewardId)
          ? (broadcasterIdRef.current
            ? getRewardTitle(chatMessage.rewardId, broadcasterIdRef.current, accessToken)
            : broadcasterIdPromiseRef.current.then((broadcasterId) =>
              getRewardTitle(chatMessage.rewardId!, broadcasterId, accessToken)
            )
          )
          : Promise.resolve(null);

        Promise.all([userInfoPromise, sourceInfoPromise, rewardTitlePromise]).then(([userInfoResult, sourceInfoResult, rewardTitleResult]) => {
          const resolvedAvatar = (userInfoResult as { profileImageUrl?: string | null } | null)?.profileImageUrl;
          const resolvedSource = sourceInfoResult as { login: string | null; avatar: string | null } | null;
          onMessage({
            ...chatMessage,
            authorAvatar: resolvedAvatar || chatMessage.authorAvatar,
            sourceChannelLogin: resolvedSource?.login || chatMessage.sourceChannelLogin || undefined,
            sourceChannelAvatar: resolvedSource?.avatar || chatMessage.sourceChannelAvatar || undefined,
            rewardTitle: (rewardTitleResult as string | null) || chatMessage.rewardTitle,
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

    newClient.onRaid((_channel, _user, raidInfo, msg) => {
      if (!active) return;
      const raidMessage = `is raiding with a party of ${raidInfo.viewerCount} viewers!`;

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
        author: raidInfo.displayName || msg.userInfo.displayName || msg.userInfo.userName || 'Anonymous',
        content: raidMessage,
        timestamp: msg.date,
        userId: msg.userInfo.userId,
        authorColor: msg.userInfo.color || '#FFFFFF',
        mentionsUser: false,
        emotes: {},
        isBot: false,
        badges: badgeImages,
        badgeDetails,
        messageType: 'raid',
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

    // Handle watch streaks (viewermilestone USERNOTICE — no dedicated Twurple event)
    newClient.irc.onTypedMessage(UserNotice, (msg) => {
      if (!active) return;
      if (msg.tags.get('msg-id') !== 'viewermilestone') return;
      if (msg.tags.get('msg-param-category') !== 'watch-streak') return;

      const streakCount = msg.tags.get('msg-param-value') ?? '?';
      const displayName = msg.tags.get('display-name') || msg.tags.get('login') || 'Someone';
      const color = msg.tags.get('color') || '#FFFFFF';
      const userId = msg.tags.get('user-id') || undefined;
      const msgId = msg.tags.get('id') || crypto.randomUUID();
      const userMessage = msg.text ?? '';

      const cachedUserInfo = userId ? userInfoCache.get(userId) : undefined;

      const chatMessage: ChatMessage = {
        id: msgId,
        platform: 'twitch',
        author: displayName,
        content: userMessage ? `[${streakCount} streak] - ${userMessage}` : `[${streakCount} streak]`,
        timestamp: new Date(),
        userId,
        authorColor: color,
        authorAvatar: cachedUserInfo?.profileImageUrl || undefined,
        mentionsUser: false,
        emotes: {},
        isBot: false,
        badges: {},
        badgeDetails: {},
        messageType: 'watch-streak',
      };

      if (!cachedUserInfo && userId) {
        getUserInfo(userId, accessToken).then((info) => {
          onMessage({
            ...chatMessage,
            authorAvatar: (info as { profileImageUrl?: string | null } | null)?.profileImageUrl || undefined,
          });
        }).catch(() => onMessage(chatMessage));
      } else {
        onMessage(chatMessage);
      }
    });

    // DEV ONLY: expose a manual test helper so you can call
    // window.__testDeleteMessage('some-msg-id') from the browser console
    if (typeof window !== 'undefined') {
      (window as any).__testDeleteMessage = (id: string) => {
        console.log('[useTwitchChat] Manual delete test for id:', id);
        onMessageDeletedRef.current?.(id);
      };
    }

    newClient.onMessageRemove((_channel, messageId) => {
      if (!active) return;
      console.log('[useTwitchChat] CLEARMSG received, messageId:', messageId);
      onMessageDeletedRef.current?.(messageId);
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

  return { isConnected, sendMessage, slowModeWaitTime, followerModeMinutes };
}
