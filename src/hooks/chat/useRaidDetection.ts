/**
 * useRaidDetection
 *
 * Subscribes to `channel.raid` via the shared EventSub connection.
 * When the watched channel initiates an outgoing raid, `onRaidOut` is called.
 *
 * No special OAuth scopes required.
 */

import { useEffect, useRef } from "react";
import { useEventSub, resolveBroadcasterId } from "./useEventSub";

export interface RaidOutEvent {
  targetLogin: string;
  targetDisplayName: string;
  viewerCount: number;
}

interface UseRaidDetectionOptions {
  channelId: string;
  accessToken: string;
  clientId: string;
  enabled: boolean;
  onRaidOut: (event: RaidOutEvent) => void;
  onScopeError?: () => void;
}

export function useRaidDetection({
  channelId,
  accessToken,
  clientId,
  enabled,
  onRaidOut,
  onScopeError,
}: UseRaidDetectionOptions): void {
  const onRaidOutRef = useRef(onRaidOut);
  useEffect(() => {
    onRaidOutRef.current = onRaidOut;
  }, [onRaidOut]);

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

      return subscribe(
        "channel.raid",
        "1",
        { from_broadcaster_user_id: numericId },
        (ev: any) => {
          onRaidOutRef.current({
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
  }, [channelId, enabled, subscribe, onScopeError]);
}
