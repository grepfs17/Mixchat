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

import { useEffect, useRef } from "react";
import { subscribeEventSub } from "../../lib/twitch";
import { resolveBroadcasterId } from "../../lib/twitch";

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
  /**
   * Called when the EventSub subscription is rejected (401/403).
   * This typically means the access token is invalid or expired.
   */
  onScopeError?: () => void;
}

const EVENTSUB_WS_URL = "wss://eventsub.wss.twitch.tv/ws";
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
  onScopeError,
}: UseRaidDetectionOptions): void {
  // Keep the callbacks in refs so the WebSocket closure never goes stale
  const onRaidOutRef = useRef(onRaidOut);
  useEffect(() => {
    onRaidOutRef.current = onRaidOut;
  }, [onRaidOut]);
  const onScopeErrorRef = useRef(onScopeError);
  useEffect(() => {
    onScopeErrorRef.current = onScopeError;
  }, [onScopeError]);

  const accessTokenRef = useRef(accessToken);
  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    // Guard: only run when we have valid credentials and a numeric channel ID
    if (!enabled || !channelId || !accessToken || !clientId) return;
    let active = true;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let keepaliveTimer: ReturnType<typeof setTimeout> | null = null;

    /** Resets the watchdog timer. If no message arrives within the window, reconnect. */
    const resetKeepalive = (timeoutSeconds: number) => {
      if (keepaliveTimer) clearTimeout(keepaliveTimer);
      const raw = Number(timeoutSeconds);
      const fallback = Number.isFinite(raw) && raw > 0 ? raw : 10;
      const ms = (fallback + KEEPALIVE_GRACE_S) * 1000;
      keepaliveTimer = setTimeout(() => {
        console.warn("[useRaidDetection] Keepalive timeout — reconnecting");
        ws?.close();
      }, ms);
    };

    const resolveAndConnect = async (url = EVENTSUB_WS_URL) => {
      if (!active) return;

      let numericId = channelId;

      if (!/^\d+$/.test(channelId)) {
        try {
          const resolved = await resolveBroadcasterId(channelId);
          if (!resolved || !/^\d+$/.test(resolved)) {
            console.warn(
              `[useRaidDetection] Could not resolve channel name "${channelId}" to ID`,
            );
            return;
          }
          numericId = resolved;
          console.log(
            `[useRaidDetection] Resolved "${channelId}" to numeric ID ${numericId}`,
          );
        } catch (err) {
          console.error(
            `[useRaidDetection] Error resolving channel name "${channelId}":`,
            err,
          );
          return;
        }
      }

      const connect = (targetUrl: string) => {
        if (!active) return;
        ws = new WebSocket(targetUrl);

        ws.onopen = () => {
          console.log("[useRaidDetection] EventSub WebSocket connected");
        };

        ws.onmessage = async (event) => {
          if (!active) return;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let data: any;
          try {
            data = JSON.parse(event.data as string);
          } catch {
            return;
          }

          const msgType: string | undefined = data?.metadata?.message_type;

          if (msgType === "session_welcome") {
            const session = data.payload?.session;
            const sessionId: string | undefined = session?.id;
            const keepaliveTimeout: number =
              session?.keepalive_timeout_seconds ?? 10;

            if (!sessionId) return;
            resetKeepalive(keepaliveTimeout);

            // Subscribe to outgoing raids from the broadcaster via the Helix API
            try {
              const subRes = await subscribeEventSub(
                accessTokenRef.current,
                clientId,
                {
                  type: "channel.raid",
                  version: "1",
                  condition: { from_broadcaster_user_id: numericId },
                  transport: { method: "websocket", session_id: sessionId },
                },
              );

              if (!subRes.ok) {
                if (subRes.status === 401 || subRes.status === 403) {
                  console.warn(
                    "[useRaidDetection] Subscription rejected — token may be invalid or expired.",
                  );
                  onScopeErrorRef.current?.();
                } else {
                  console.warn(
                    "[useRaidDetection] Subscription failed:",
                    subRes.status,
                  );
                }
              } else {
                console.log(
                  "[useRaidDetection] Subscribed to channel.raid from channel",
                  numericId,
                );
              }
            } catch (err) {
              console.error(
                "[useRaidDetection] Subscription request error:",
                err,
              );
            }
          } else if (msgType === "session_keepalive") {
            const keepaliveTimeout: number =
              data.payload?.session?.keepalive_timeout_seconds ?? 10;
            resetKeepalive(keepaliveTimeout);
          } else if (msgType === "notification") {
            resetKeepalive(10);
            const subType: string | undefined =
              data?.payload?.subscription?.type;
            if (subType === "channel.raid") {
              const ev = data.payload.event;
              onRaidOutRef.current({
                targetLogin: ev.to_broadcaster_user_login as string,
                targetDisplayName: ev.to_broadcaster_user_name as string,
                viewerCount: ev.viewers as number,
              });
            }
          } else if (msgType === "session_reconnect") {
            const reconnectUrl: string | undefined =
              data.payload?.session?.reconnect_url;
            ws?.close(1000, "reconnect requested by server");
            if (active) connect(reconnectUrl ?? EVENTSUB_WS_URL);
          } else if (msgType === "revocation") {
            console.warn(
              "[useRaidDetection] Subscription revoked:",
              data.payload?.subscription?.status,
            );
          }
        };

        ws.onerror = () => {
          console.error("[useRaidDetection] WebSocket error");
        };

        ws.onclose = (evt) => {
          if (keepaliveTimer) clearTimeout(keepaliveTimer);
          if (!active) return;
          if (evt.code !== 1000) {
            console.log(
              `[useRaidDetection] WS closed (code ${evt.code}) — reconnecting in 5 s`,
            );
            reconnectTimer = setTimeout(() => resolveAndConnect(), 5000);
          }
        };
      };

      connect(url);
    };

    resolveAndConnect();

    return () => {
      active = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (keepaliveTimer) clearTimeout(keepaliveTimer);
      ws?.close(1000, "hook unmounting");
    };
    // Re-run only when the channel/credentials change
  }, [channelId, clientId, enabled]);
}
