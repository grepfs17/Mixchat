/**
 * useRaidDetection
 *
 * Subscribes to `channel.raid` via the shared EventSub connection.
 * Supports both outgoing raids (isInitiator=true) and incoming raids (isInitiator=false).
 *
 * No special OAuth scopes required.
 *
 * The broadcaster ID is resolved in a separate effect from the subscription
 * to avoid a race condition where the async resolution causes the handler
 * to be deleted from the subscription map before notifications arrive.
 */

import { useEffect, useRef, useState } from "react";
import { resolveBroadcasterId } from "../useEventSub";
import type { SubscribeFn } from "../useEventSub";

export interface RaidOutEvent {
  fromLogin: string;
  fromDisplayName: string;
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

  // Step 1: Resolve broadcaster ID asynchronously
  const [resolvedId, setResolvedId] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !channelId) {
      setResolvedId(null);
      return;
    }

    // If already numeric, resolve synchronously via setState
    if (/^\d+$/.test(channelId)) {
      setResolvedId(channelId);
      return;
    }

    let cancelled = false;

    const resolve = async () => {
      try {
        const resolved = await resolveBroadcasterId(channelId);
        if (!cancelled && resolved && /^\d+$/.test(resolved)) {
          setResolvedId(resolved);
        }
      } catch {
        // Resolution failed — leave resolvedId as null
      }
    };

    resolve();

    return () => {
      cancelled = true;
    };
  }, [channelId, enabled]);

  // Step 2: Subscribe synchronously when resolved ID is available
  useEffect(() => {
    if (!resolvedId) return;

    const condition: Record<string, string> = isInitiator
      ? { from_broadcaster_user_id: resolvedId }
      : { to_broadcaster_user_id: resolvedId };

    return subscribeRef.current(
      "channel.raid",
      "1",
      condition,
      (ev: any) => {
        onRaidRef.current({
          fromLogin: ev.from_broadcaster_user_login as string,
          fromDisplayName: ev.from_broadcaster_user_name as string,
          targetLogin: ev.to_broadcaster_user_login as string,
          targetDisplayName: ev.to_broadcaster_user_name as string,
          viewerCount: ev.viewers as number,
        });
      },
      onScopeError,
    );
  }, [resolvedId, isInitiator, onScopeError]);
}
