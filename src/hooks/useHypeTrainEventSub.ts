/**
 * useHypeTrainEventSub
 *
 * Connects to the Twitch EventSub WebSocket and subscribes to
 * `channel.hype_train.begin`, `channel.hype_train.progress`, and
 * `channel.hype_train.end` v2 events.
 *
 * Required scope: channel:read:hype_train
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { resolveBroadcasterId } from "../lib/twitch";

export interface HypeTrainEvent {
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

const EVENTSUB_WS_URL = "wss://eventsub.wss.twitch.tv/ws";
const KEEPALIVE_GRACE_S = 5;

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
  const [wsSessionId, setWsSessionId] = useState<string | null>(null);

  const onHypeTrainBeginRef = useRef(onHypeTrainBegin);
  useEffect(() => {
    onHypeTrainBeginRef.current = onHypeTrainBegin;
  }, [onHypeTrainBegin]);

  const onHypeTrainProgressRef = useRef(onHypeTrainProgress);
  useEffect(() => {
    onHypeTrainProgressRef.current = onHypeTrainProgress;
  }, [onHypeTrainProgress]);

  const onHypeTrainEndRef = useRef(onHypeTrainEnd);
  useEffect(() => {
    onHypeTrainEndRef.current = onHypeTrainEnd;
  }, [onHypeTrainEnd]);

  const onScopeErrorRef = useRef(onScopeError);
  useEffect(() => {
    onScopeErrorRef.current = onScopeError;
  }, [onScopeError]);

  const accessTokenRef = useRef(accessToken);
  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    if (!enabled || !channelId || !accessToken || !clientId) return;
    let active = true;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let keepaliveTimer: ReturnType<typeof setTimeout> | null = null;
    const subscriptions: string[] = [];

    const resetKeepalive = (timeoutSeconds: number) => {
      if (keepaliveTimer) clearTimeout(keepaliveTimer);
      const raw = Number(timeoutSeconds);
      const fallback = Number.isFinite(raw) && raw > 0 ? raw : 10;
      const ms = (fallback + KEEPALIVE_GRACE_S) * 1000;
      keepaliveTimer = setTimeout(() => {
        console.warn("[useHypeTrainEventSub] Keepalive timeout — reconnecting");
        ws?.close();
      }, ms);
    };

    const subscribe = async (
      sessionId: string,
      numericId: string,
      type: string,
      version: string,
    ) => {
      if (!active) return;
      try {
        const subRes = await fetch(
          "https://api.twitch.tv/helix/eventsub/subscriptions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessTokenRef.current}`,
              "Client-Id": clientId,
            },
            body: JSON.stringify({
              type,
              version,
              condition: { broadcaster_user_id: numericId },
              transport: { method: "websocket", session_id: sessionId },
            }),
          },
        );

        if (!subRes.ok) {
          const errBody = await subRes.json().catch(() => ({}));
          if (subRes.status === 401 || subRes.status === 403) {
            console.warn(
              `[useHypeTrainEventSub] Subscription rejected for ${type} — token may be invalid or missing channel:read:hype_train scope.`,
              errBody,
            );
            onScopeErrorRef.current?.();
          } else {
            console.warn(
              `[useHypeTrainEventSub] Subscription failed for ${type}:`,
              subRes.status,
              errBody,
            );
          }
        } else {
          const subData = await subRes.json();
          const subId = subData?.data?.[0]?.id;
          if (subId) subscriptions.push(subId);
          console.log(
            `[useHypeTrainEventSub] Subscribed to ${type} for channel ${numericId}`,
          );
        }
      } catch (err) {
        console.error(
          `[useHypeTrainEventSub] Subscription error for ${type}:`,
          err,
        );
      }
    };

    const resolveAndConnect = async (url = EVENTSUB_WS_URL) => {
      if (!active) return;

      let numericId = channelId;
      if (!/^\d+$/.test(channelId)) {
        try {
          const resolved = await resolveBroadcasterId(channelId);
          if (!resolved || !/^\d+$/.test(resolved)) {
            console.warn(
              `[useHypeTrainEventSub] Could not resolve channel name "${channelId}" to ID`,
            );
            return;
          }
          numericId = resolved;
        } catch (err) {
          console.error(
            `[useHypeTrainEventSub] Error resolving channel name "${channelId}":`,
            err,
          );
          return;
        }
      }

      const connect = (targetUrl: string) => {
        if (!active) return;
        ws = new WebSocket(targetUrl);

        ws.onopen = () => {
          console.log("[useHypeTrainEventSub] EventSub WebSocket connected");
        };

        ws.onmessage = async (event) => {
          if (!active) return;

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
            setWsSessionId(sessionId);
            resetKeepalive(keepaliveTimeout);

            // Subscribe to all three Hype Train v2 events
            await subscribe(
              sessionId,
              numericId,
              "channel.hype_train.begin",
              "2",
            );
            await subscribe(
              sessionId,
              numericId,
              "channel.hype_train.progress",
              "2",
            );
            await subscribe(
              sessionId,
              numericId,
              "channel.hype_train.end",
              "2",
            );
          } else if (msgType === "session_keepalive") {
            const keepaliveTimeout: number =
              data.payload?.session?.keepalive_timeout_seconds ?? 10;
            resetKeepalive(keepaliveTimeout);
          } else if (msgType === "notification") {
            resetKeepalive(10);
            const subType: string | undefined =
              data?.payload?.subscription?.type;
            const event = data.payload.event;

            const hypeTrainEvent: HypeTrainEvent = {
              id: event.id,
              broadcasterUserId: event.broadcaster_user_id,
              broadcasterUserName: event.broadcaster_user_name,
              level: event.level,
              total: event.total,
              progress: event.progress,
              goal: event.goal,
              topContributions: (event.top_contributions || []).map(
                (c: any) => ({
                  userId: c.user_id,
                  userName: c.user_name,
                  displayName: c.display_name || c.user_name,
                  type: c.type,
                  total: c.total,
                }),
              ),
              startedAt: event.started_at,
              expiresAt: event.expires_at,
              cooldownEndsAt: event.cooldown_ends_at,
            };

            if (subType === "channel.hype_train.begin") {
              onHypeTrainBeginRef.current(hypeTrainEvent);
            } else if (subType === "channel.hype_train.progress") {
              onHypeTrainProgressRef.current(hypeTrainEvent);
            } else if (subType === "channel.hype_train.end") {
              onHypeTrainEndRef.current(hypeTrainEvent);
            }
          } else if (msgType === "session_reconnect") {
            const reconnectUrl: string | undefined =
              data.payload?.session?.reconnect_url;
            ws?.close(1000, "reconnect requested by server");
            if (active) connect(reconnectUrl ?? EVENTSUB_WS_URL);
          } else if (msgType === "revocation") {
            console.warn(
              "[useHypeTrainEventSub] Subscription revoked:",
              data.payload?.subscription?.status,
            );
          }
        };

        ws.onerror = () => {
          console.error("[useHypeTrainEventSub] WebSocket error");
        };

        ws.onclose = (evt) => {
          if (keepaliveTimer) clearTimeout(keepaliveTimer);
          if (!active) return;
          if (evt.code !== 1000) {
            console.log(
              `[useHypeTrainEventSub] WS closed (code ${evt.code}) — reconnecting in 5 s`,
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
  }, [channelId, clientId, enabled]);
}
