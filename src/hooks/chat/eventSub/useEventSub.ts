/**
 * useEventSub
 *
 * Single shared Twitch EventSub WebSocket connection.
 * All hooks register subscriptions via `subscribe()` — the manager handles
 * the WS lifecycle (connect, keepalive, reconnect) and routes notifications.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { subscribeEventSub, resolveBroadcasterId } from "../../../lib/twitch";

const WS_URL = "wss://eventsub.wss.twitch.tv/ws";
const KEEPALIVE_GRACE_S = 5;
const MAX_RECONNECT_DELAY_MS = 30000;
const SUBSCRIPTION_STAGGER_MS = 250;
const POST_429_COOLDOWN_MS = 5000;

interface Subscription {
  type: string;
  version: string;
  condition: Record<string, string>;
  onNotification: (event: unknown) => void;
  onScopeError?: () => void;
}

interface UseEventSubOptions {
  accessToken: string;
  clientId: string;
  enabled: boolean;
}

export function useEventSub({
  accessToken,
  clientId,
  enabled,
}: UseEventSubOptions) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const subscriptionsRef = useRef(new Map<string, Subscription>());
  const accessTokenRef = useRef(accessToken);
  const clientIdRef = useRef(clientId);
  const rateLimitedUntilRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const subscribedKeysRef = useRef(new Set<string>());
  const triggerResubscribeRef = useRef<((keys?: string[]) => void) | null>(null);

  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);
  useEffect(() => {
    clientIdRef.current = clientId;
  }, [clientId]);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const subscribe = useCallback(
    (
      type: string,
      version: string,
      condition: Record<string, string>,
      onNotification: (event: unknown) => void,
      onScopeError?: () => void,
    ) => {
      const key = `${type}:${JSON.stringify(condition)}`;
      subscriptionsRef.current.set(key, {
        type,
        version,
        condition,
        onNotification,
        onScopeError,
      });

      if (sessionIdRef.current && !subscribedKeysRef.current.has(key)) {
        const sid = sessionIdRef.current;
        triggerResubscribeRef.current?.([key]);
      }

      return () => {
        subscriptionsRef.current.delete(key);
        subscribedKeysRef.current.delete(key);
      };
    },
    [],
  );

  useEffect(() => {
    if (!enabled || !accessToken || !clientId) return;
    let active = true;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let keepaliveTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectDelay = 1000;
    let pendingSubscribes = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const resetKeepalive = (timeoutSeconds: number) => {
      if (keepaliveTimer) clearTimeout(keepaliveTimer);
      const raw = Number(timeoutSeconds);
      const fallback = Number.isFinite(raw) && raw > 0 ? raw : 10;
      keepaliveTimer = setTimeout(() => {
        console.warn("[useEventSub] Keepalive timeout — reconnecting");
        ws?.close();
      }, (fallback + KEEPALIVE_GRACE_S) * 1000);
    };

    const sleep = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    const subscribeAll = async (sid: string, keys?: string[]) => {
      if (pendingSubscribes) return;
      pendingSubscribes = true;
      try {
        const entries = keys
          ? keys.map((k) => [k, subscriptionsRef.current.get(k)] as const).filter((e): e is [string, Subscription] => e[1] != null)
          : Array.from(subscriptionsRef.current.entries());
        for (let i = 0; i < entries.length; i++) {
          if (!active) return;
          if (sessionIdRef.current !== sid) return;
          if (Date.now() < rateLimitedUntilRef.current) {
            const wait = rateLimitedUntilRef.current - Date.now();
            await sleep(wait);
            if (!active || sessionIdRef.current !== sid) return;
          }
          const [key, sub] = entries[i];
          if (subscribedKeysRef.current.has(key)) continue;
          try {
            const res = await subscribeEventSub(
              accessTokenRef.current,
              clientIdRef.current,
              {
                type: sub.type,
                version: sub.version,
                condition: sub.condition,
                transport: { method: "websocket", session_id: sid },
              },
            );
            if (
              res.status === 429 &&
              rateLimitedUntilRef.current < Date.now()
            ) {
              rateLimitedUntilRef.current =
                Date.now() + POST_429_COOLDOWN_MS;
            }
            if (res.ok || res.status === 409) {
              subscribedKeysRef.current.add(key);
            }
            if (
              !res.ok &&
              res.status !== 409 &&
              (res.status === 401 || res.status === 403)
            ) {
              sub.onScopeError?.();
            }
          } catch (err) {
            console.error(
              `[useEventSub] Subscription error for ${sub.type}:`,
              err,
            );
          }
          if (i < entries.length - 1) {
            await sleep(SUBSCRIPTION_STAGGER_MS);
          }
        }
      } finally {
        pendingSubscribes = false;
      }
    };

    const connect = (targetUrl: string) => {
      if (!active) return;
      ws = new WebSocket(targetUrl);

      ws.onopen = () => {
        reconnectDelay = 1000;
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
          const sid: string | undefined = session?.id;
          const keepaliveTimeout: number =
            session?.keepalive_timeout_seconds ?? 10;
          if (!sid) return;
          setSessionId(sid);
          sessionIdRef.current = sid;
          subscribedKeysRef.current.clear();
          resetKeepalive(keepaliveTimeout);
          await subscribeAll(sid);
        } else if (msgType === "session_keepalive") {
          const keepaliveTimeout: number =
            data.payload?.session?.keepalive_timeout_seconds ?? 10;
          resetKeepalive(keepaliveTimeout);
        } else if (msgType === "notification") {
          resetKeepalive(10);
          const subType: string | undefined =
            data?.payload?.subscription?.type;
          if (subType) {
            const key = `${subType}:${JSON.stringify(data?.payload?.subscription?.condition)}`;
            const sub = subscriptionsRef.current.get(key);
            sub?.onNotification(data.payload.event);
          }
        } else if (msgType === "session_reconnect") {
          const reconnectUrl: string | undefined =
            data.payload?.session?.reconnect_url;
          ws?.close(1000, "reconnect requested by server");
          if (active) connect(reconnectUrl ?? WS_URL);
        } else if (msgType === "revocation") {
          console.warn(
            "[useEventSub] Subscription revoked:",
            data.payload?.subscription?.status,
          );
        }
      };

      ws.onerror = () => {
        console.error("[useEventSub] WebSocket error");
      };

      ws.onclose = (evt) => {
        if (keepaliveTimer) clearTimeout(keepaliveTimer);
        if (!active) return;
        sessionIdRef.current = null;
        setSessionId(null);
        if (evt.code !== 1000) {
          const delay = Math.min(reconnectDelay, MAX_RECONNECT_DELAY_MS);
          reconnectTimer = setTimeout(() => {
            reconnectDelay *= 2;
            connect(targetUrl);
          }, delay);
        }
      };
    };

    connect(WS_URL);

    triggerResubscribeRef.current = (keys?: string[]) => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        if (active && sessionIdRef.current === sid) {
          void subscribeAll(sid, keys);
        }
      }, 300);
    };

    return () => {
      active = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (keepaliveTimer) clearTimeout(keepaliveTimer);
      if (debounceTimer) clearTimeout(debounceTimer);
      triggerResubscribeRef.current = null;
      sessionIdRef.current = null;
      ws?.close(1000, "hook unmounting");
    };
  }, [accessToken, clientId, enabled]);

  return { subscribe, sessionId };
}

/**
 * Resolve a channel name to a numeric ID if needed.
 * Returns the ID unchanged if already numeric.
 */
export { resolveBroadcasterId };
