import { useEffect } from "react";
import type { ChatClient } from "@twurple/chat";
import type { TwitchMessage } from "../../../lib/types";
import {
  getUserInfo,
  getSourceChannelInfo,
  getRewardInfo,
  getCachedAvatar,
  getCachedRewardInfo,
  getCachedSourceChannelInfo,
} from "../../../lib/twitchChatCache";
import { extractBadges } from "../../../lib/twitchChatMessages";
import { parseGifsTag } from "../../../lib/twitchGifs";
import { playEventSound } from "../../../lib/eventSounds";
import { playMentionSound } from "../../../lib/twitchChatAudio";
import type { MentionSoundType } from "../../../lib/twitchChatAudio";

interface UseTwitchChatMessageHandlerOptions {
  client: ChatClient | null;
  enabled: boolean;
  onMessageRef: React.RefObject<(message: TwitchMessage) => void>;
  usernameRef: React.RefObject<string>;
  accessTokenRef: React.RefObject<string>;
  mentionSoundEnabledRef: React.RefObject<boolean>;
  mentionVolumeRef: React.RefObject<number>;
  mentionSoundTypeRef: React.RefObject<MentionSoundType>;
  eventSoundsRef: React.RefObject<Record<string, string>>;
  eventSoundVolumeRef: React.RefObject<number>;
  broadcasterIdRef: React.RefObject<string | null>;
  onOwnBadgesLoadedRef: React.RefObject<
    | ((
        badges: Record<string, string>,
        badgeDetails: Record<string, { url: string; title: string }>,
      ) => void)
    | undefined
  >;
}

export function useTwitchChatMessageHandler({
  client,
  enabled,
  onMessageRef,
  usernameRef,
  accessTokenRef,
  mentionSoundEnabledRef,
  mentionVolumeRef,
  mentionSoundTypeRef,
  eventSoundsRef,
  eventSoundVolumeRef,
  broadcasterIdRef,
  onOwnBadgesLoadedRef,
}: UseTwitchChatMessageHandlerOptions): void {
  useEffect(() => {
    if (!enabled || !client) return;

    let active = true;

    client.onMessage((_channel, _user, message, msg) => {
      if (!active) return;

      const replyInfo = msg.parentMessageId
        ? {
            id: msg.parentMessageId,
            author:
              msg.parentMessageUserDisplayName ||
              msg.parentMessageUserName ||
              "",
            content: msg.parentMessageText || "",
          }
        : undefined;

      const mentionsUser =
        message
          .toLowerCase()
          .includes(`@${usernameRef.current.toLowerCase()}`) ||
        replyInfo?.author.toLowerCase() === usernameRef.current.toLowerCase();

      const twitchEmotes: Record<string, string[]> = {};
      msg.emoteOffsets.forEach((offsets, emoteId) => {
        twitchEmotes[emoteId] = offsets;
      });

      const isBot = msg.userInfo.badges.has("bot");
      const { badges: badgeImages, badgeDetails } = extractBadges(msg.userInfo);
      const authorAvatar = getCachedAvatar(msg.userInfo.userId);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawTags = (msg as any).tags as Map<string, string> | undefined;
      const sourceRoomId: string | undefined =
        rawTags?.get("source-room-id") || undefined;
      const isGigantifiedEmote =
        rawTags?.get("msg-id") === "gigantified-emote-message";
      const powerUpTag = rawTags?.get("msg-param-power-up-type") || undefined;
      const powerUpType: "message_effect" | "celebration" | undefined =
        powerUpTag === "message_effect"
          ? "message_effect"
          : powerUpTag === "celebration"
            ? "celebration"
            : undefined;
      const messageEffectId =
        rawTags?.get("msg-param-power-up-id") || undefined;
      const cachedRewardInfo =
        msg.isRedemption && msg.rewardId
          ? getCachedRewardInfo(msg.rewardId)
          : undefined;
      const isFirstMessage = rawTags?.get("first-msg") === "1";
      const gifs = parseGifsTag(rawTags?.get("gifs"));
      const isSharedChat = Boolean(
        sourceRoomId && msg.channelId && sourceRoomId !== msg.channelId,
      );

      const cachedSourceInfo =
        isSharedChat && sourceRoomId
          ? getCachedSourceChannelInfo(sourceRoomId)
          : undefined;

      const isCurrentUser =
        msg.userInfo.userName.toLowerCase() ===
        usernameRef.current.toLowerCase();

      const chatMessage: TwitchMessage = {
        id: msg.id,
        platform: "twitch",
        author:
          msg.userInfo.displayName || msg.userInfo.userName || "Anonymous",
        userName: msg.userInfo.userName,
        content: message,
        timestamp: msg.date,
        userId: msg.userInfo.userId,
        authorColor: msg.userInfo.color || "#FFFFFF",
        authorAvatar,
        replyTo: replyInfo,
        mentionsUser,
        emotes: twitchEmotes,
        isBot,
        badges: badgeImages,
        badgeDetails,
        isCurrentUser,
        messageType: msg.isRedemption
          ? "redemption"
          : msg.isHighlight
            ? "highlight"
            : msg.isCheer
              ? "cheer"
              : "chat",
        rewardId: msg.isRedemption ? msg.rewardId || undefined : undefined,
        rewardTitle: cachedRewardInfo?.title,
        rewardCost: cachedRewardInfo?.cost,
        sourceChannelId: isSharedChat ? sourceRoomId : undefined,
        sourceChannelLogin: cachedSourceInfo?.login || undefined,
        sourceChannelAvatar: cachedSourceInfo?.avatar || undefined,
        isGigantifiedEmote,
        powerUpType,
        messageEffectId:
          powerUpType === "message_effect" ? messageEffectId : undefined,
        isFirstMessage,
        gifs: gifs.length ? gifs : undefined,
      };

      // The anonymous connection can't receive USERSTATE, so derive the
      // viewer's own badges from their own messages instead.
      if (isCurrentUser) {
        onOwnBadgesLoadedRef.current?.(badgeImages, badgeDetails);
      }

      const needsUserInfo = !authorAvatar && !!msg.userInfo.userId;
      const needsSourceAvatar =
        isSharedChat &&
        !!sourceRoomId &&
        !getCachedSourceChannelInfo(sourceRoomId);
      const needsRewardInfo =
        !!chatMessage.rewardId &&
        !chatMessage.rewardTitle &&
        !!broadcasterIdRef.current;

      if (needsUserInfo || needsSourceAvatar || needsRewardInfo) {
        const userInfoPromise =
          needsUserInfo && msg.userInfo.userId
            ? getUserInfo(msg.userInfo.userId, accessTokenRef.current)
            : Promise.resolve(null);
        const sourceInfoPromise =
          needsSourceAvatar && sourceRoomId
            ? getSourceChannelInfo(sourceRoomId, accessTokenRef.current)
            : Promise.resolve(null);
        const rewardInfoPromise =
          needsRewardInfo && chatMessage.rewardId && broadcasterIdRef.current
            ? getRewardInfo(
                chatMessage.rewardId,
                broadcasterIdRef.current,
                accessTokenRef.current,
              )
            : Promise.resolve(null);

        Promise.all([userInfoPromise, sourceInfoPromise, rewardInfoPromise])
          .then(([userInfoResult, sourceInfoResult, rewardInfoResult]) => {
            if (!active) return;
            const resolvedAvatar = (
              userInfoResult as { profileImageUrl?: string | null } | null
            )?.profileImageUrl;
            const resolvedSource = sourceInfoResult as {
              login: string | null;
              avatar: string | null;
            } | null;
            const resolvedReward = rewardInfoResult as {
              title: string | null;
              cost: number | null;
            } | null;
            onMessageRef.current({
              ...chatMessage,
              authorAvatar: resolvedAvatar || chatMessage.authorAvatar,
              sourceChannelLogin:
                resolvedSource?.login ||
                chatMessage.sourceChannelLogin ||
                undefined,
              sourceChannelAvatar:
                resolvedSource?.avatar ||
                chatMessage.sourceChannelAvatar ||
                undefined,
              rewardTitle: resolvedReward?.title || chatMessage.rewardTitle,
              rewardCost: resolvedReward?.cost ?? chatMessage.rewardCost,
            });
          })
          .catch(() => {
            if (!active) return;
            onMessageRef.current(chatMessage);
          });

        if (chatMessage.messageType === "redemption") {
          const soundData = eventSoundsRef.current["redemption"];
          if (soundData) {
            playEventSound(
              "redemption",
              soundData,
              eventSoundVolumeRef.current,
            );
          }
        }

        if (chatMessage.messageType === "highlight") {
          const soundData = eventSoundsRef.current["highlight"];
          if (soundData) {
            playEventSound("highlight", soundData, eventSoundVolumeRef.current);
          }
        }

        if (mentionsUser && mentionSoundEnabledRef.current) {
          playMentionSound(
            mentionVolumeRef.current,
            mentionSoundTypeRef.current,
          );
        }
        return;
      }

      onMessageRef.current(chatMessage);

      if (chatMessage.messageType === "redemption") {
        const soundData = eventSoundsRef.current["redemption"];
        if (soundData) {
          playEventSound("redemption", soundData, eventSoundVolumeRef.current);
        }
      }

      if (chatMessage.messageType === "highlight") {
        const soundData = eventSoundsRef.current["highlight"];
        if (soundData) {
          playEventSound("highlight", soundData, eventSoundVolumeRef.current);
        }
      }

      if (mentionsUser && mentionSoundEnabledRef.current) {
        playMentionSound(mentionVolumeRef.current, mentionSoundTypeRef.current);
      }
    });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, enabled]);
}
