import { useState, useEffect, useCallback } from 'react';
import { StaticAuthProvider } from '@twurple/auth';
import { ChatClient } from '@twurple/chat';
import { getBadgeDetail } from '../lib/badges';
import type { ChatMessage } from '../lib/types';

// Cache for user info - limit to 500 entries for memory efficiency
const userInfoCache = new Map<string, { displayName: string; profileImageUrl: string | null }>();
const MAX_CACHE_SIZE = 500;
const NOTIFICATION_AUDIO_VOLUME = 0.3;

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

export function useTwitchChat(
  channelName: string,
  accessToken: string,
  username: string,
  onMessage: (message: ChatMessage) => void,
  enabled: boolean = true,
  mentionSoundEnabled: boolean = true
) {
  const [isConnected, setIsConnected] = useState(false);
  const [client, setClient] = useState<ChatClient | null>(null);

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
      };

      if (!cachedUserInfo && msg.userInfo.userId) {
        getUserInfo(msg.userInfo.userId, accessToken).then((userInfo) => {
          if (userInfo?.profileImageUrl) {
            onMessage({
              ...chatMessage,
              authorAvatar: userInfo.profileImageUrl,
            });
            return;
          }
          onMessage(chatMessage);
        }).catch(() => {
          onMessage(chatMessage);
        });
      } else {
        onMessage(chatMessage);
      }

      if (mentionsUser && mentionSoundEnabled) {
        try {
          const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGG2S36+OZSgwOUKXh8bllHgU2jtXywH0pBSl+zPLaizsIGGS56+idTgwNU6rm8bllHAU5kdXx');
          audio.volume = NOTIFICATION_AUDIO_VOLUME;
          audio.play().catch(() => { });
        } catch (e) { }
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
  }, [channelName, accessToken, username, onMessage, enabled, clientId]);

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
