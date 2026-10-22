import { useEffect } from "react";
import type { ChatClient } from "@twurple/chat";
import { UserNotice } from "@twurple/chat";
import type { TwitchMessage } from "../../../lib/types";
import {
  getUserInfo,
  getRewardInfo,
  getCachedAvatar,
  getCachedUserInfo,
} from "../../../lib/twitchChatCache";
import {
  createSystemMessage,
  buildUserTwitchMessage,
  shiftEmoteOffsets,
  parseBadgeString,
  extractBadges,
} from "../../../lib/twitchChatMessages";
import { playEventSound } from "../../../lib/eventSounds";
import type { MentionSoundType } from "../../../lib/twitchChatAudio";

function formatSubTier(plan: string): string {
  if (plan === "Prime") return "Prime";
  if (plan === "3000") return "Tier 3";
  if (plan === "2000") return "Tier 2";
  return "Tier 1";
}

function formatSubDuration(months: number): string {
  const count = Number.isFinite(months) && months > 0 ? months : 1;
  return `${count} ${count === 1 ? "month" : "months"}`;
}

// Twitch recurring plans are 3 or 6 months. Gift subs support 3, 6 or 12.
const SELF_MULTI_MONTH_PLANS = new Set([3, 6]);
const GIFT_MULTI_MONTH_DURATIONS = new Set([3, 6, 12]);

/**
 * Twitch sends the multi-month purchase length as the undocumented
 * `msg-param-multimonth-duration` tag on sub and resub USERNOTICEs.
 * Returns 0 when the subscription is a normal 1-month plan.
 */
function parseMultiMonthDuration(msg: UserNotice): number {
  const value = Number(msg.tags.get("msg-param-multimonth-duration"));
  return Number.isFinite(value) && value > 1 ? value : 0;
}

function isGiftedSubscription(
  msg: UserNotice,
  subInfo: { originalGiftInfo?: unknown },
): boolean {
  return (
    msg.tags.get("msg-param-was-gifted") === "true" ||
    Boolean(subInfo.originalGiftInfo)
  );
}

function formatSubDetails(
  plan: string,
  multiMonthDuration: number,
  gifted: boolean,
): string {
  const details = [formatSubTier(plan)];
  // Twitch only offers 3 and 6 month recurring plans. It also emits bogus
  // 12 month values on resubs, documented in twitchdev/issues/1112. Gifted
  // renewals are not paid by the viewer, so they do not get the suffix.
  if (!gifted && SELF_MULTI_MONTH_PLANS.has(multiMonthDuration)) {
    details.push(`${multiMonthDuration} months in advance`);
  }
  return details.join(", ");
}

interface UseTwitchChatEventHandlersOptions {
  client: ChatClient | null;
  enabled: boolean;
  onMessageRef: React.RefObject<(message: TwitchMessage) => void>;
  onMessageDeletedRef: React.RefObject<
    ((messageId: string) => void) | undefined
  >;
  usernameRef: React.RefObject<string>;
  accessTokenRef: React.RefObject<string>;
  eventSoundsRef: React.RefObject<Record<string, string>>;
  eventSoundVolumeRef: React.RefObject<number>;
  broadcasterIdRef: React.RefObject<string | null>;
  mentionSoundEnabledRef: React.RefObject<boolean>;
  mentionVolumeRef: React.RefObject<number>;
  mentionSoundTypeRef: React.RefObject<MentionSoundType>;
  onOwnBadgesLoadedRef: React.RefObject<
    | ((
        badges: Record<string, string>,
        badgeDetails: Record<string, { url: string; title: string }>,
      ) => void)
    | undefined
  >;
}

export function useTwitchChatEventHandlers({
  client,
  enabled,
  onMessageRef,
  onMessageDeletedRef,
  usernameRef,
  accessTokenRef,
  eventSoundsRef,
  eventSoundVolumeRef,
  broadcasterIdRef,
  onOwnBadgesLoadedRef,
}: UseTwitchChatEventHandlersOptions): void {
  useEffect(() => {
    if (!enabled || !client) return;

    let active = true;

    // The anonymous connection can't receive USERSTATE, so derive the
    // viewer's own badges from their own messages instead.
    const maybeLoadOwnBadges = (msg: {
      userInfo: { userName: string; badges: Map<string, string> };
    }): void => {
      if (
        msg.userInfo.userName.toLowerCase() ===
        usernameRef.current.toLowerCase()
      ) {
        const { badges, badgeDetails } = extractBadges(msg.userInfo);
        onOwnBadgesLoadedRef.current?.(badges, badgeDetails);
      }
    };

    client.onAction((_channel, _user, message, msg) => {
      if (!active) return;
      maybeLoadOwnBadges(msg);
      onMessageRef.current(
        buildUserTwitchMessage(msg, message, usernameRef.current, {
          messageType: "chat",
        }),
      );
    });

    client.onAnnouncement((_channel, _user, _announcementInfo, msg) => {
      if (!active) return;
      maybeLoadOwnBadges(msg);
      const emotes =
        msg.emoteOffsets.size > 0
          ? Object.fromEntries(msg.emoteOffsets)
          : undefined;
      const chatMessage = buildUserTwitchMessage(
        msg,
        msg.text ?? "",
        usernameRef.current,
        {
          messageType: "announcement",
          isBot: false,
          ...(emotes ? { emotes } : {}),
        },
      );
      const userId = msg.userInfo.userId;
      if (!getCachedAvatar(userId) && userId) {
        getUserInfo(userId, accessTokenRef.current)
          .then((info) => {
            if (!active) return;
            onMessageRef.current({
              ...chatMessage,
              authorAvatar:
                (info as { profileImageUrl?: string | null } | null)
                  ?.profileImageUrl || chatMessage.authorAvatar,
            });
          })
          .catch(() => {
            if (!active) return;
            onMessageRef.current(chatMessage);
          });
      } else {
        onMessageRef.current(chatMessage);
      }

      const soundData = eventSoundsRef.current["announcement"];
      if (soundData) {
        playEventSound("announcement", soundData, eventSoundVolumeRef.current);
      }
    });

    client.onRewardGift((_channel, _user, rewardGiftInfo, msg) => {
      if (!active) return;
      maybeLoadOwnBadges(msg);
      const content = `gifted ${rewardGiftInfo.count} reward${rewardGiftInfo.count > 1 ? "s" : ""} (${rewardGiftInfo.triggerType})`;
      onMessageRef.current(
        buildUserTwitchMessage(msg, content, usernameRef.current, {
          messageType: "reward-gift",
          isBot: false,
        }),
      );

      const soundData = eventSoundsRef.current["reward-gift"];
      if (soundData) {
        playEventSound("reward-gift", soundData, eventSoundVolumeRef.current);
      }
    });

    client.onRaidCancel((_channel) => {
      if (!active) return;
      onMessageRef.current(
        createSystemMessage("The raid was cancelled.", "notice"),
      );
    });

    client.onSlow((_channel, enabled, duration) => {
      if (!active) return;
      onMessageRef.current(
        createSystemMessage(
          enabled ? `Slow mode enabled (${duration}s).` : "Slow mode disabled.",
          "notice",
        ),
      );
    });

    client.onEmoteOnly((_channel, enabled) => {
      if (!active) return;
      onMessageRef.current(
        createSystemMessage(
          enabled ? "Emote-only mode enabled." : "Emote-only mode disabled.",
          "notice",
        ),
      );
    });

    client.onSubsOnly((_channel, enabled) => {
      if (!active) return;
      onMessageRef.current(
        createSystemMessage(
          enabled
            ? "Subscribers-only mode enabled."
            : "Subscribers-only mode disabled.",
          "notice",
        ),
      );
    });

    client.onFollowersOnly((_channel, enabled, duration) => {
      if (!active) return;
      const minutes = duration ?? 0;
      onMessageRef.current(
        createSystemMessage(
          enabled
            ? `Followers-only mode enabled (${minutes === 0 ? "any follow age" : `${minutes} min follow age`}).`
            : "Followers-only mode disabled.",
          "notice",
        ),
      );
    });

    client.onSub((_channel, _user, subInfo, msg) => {
      if (!active) return;
      maybeLoadOwnBadges(msg);
      const multiMonth = parseMultiMonthDuration(msg);
      const gifted = isGiftedSubscription(msg, subInfo);
      const prefix = `subscribed for ${formatSubDuration(subInfo.months)} (${formatSubDetails(subInfo.plan, multiMonth, gifted)})`;
      const content = subInfo.message
        ? `${prefix} - ${subInfo.message}`
        : prefix;
      const overrides: Partial<TwitchMessage> = { messageType: "subscription" };
      if (subInfo.message && msg.emoteOffsets.size > 0) {
        overrides.emotes = shiftEmoteOffsets(
          msg.emoteOffsets,
          prefix.length + 3,
        );
      }

      onMessageRef.current(
        buildUserTwitchMessage(msg, content, usernameRef.current, overrides),
      );

      const soundData = eventSoundsRef.current["subscription"];
      if (soundData) {
        playEventSound("subscription", soundData, eventSoundVolumeRef.current);
      }
    });

    client.onResub((_channel, _user, subInfo, msg) => {
      if (!active) return;
      maybeLoadOwnBadges(msg);
      const multiMonth = parseMultiMonthDuration(msg);
      const gifted = isGiftedSubscription(msg, subInfo);
      const prefix = `subscribed for ${formatSubDuration(subInfo.months)} (${formatSubDetails(subInfo.plan, multiMonth, gifted)})`;
      const content = subInfo.message
        ? `${prefix} - ${subInfo.message}`
        : prefix;
      const overrides: Partial<TwitchMessage> = { messageType: "resub" };
      if (subInfo.message && msg.emoteOffsets.size > 0) {
        overrides.emotes = shiftEmoteOffsets(
          msg.emoteOffsets,
          prefix.length + 3,
        );
      }

      onMessageRef.current(
        buildUserTwitchMessage(msg, content, usernameRef.current, overrides),
      );

      const soundData = eventSoundsRef.current["resub"];
      if (soundData) {
        playEventSound("resub", soundData, eventSoundVolumeRef.current);
      }
    });

    client.onSubGift((_channel, recipient, subInfo, msg) => {
      if (!active) return;
      maybeLoadOwnBadges(msg);
      const giftMonths = GIFT_MULTI_MONTH_DURATIONS.has(subInfo.giftDuration)
        ? subInfo.giftDuration
        : 0;
      const durationLabel = giftMonths ? `${giftMonths}-month ` : "";
      const content = `gifted a ${durationLabel}${formatSubTier(subInfo.plan)} subscription to ${recipient}`;

      onMessageRef.current(
        buildUserTwitchMessage(msg, content, usernameRef.current, {
          messageType: "subgift",
        }),
      );

      const soundData = eventSoundsRef.current["subgift"];
      if (soundData) {
        playEventSound("subgift", soundData, eventSoundVolumeRef.current);
      }
    });

    client.onCommunitySub((_channel, _user, giftInfo, msg) => {
      if (!active) return;
      maybeLoadOwnBadges(msg);
      const tier =
        giftInfo.plan === "3000" ? "3" : giftInfo.plan === "2000" ? "2" : "1";
      const content = `gifted ${giftInfo.count} Tier ${tier} subscriptions to the community!`;

      onMessageRef.current(
        buildUserTwitchMessage(msg, content, usernameRef.current, {
          messageType: "subgift",
        }),
      );

      const soundData = eventSoundsRef.current["subgift"];
      if (soundData) {
        playEventSound("subgift", soundData, eventSoundVolumeRef.current);
      }
    });

    client.onRaid((_channel, _user, raidInfo, msg) => {
      if (!active) return;
      maybeLoadOwnBadges(msg);
      const content = `is raiding with a party of ${raidInfo.viewerCount} viewers!`;

      onMessageRef.current(
        buildUserTwitchMessage(msg, content, usernameRef.current, {
          messageType: "raid",
          author:
            raidInfo.displayName ||
            msg.userInfo.displayName ||
            msg.userInfo.userName ||
            "Anonymous",
        }),
      );

      const soundData = eventSoundsRef.current["raid"];
      if (soundData) {
        playEventSound("raid", soundData, eventSoundVolumeRef.current);
      }
    });

    // Handle watch streaks & channel-point redemptions without user text
    client.irc.onTypedMessage(UserNotice, async (msg) => {
      if (!active) return;
      const msgId = msg.tags.get("msg-id");

      if (msgId === "channel_points_reward") {
        const rewardTitle =
          msg.tags.get("msg-param-reward-title") || "Channel Points Redemption";
        const rewardId = msg.tags.get("msg-param-reward-id") || undefined;
        const costTag = msg.tags.get("msg-param-cost");
        const costNum = costTag ? parseInt(costTag, 10) : undefined;
        const displayName =
          msg.tags.get("display-name") || msg.tags.get("login") || "Someone";
        const color = msg.tags.get("color") || "#c9a2ff";
        const userId = msg.tags.get("user-id") || undefined;
        const redemptionMsgId = msg.tags.get("id") || crypto.randomUUID();
        const userMessage = msg.text ?? "";
        const prefix = costNum
          ? `${rewardTitle} (${costNum} points)`
          : rewardTitle;
        const content = userMessage ? `${prefix} - ${userMessage}` : prefix;
        const { badges: badgeImages, badgeDetails } = parseBadgeString(
          msg.tags.get("badges") || "",
        );
        const cachedAvatar = getCachedAvatar(userId);

        let resolvedRewardTitle: string | undefined = rewardTitle;
        let resolvedRewardCost: number | undefined = costNum;
        if (!msg.tags.get("msg-param-reward-title") && rewardId) {
          const broadcasterId = broadcasterIdRef.current;
          if (broadcasterId) {
            const info = await getRewardInfo(
              rewardId,
              broadcasterId,
              accessTokenRef.current,
            );
            resolvedRewardTitle = info.title || undefined;
            resolvedRewardCost = info.cost ?? undefined;
          }
        }

        const chatMessage: TwitchMessage = {
          id: redemptionMsgId,
          platform: "twitch",
          author: displayName,
          content,
          timestamp: new Date(),
          userId,
          authorColor: color,
          authorAvatar: cachedAvatar || undefined,
          mentionsUser: false,
          emotes: {},
          isBot: false,
          badges: badgeImages,
          badgeDetails,
          messageType: "redemption",
          rewardId,
          rewardTitle: resolvedRewardTitle || rewardTitle,
          rewardCost: resolvedRewardCost,
        };

        const avatarPromise =
          !cachedAvatar && userId
            ? getUserInfo(userId, accessTokenRef.current)
            : Promise.resolve(null);

        const result = await avatarPromise;
        if (!active) return;
        onMessageRef.current({
          ...chatMessage,
          authorAvatar:
            (result as { profileImageUrl?: string | null } | null)
              ?.profileImageUrl || chatMessage.authorAvatar,
        });

        const soundData = eventSoundsRef.current["redemption"];
        if (soundData) {
          playEventSound("redemption", soundData, eventSoundVolumeRef.current);
        }
        return;
      }

      if (msgId !== "viewermilestone") return;
      if (msg.tags.get("msg-param-category") !== "watch-streak") return;

      const streakCount = msg.tags.get("msg-param-value") ?? "?";
      const displayName =
        msg.tags.get("display-name") || msg.tags.get("login") || "Someone";
      const color = msg.tags.get("color") || "#FFFFFF";
      const userId = msg.tags.get("user-id") || undefined;
      const streakMsgId = msg.tags.get("id") || crypto.randomUUID();
      const userMessage = msg.text ?? "";
      const prefix = userMessage
        ? `[${streakCount} streak] - `
        : `[${streakCount} streak]`;
      const content = userMessage ? `${prefix}${userMessage}` : prefix;

      let emotes: Record<string, string[]> | undefined;
      if (userMessage && msg.emoteOffsets.size > 0) {
        emotes = shiftEmoteOffsets(msg.emoteOffsets, prefix.length);
      }

      const cachedUserInfo = userId ? getCachedUserInfo(userId) : undefined;

      const chatMessage: TwitchMessage = {
        id: streakMsgId,
        platform: "twitch",
        author: displayName,
        content,
        timestamp: new Date(),
        userId,
        authorColor: color,
        authorAvatar: cachedUserInfo?.profileImageUrl || undefined,
        mentionsUser: false,
        emotes: emotes || {},
        isBot: false,
        badges: {},
        badgeDetails: {},
        messageType: "watch-streak",
      };

      if (!cachedUserInfo && userId) {
        getUserInfo(userId, accessTokenRef.current)
          .then((info) => {
            if (!active) return;
            onMessageRef.current({
              ...chatMessage,
              authorAvatar:
                (info as { profileImageUrl?: string | null } | null)
                  ?.profileImageUrl || undefined,
            });
          })
          .catch(() => {
            if (!active) return;
            onMessageRef.current(chatMessage);
          });
      } else {
        onMessageRef.current(chatMessage);
      }

      const soundData = eventSoundsRef.current["watch-streak"];
      if (soundData) {
        playEventSound("watch-streak", soundData, eventSoundVolumeRef.current);
      }
    });

    client.onTimeout((_channel, user, duration) => {
      if (!active) return;
      onMessageRef.current(
        createSystemMessage(
          `${user} was timed out for ${duration} seconds.`,
          "timeout",
          { targetUsername: user },
        ),
      );
    });

    client.onBan((_channel, user) => {
      if (!active) return;
      onMessageRef.current(
        createSystemMessage(`${user} was permanently banned.`, "ban", {
          targetUsername: user,
        }),
      );
    });

    client.onChatClear((_channel) => {
      if (!active) return;
      onMessageRef.current(
        createSystemMessage("Chat was cleared by a moderator.", "notice"),
      );
    });

    client.onMessageRemove((_channel, messageId) => {
      if (!active) return;
      console.log("[useTwitchChat] CLEARMSG received, messageId:", messageId);
      onMessageDeletedRef.current?.(messageId);
    });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, enabled]);
}
