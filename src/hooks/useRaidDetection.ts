/**
 * useRaidDetection
 *
 * Connects to the Twitch EventSub WebSocket and subscribes to `channel.raid`
 * with `from_broadcaster_user_id` set to the currently-watched channel.
 *
 * When the broadcaster initiates an outgoing raid, `onRaidOut` is called with
 * the target channel info so the UI can offer the viewer a "Follow Raid" prompt.
 *
 * No special OAuth scopes are required for `channel.raid` subscriptions, any valid user access token works.
 */

import { useEffect, useRef } from 'react';

export interface RaidOutEvent {
  /** Login name (all-lowercase) of the raid target channel */
  targetLogin: string;
  /** Display name of the raid target channel */
  targetDisplayName: string;
  /** Number of viewers in the raid party */
  viewerCount: number;
}

interface UseRaidDetectionOptions {
  /**
   * Numeric Twitch user ID of the channel being watched (the potential raider).
   * Must be a numeric ID string, not a login name.
   */
  channelId: string;
  /** Viewer's Twitch user access token */
  accessToken: string;
  /** Twitch client ID (PUBLIC_TWITCH_CLIENT_ID) */
  clientId: string;
  /** Set to false to disable the connection without unmounting the hook */
  enabled: boolean;
  /** Called when the watched channel initiates an outgoing raid */
  onRaidOut: (event: RaidOutEvent) => void;
}

const EVENTSUB_WS_URL = 'wss://eventsub.wss.twitch.tv/ws';
/**
 * Extra grace period (seconds) added to the server's keepalive_timeout_seconds
 * before we consider the connection dead and reconnect.
 */
const KEEPALIVE_GRACE_S = 5;

export function useRaidDetection({
  channelId,
  accessToken,
  clientId,
  enabled,
  onRaidOut,
}: UseRaidDetectionOptions): void {
  // Keep the callback in a ref so the WebSocket closure never goes stale
  const onRaidOutRef = useRef(onRaidOut);
  useEffect(() => { onRaidOutRef.current = onRaidOut; }, [onRaidOut]);

  useEffect(() => {
    // Guard: only run when we have valid credentials and a numeric channel ID
    if (!enabled || !channelId || !accessToken || !clientId) return;
    // Bail out if channelId looks like a login name instead of a numeric ID
    if (!/^\d+$/.test(channelId)) return;

    let active = true;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let keepaliveTimer: ReturnType<typeof setTimeout> | null = null;

    const clearTimers = () => {
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (keepaliveTimer) { clearTimeout(keepaliveTimer); keepaliveTimer = null; }
    };

    /** Resets the watchdog timer. If no message arrives within the window, reconnect. */
    const resetKeepalive = (timeoutSeconds: number) => {
      if (keepaliveTimer) clearTimeout(keepaliveTimer);
      keepaliveTimer = setTimeout(() => {
        console.warn('[useRaidDetection] Keepalive timeout — reconnecting');
        ws?.close();
      }, (timeoutSeconds + KEEPALIVE_GRACE_S) * 1000);
    };

    const connect = (url = EVENTSUB_WS_URL) => {
      if (!active) return;

      ws = new WebSocket(url);

      ws.onopen = () => {
        console.log('[useRaidDetection] EventSub WebSocket connected');
      };

      ws.onmessage = async (event) => {
        if (!active) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let data: any;
        try { data = JSON.parse(event.data as string); } catch { return; }

        const msgType: string | undefined = data?.metadata?.message_type;

        if (msgType === 'session_welcome') {
          const session = data.payload?.session;
          const sessionId: string | undefined = session?.id;
          const keepaliveTimeout: number = session?.keepalive_timeout_seconds ?? 10;

          if (!sessionId) return;
          resetKeepalive(keepaliveTimeout);

          // Subscribe to outgoing raids from the broadcaster via the Helix API
          try {
            const res = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
                'Client-Id': clientId,
              },
              body: JSON.stringify({
                type: 'channel.raid',
                version: '1',
                condition: { from_broadcaster_user_id: channelId },
                transport: { method: 'websocket', session_id: sessionId },
              }),
            });

            if (!res.ok) {
              const errBody = await res.json().catch(() => ({}));
              console.warn('[useRaidDetection] Subscription failed:', res.status, errBody);
            } else {
              console.log('[useRaidDetection] Subscribed to channel.raid from channel', channelId);
            }
          } catch (err) {
            console.error('[useRaidDetection] Subscription request error:', err);
          }

        } else if (msgType === 'session_keepalive') {
          // Server-sent keepalive — reset watchdog
          const keepaliveTimeout: number = data.payload?.session?.keepalive_timeout_seconds ?? 10;
          resetKeepalive(keepaliveTimeout);

        } else if (msgType === 'notification') {
          // Any notification also counts as a keepalive
          resetKeepalive(10);

          const subType: string | undefined = data?.payload?.subscription?.type;
          if (subType === 'channel.raid') {
            const ev = data.payload.event;
            onRaidOutRef.current({
              targetLogin: ev.to_broadcaster_user_login as string,
              targetDisplayName: ev.to_broadcaster_user_name as string,
              viewerCount: ev.viewers as number,
            });
          }

        } else if (msgType === 'session_reconnect') {
          // Twitch is requesting we move to a new WebSocket URL
          const reconnectUrl: string | undefined = data.payload?.session?.reconnect_url;
          ws?.close(1000, 'reconnect requested by server');
          if (active) connect(reconnectUrl ?? EVENTSUB_WS_URL);

        } else if (msgType === 'revocation') {
          console.warn(
            '[useRaidDetection] Subscription revoked:',
            data.payload?.subscription?.status,
          );
        }
      };

      ws.onerror = () => {
        console.error('[useRaidDetection] WebSocket error');
      };

      ws.onclose = (evt) => {
        clearTimers();
        if (!active) return;
        // Code 1000 = intentional close; anything else = reconnect
        if (evt.code !== 1000) {
          console.log(`[useRaidDetection] WS closed (code ${evt.code}) — reconnecting in 5 s`);
          reconnectTimer = setTimeout(() => connect(), 5000);
        }
      };
    };

    connect();

    return () => {
      active = false;
      clearTimers();
      ws?.close(1000, 'hook unmounting');
    };
    // Re-run only when the channel/credentials change
  }, [channelId, accessToken, clientId, enabled]);
}
