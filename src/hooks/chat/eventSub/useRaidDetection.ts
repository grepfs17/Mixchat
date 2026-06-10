/**
 * useRaidDetection
 *
 * Subscribes to `channel.raid` via the shared EventSub connection.
 * Supports both outgoing raids (isInitiator=true) and incoming raids (isInitiator=false).
 *
 * No special OAuth scopes required.
 */

import { useEffect, useRef } from "react";
import { resolveBroadcasterId } from "./useEventSub";
import type { SubscribeFn } from "./useEventSub";

export interface RaidOutEvent {
  targetLogin: string;
  targetDisplayName: string;
  viewerCount: number;
}

interface UseRaidDetectionOptions {
  subscribe: SubscribeFn;
  channelId: string;
  enabled: boolean;
  isInitiator: boolean;
  onRaid: (event: RaidOutEvent) => void;
  onScopeError?: () => void;
}

export function useRaidDetection({
  subscribe,
  channelId,
  enabled,
  isInitiator,
  onRaid,
  onScopeError,
}: UseRaidDetectionOptions): void {
  const onRaidRef = useRef(onRaid);
  useEffect(() => {
    onRaidRef.current = onRaid;
  }, [onRaid]);

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

      const condition: Record<string, string> = isInitiator
        ? { from_broadcaster_user_id: numericId }
        : { to_broadcaster_user_id: numericId };

      return subscribeRef.current(
        "channel.raid",
        "1",
        condition,
        (ev: any) => {
          onRaidRef.current({
            targetLogin: ev.to_broadcaster_user_login as string,
            targetDisplayName: ev.to_broadcaster_user_name as string,
            viewerCount: ev.viewers as number,
          });
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
  }, [channelId, enabled, isInitiator, onScopeError]);
}
