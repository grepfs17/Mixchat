/**
 * useChannelPointRedemptions
 *
 * Subscribes to `channel.channel_points_custom_reward_redemption.add`
 * via the shared EventSub connection.
 *
 * Required scope: channel:read:redemptions
 */

import { useEffect, useRef } from "react";
import { useEventSub, resolveBroadcasterId } from "./useEventSub";
import type { TwitchMessage } from "../../../lib/types";

interface RedemptionEvent {
  id: string;
  userId: string;
  userName: string;
  userDisplayName: string;
  rewardId: string;
  rewardTitle: string;
  rewardCost: number;
  userInput: string;
  redeemedAt: string;
}

interface UseChannelPointRedemptionsOptions {
  channelId: string;
  accessToken: string;
  clientId: string;
  enabled: boolean;
  onRedemption: (message: TwitchMessage) => void;
  onScopeError?: () => void;
}

export function useChannelPointRedemptions({
  channelId,
  accessToken,
  clientId,
  enabled,
  onRedemption,
  onScopeError,
}: UseChannelPointRedemptionsOptions): void {
  const onRedemptionRef = useRef(onRedemption);
  useEffect(() => {
    onRedemptionRef.current = onRedemption;
  }, [onRedemption]);

  const { subscribe } = useEventSub({ accessToken, clientId, enabled });
  const subscribeRef = useRef(subscribe);
  useEffect(() => {
    subscribeRef.current = subscribe;
  }, [subscribe]);

  useEffect(() => {
    if (!enabled || !channelId) return;

    let cancelled = false;

    const setup = async () => {
      let numericId = channelId;
      if (!/^\d+$/.test(channelId)) {
        try {
          const resolved = await resolveBroadcasterId(channelId);
          if (!resolved || !/^\d+$/.test(resolved)) return;
          numericId = resolved;
        } catch {
          return;
        }
      }

      if (cancelled) return;

      return subscribeRef.current(
        "channel.channel_points_custom_reward_redemption.add",
        "1",
        { broadcaster_user_id: numericId },
        (ev: any) => {
          const userInput: string = (ev.user_input as string) ?? "";
          if (userInput.trim().length > 0) return;

          const redemptionEvent: RedemptionEvent = {
            id: ev.id as string,
            userId: ev.user_id as string,
            userName: ev.user_login as string,
            userDisplayName: ev.user_name as string,
            rewardId: ev.reward?.id as string,
            rewardTitle: ev.reward?.title as string,
            rewardCost: Number(ev.reward?.cost ?? 0),
            userInput: userInput.trim(),
            redeemedAt: ev.redeemed_at as string,
          };

          const chatMessage: TwitchMessage = {
            id: `redemption-${redemptionEvent.id}`,
            platform: "twitch",
            author: redemptionEvent.userDisplayName || redemptionEvent.userName,
            content: `${redemptionEvent.userDisplayName || redemptionEvent.userName} redeemed ${redemptionEvent.rewardTitle}`,
            timestamp: new Date(redemptionEvent.redeemedAt),
            userId: redemptionEvent.userId,
            authorColor: "#c9a2ff",
            mentionsUser: false,
            emotes: {},
            isBot: false,
            badges: {},
            badgeDetails: {},
            messageType: "redemption",
            rewardId: redemptionEvent.rewardId,
            rewardTitle: redemptionEvent.rewardTitle,
            rewardCost: redemptionEvent.rewardCost,
          };

          onRedemptionRef.current(chatMessage);
        },
        onScopeError,
      );
    };

    let unsub: (() => void) | undefined;
    setup().then((fn) => {
      if (!cancelled) unsub = fn;
    });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [channelId, enabled, onScopeError]);
}
