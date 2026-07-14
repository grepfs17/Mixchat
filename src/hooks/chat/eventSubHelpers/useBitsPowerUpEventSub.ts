/**
 * useBitsPowerUpEventSub
 *
 * Subscribes to `channel.bits.use` v2 via the shared EventSub connection
 * to detect Celebration power-ups and show a banner overlay.
 *
 * Required scope: bits:read
 */

import { useEffect, useRef } from "react";
import { resolveBroadcasterId } from "../useEventSub";
import type { SubscribeFn } from "../useEventSub";
import type { CelebrationState } from "../../../components/chat/shared/bannerTypes";

interface BitsUseEvent {
  id: string;
  broadcasterUserId: string;
  broadcasterUserName: string;
  userDisplayName: string;
  userName: string;
  userId: string;
  bitsUsed: number;
  totalBitsUsed: number;
  isAnonymous: boolean;
  powerUp?: {
    type: "message_effect" | "celebration" | "gigantify_an_emote";
    messageEffectId?: string | null;
    emote?: {
      id: string;
      setId: string;
    } | null;
  } | null;
  chatMessage?: string;
}

interface UseBitsPowerUpEventSubOptions {
  subscribe: SubscribeFn;
  channelId: string;
  enabled: boolean;
  onCelebration: (event: CelebrationState) => void;
  onScopeError?: () => void;
}

function parseBitsUseEvent(ev: any): BitsUseEvent {
  return {
    id: ev.id,
    broadcasterUserId: ev.broadcaster_user_id,
    broadcasterUserName: ev.broadcaster_user_name,
    userDisplayName: ev.user_display_name || ev.user_name,
    userName: ev.user_login || ev.user_name,
    userId: ev.user_id,
    bitsUsed: ev.bits_used ?? 0,
    totalBitsUsed: ev.total_bits_used ?? 0,
    isAnonymous: ev.is_anonymous ?? false,
    powerUp: ev.power_up
      ? {
          type: ev.power_up.type,
          messageEffectId: ev.power_up.message_effect_id ?? null,
          emote: ev.power_up.emote
            ? {
                id: ev.power_up.emote.id,
                setId: ev.power_up.emote.set_id,
              }
            : null,
        }
      : null,
    chatMessage: ev.chat_message,
  };
}

export type { BitsUseEvent };

export function useBitsPowerUpEventSub({
  subscribe,
  channelId,
  enabled,
  onCelebration,
  onScopeError,
}: UseBitsPowerUpEventSubOptions): void {
  const onCelebrationRef = useRef(onCelebration);
  useEffect(() => {
    onCelebrationRef.current = onCelebration;
  }, [onCelebration]);

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

      const condition = { broadcaster_user_id: numericId };

      const unsub = subscribeRef.current(
        "channel.bits.use",
        "2",
        condition,
        (ev: any) => {
          const parsed = parseBitsUseEvent(ev);
          if (parsed.powerUp?.type === "celebration") {
            onCelebrationRef.current({
              id: parsed.id,
              userName: parsed.userName,
              userDisplayName: parsed.userDisplayName,
              bitsUsed: parsed.bitsUsed,
              totalBitsUsed: parsed.totalBitsUsed,
              messageEffectId: parsed.powerUp.messageEffectId ?? null,
              endsAt: new Date(Date.now() + 5000),
            });
          }
        },
        onScopeError,
      );

      return () => unsub();
    };

    let cleanup: (() => void) | undefined;
    setup().then((fn) => {
      if (!cancelled) cleanup = fn;
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [channelId, enabled, onScopeError]);
}
