/**
 * usePollEventSub
 *
 * Subscribes to `channel.poll.begin`, `channel.poll.progress`,
 * and `channel.poll.end` v1 via the shared EventSub connection.
 *
 * Required scope: channel:read:polls (or channel:manage:polls)
 */

import { useEffect, useRef } from "react";
import { resolveBroadcasterId } from "../useEventSub";
import type { SubscribeFn } from "../useEventSub";

interface PollChoice {
  id: string;
  title: string;
  bitsVotes?: number;
  channelPointsVotes?: number;
  votes: number;
}

interface PollEvent {
  id: string;
  broadcasterUserId: string;
  broadcasterUserName: string;
  title: string;
  choices: PollChoice[];
  bitsVoting: { isEnabled: boolean; amountPerVote: number };
  channelPointsVoting: { isEnabled: boolean; amountPerVote: number };
  startedAt: string;
  endsAt?: string;
  endedAt?: string;
  status?: string;
}

interface UsePollEventSubOptions {
  subscribe: SubscribeFn;
  channelId: string;
  enabled: boolean;
  onPollBegin: (event: PollEvent) => void;
  onPollProgress: (event: PollEvent) => void;
  onPollEnd: (event: PollEvent) => void;
  onScopeError?: () => void;
}

function parsePollChoice(c: any): PollChoice {
  return {
    id: c.id,
    title: c.title,
    bitsVotes: c.bits_votes ?? 0,
    channelPointsVotes: c.channel_points_votes ?? 0,
    votes: c.votes ?? 0,
  };
}

function parsePollEvent(ev: any): PollEvent {
  return {
    id: ev.id,
    broadcasterUserId: ev.broadcaster_user_id,
    broadcasterUserName: ev.broadcaster_user_name,
    title: ev.title,
    choices: (ev.choices || []).map(parsePollChoice),
    bitsVoting: {
      isEnabled: ev.bits_voting?.is_enabled ?? false,
      amountPerVote: ev.bits_voting?.amount_per_vote ?? 0,
    },
    channelPointsVoting: {
      isEnabled: ev.channel_points_voting?.is_enabled ?? false,
      amountPerVote: ev.channel_points_voting?.amount_per_vote ?? 0,
    },
    startedAt: ev.started_at,
    endsAt: ev.ends_at,
    endedAt: ev.ended_at,
    status: ev.status,
  };
}

export type { PollEvent, PollChoice };

export function usePollEventSub({
  subscribe,
  channelId,
  enabled,
  onPollBegin,
  onPollProgress,
  onPollEnd,
  onScopeError,
}: UsePollEventSubOptions): void {
  const onBeginRef = useRef(onPollBegin);
  useEffect(() => {
    onBeginRef.current = onPollBegin;
  }, [onPollBegin]);

  const onProgressRef = useRef(onPollProgress);
  useEffect(() => {
    onProgressRef.current = onPollProgress;
  }, [onPollProgress]);

  const onEndRef = useRef(onPollEnd);
  useEffect(() => {
    onEndRef.current = onPollEnd;
  }, [onPollEnd]);

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
          "channel.poll.begin",
          "1",
          condition,
          (ev: any) => {
            onBeginRef.current(parsePollEvent(ev));
          },
          onScopeError,
        ),
        subscribeRef.current(
          "channel.poll.progress",
          "1",
          condition,
          (ev: any) => {
            onProgressRef.current(parsePollEvent(ev));
          },
        ),
        subscribeRef.current(
          "channel.poll.end",
          "1",
          condition,
          (ev: any) => {
            onEndRef.current(parsePollEvent(ev));
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