/**
 * Subscribes to `channel.raid` for outgoing (isInitiator=true) and incoming
 * raids. No special OAuth scopes required.
 *
 * The broadcaster ID is resolved in a separate effect so async resolution
 * cannot delete the handler from the subscription map before notifications
 * arrive.
 */

import { useEffect, useMemo, useRef, useState } from "react";
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

  const derivedId = useMemo(() => {
    if (!enabled || !channelId) return null;
    if (/^\d+$/.test(channelId)) return channelId;
    return null;
  }, [channelId, enabled]);

  // Username → numeric ID resolution for non-numeric channel IDs.
  const [asyncResolvedId, setAsyncResolvedId] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !channelId || /^\d+$/.test(channelId)) {
      setAsyncResolvedId(null);
      return;
    }

    let cancelled = false;

    resolveBroadcasterId(channelId)
      .then((resolved) => {
        if (!cancelled && resolved && /^\d+$/.test(resolved)) {
          setAsyncResolvedId(resolved);
        }
      })
      .catch(() => {
        // Resolution failed. Leave asyncResolvedId as null
      });

    return () => {
      cancelled = true;
    };
  }, [channelId, enabled]);

  const resolvedId = derivedId ?? asyncResolvedId;

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
