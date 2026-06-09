/**
 * useHypeTrainEventSub
 *
 * Subscribes to `channel.hype_train.begin`, `channel.hype_train.progress`,
 * and `channel.hype_train.end` v2 via the shared EventSub connection.
 *
 * Required scope: channel:read:hype_train
 */

import { useEffect, useRef } from "react";
import { useEventSub, resolveBroadcasterId } from "./useEventSub";

interface HypeTrainEvent {
  id: string;
  broadcasterUserId: string;
  broadcasterUserName: string;
  level: number;
  total: number;
  progress: number;
  goal: number;
  topContributions: Array<{
    userId: string;
    userName: string;
    displayName: string;
    type: string;
    total: number;
  }>;
  lastContribution?: {
    userId: string;
    userName: string;
    displayName: string;
    type: string;
    total: number;
  };
  startedAt: string;
  expiresAt: string;
  cooldownEndsAt?: string;
}

interface UseHypeTrainEventSubOptions {
  channelId: string;
  accessToken: string;
  clientId: string;
  enabled: boolean;
  onHypeTrainBegin: (event: HypeTrainEvent) => void;
  onHypeTrainProgress: (event: HypeTrainEvent) => void;
  onHypeTrainEnd: (event: HypeTrainEvent) => void;
  onScopeError?: () => void;
}

function parseHypeTrainEvent(ev: any): HypeTrainEvent {
  return {
    id: ev.id,
    broadcasterUserId: ev.broadcaster_user_id,
    broadcasterUserName: ev.broadcaster_user_name,
    level: ev.level,
    total: ev.total,
    progress: ev.progress,
    goal: ev.goal,
    topContributions: (ev.top_contributions || []).map((c: any) => ({
      userId: c.user_id,
      userName: c.user_name,
      displayName: c.display_name || c.user_name,
      type: c.type,
      total: c.total,
    })),
    startedAt: ev.started_at,
    expiresAt: ev.expires_at,
    cooldownEndsAt: ev.cooldown_ends_at,
  };
}

export function useHypeTrainEventSub({
  channelId,
  accessToken,
  clientId,
  enabled,
  onHypeTrainBegin,
  onHypeTrainProgress,
  onHypeTrainEnd,
  onScopeError,
}: UseHypeTrainEventSubOptions): void {
  const onBeginRef = useRef(onHypeTrainBegin);
  useEffect(() => { onBeginRef.current = onHypeTrainBegin; }, [onHypeTrainBegin]);

  const onProgressRef = useRef(onHypeTrainProgress);
  useEffect(() => { onProgressRef.current = onHypeTrainProgress; }, [onHypeTrainProgress]);

  const onEndRef = useRef(onHypeTrainEnd);
  useEffect(() => { onEndRef.current = onHypeTrainEnd; }, [onHypeTrainEnd]);

  const { subscribe } = useEventSub({ accessToken, clientId, enabled });

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

      const unsubs = [
        subscribe("channel.hype_train.begin", "2", condition, (ev: any) => {
          onBeginRef.current(parseHypeTrainEvent(ev));
        }, onScopeError),
        subscribe("channel.hype_train.progress", "2", condition, (ev: any) => {
          onProgressRef.current(parseHypeTrainEvent(ev));
        }),
        subscribe("channel.hype_train.end", "2", condition, (ev: any) => {
          onEndRef.current(parseHypeTrainEvent(ev));
        }),
      ];

      return () => unsubs.forEach((fn) => fn());
    };

    let cleanup: (() => void) | undefined;
    setup().then((fn) => {
      if (!cancelled) cleanup = fn;
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [channelId, enabled, subscribe, onScopeError]);
}
