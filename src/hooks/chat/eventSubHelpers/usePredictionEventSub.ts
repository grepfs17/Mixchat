/**
 * Subscribes to `channel.prediction.begin`, `channel.prediction.progress`,
 * `channel.prediction.lock`, and `channel.prediction.end` v1 via the shared
 * EventSub connection.
 *
 * Required scope: channel:read:predictions (or channel:manage:predictions)
 */

import { useEffect, useRef } from "react";
import { resolveBroadcasterId } from "../useEventSub";
import type { SubscribeFn } from "../useEventSub";

/**
 * Rich, event-shaped prediction outcome, superset of the slim display
 * variant in bannerTypes.PredictionOutcome. The transform from this shape to
 * the display shape happens in useLiveEvents, so this is intentionally NOT
 * exported under the same name as the banner type.
 */
interface EventPredictionOutcome {
  id: string;
  title: string;
  color: string;
  users?: number;
  channelPoints?: number;
  topPredictors?: Array<{
    userId: string;
    userName: string;
    userLogin: string;
    channelPointsUsed: number;
    channelPointsWon: number | null;
  }>;
}

interface PredictionEvent {
  id: string;
  broadcasterUserId: string;
  broadcasterUserName: string;
  title: string;
  outcomes: EventPredictionOutcome[];
  startedAt: string;
  locksAt?: string;
  lockedAt?: string;
  endedAt?: string;
  status?: string;
  winningOutcomeId?: string;
}

interface UsePredictionEventSubOptions {
  subscribe: SubscribeFn;
  channelId: string;
  enabled: boolean;
  onPredictionBegin: (event: PredictionEvent) => void;
  onPredictionProgress: (event: PredictionEvent) => void;
  onPredictionLock: (event: PredictionEvent) => void;
  onPredictionEnd: (event: PredictionEvent) => void;
  onScopeError?: () => void;
}

function parseOutcome(o: any): EventPredictionOutcome {
  return {
    id: o.id,
    title: o.title,
    color: o.color,
    users: o.users ?? 0,
    channelPoints: o.channel_points ?? 0,
    topPredictors: (o.top_predictors ?? []).map((p: any) => ({
      userId: String(p.user_id),
      userName: p.user_name,
      userLogin: p.user_login,
      channelPointsUsed: p.channel_points_used ?? 0,
      channelPointsWon: p.channel_points_won ?? null,
    })),
  };
}

function parsePredictionEvent(ev: any): PredictionEvent {
  return {
    id: ev.id,
    broadcasterUserId: ev.broadcaster_user_id,
    broadcasterUserName: ev.broadcaster_user_name,
    title: ev.title,
    outcomes: (ev.outcomes || []).map(parseOutcome),
    startedAt: ev.started_at,
    locksAt: ev.locks_at,
    lockedAt: ev.locked_at,
    endedAt: ev.ended_at,
    status: ev.status,
    winningOutcomeId: ev.winning_outcome_id,
  };
}

export type { PredictionEvent };

export function usePredictionEventSub({
  subscribe,
  channelId,
  enabled,
  onPredictionBegin,
  onPredictionProgress,
  onPredictionLock,
  onPredictionEnd,
  onScopeError,
}: UsePredictionEventSubOptions): void {
  const onBeginRef = useRef(onPredictionBegin);
  useEffect(() => {
    onBeginRef.current = onPredictionBegin;
  }, [onPredictionBegin]);

  const onProgressRef = useRef(onPredictionProgress);
  useEffect(() => {
    onProgressRef.current = onPredictionProgress;
  }, [onPredictionProgress]);

  const onLockRef = useRef(onPredictionLock);
  useEffect(() => {
    onLockRef.current = onPredictionLock;
  }, [onPredictionLock]);

  const onEndRef = useRef(onPredictionEnd);
  useEffect(() => {
    onEndRef.current = onPredictionEnd;
  }, [onPredictionEnd]);

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

      const unsubs = [
        subscribeRef.current(
          "channel.prediction.begin",
          "1",
          condition,
          (ev: any) => {
            onBeginRef.current(parsePredictionEvent(ev));
          },
          onScopeError,
        ),
        subscribeRef.current(
          "channel.prediction.progress",
          "1",
          condition,
          (ev: any) => {
            onProgressRef.current(parsePredictionEvent(ev));
          },
        ),
        subscribeRef.current(
          "channel.prediction.lock",
          "1",
          condition,
          (ev: any) => {
            onLockRef.current(parsePredictionEvent(ev));
          },
        ),
        subscribeRef.current(
          "channel.prediction.end",
          "1",
          condition,
          (ev: any) => {
            onEndRef.current(parsePredictionEvent(ev));
          },
        ),
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
  }, [channelId, enabled, onScopeError]);
}
