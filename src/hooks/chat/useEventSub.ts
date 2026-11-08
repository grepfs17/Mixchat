/**
 * Single shared Twitch EventSub WebSocket connection.
 * All hooks register subscriptions via `subscribe()`. The manager handles
 * the WS lifecycle (connect, keepalive, reconnect) and routes notifications.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { subscribeEventSub, resolveBroadcasterId } from "../../lib/twitch";

const WS_URL = "wss://eventsub.wss.twitch.tv/ws";
const KEEPALIVE_GRACE_S = 5;
const MAX_RECONNECT_DELAY_MS = 30000;
const SUBSCRIPTION_STAGGER_MS = 250;
const POST_429_COOLDOWN_MS = 5000;
const SUBSCRIPTION_RETRY_BASE_MS = 2000;
const SUBSCRIPTION_RETRY_MAX_MS = 30000;

export type SubscriptionStatus = "pending" | "connected" | "error" | "scope_error";

/** Module-level cache: subscription key → session ID they were registered with.
 *  Survives component remounts, preventing re-POSTing within the same session,
 *  but re-registers when the WebSocket session changes. */
const subscribedKeys = new Map<string, string>();

interface Subscription {
  type: string;
  version: string;
  condition: Record<string, string>;
  onNotification: (event: unknown) => void;
  onScopeError?: () => void;
}

/** Order-independent condition comparison (JSON key order varies). Incoming
 *  conditions may carry extra keys, so `a` must be a subset of `b`. */
function conditionsEqual(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  const aKeys = Object.keys(a);
  for (const k of aKeys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

function parseConditionFromKey(
  key: string,
  type: string,
): Record<string, string> {
  const prefix = `${type}:`;
  if (!key.startsWith(prefix)) return {};
  try {
    return JSON.parse(key.slice(prefix.length)) as Record<string, string>;
  } catch {
    return {};
  }
}

interface UseEventSubOptions {
  accessToken: string;
  clientId: string;
  enabled: boolean;
}

export type SubscribeFn = (
  type: string,
  version: string,
  condition: Record<string, string>,
  onNotification: (event: unknown) => void,
  onScopeError?: () => void,
) => () => void;

export function __resetSubscribedKeysForTests() {
  subscribedKeys.clear();
}

export function useEventSub({
  accessToken,
  clientId,
  enabled,
}: UseEventSubOptions) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [subscriptionStatuses, setSubscriptionStatuses] = useState<
    Map<string, SubscriptionStatus>
  >(new Map());
  const subscriptionsRef = useRef(new Map<string, Subscription>());
  const accessTokenRef = useRef(accessToken);
  const clientIdRef = useRef(clientId);
  const rateLimitedUntilRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const triggerResubscribeRef = useRef<((keys?: string[]) => void) | null>(
    null,
  );
  /** Keys whose subscription cleanup ran but whose stale entry still
   *  exists in the module-level `subscribedKeys`. Tracked so that
   *  `subscribe()` can evict the stale entry and trigger re-registration. */
  const keysCleanedUp = useRef(new Set<string>());

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

      if (keysCleanedUp.current.has(key)) {
        // The previous subscription was cleaned up (effect re-ran) but
        // the module-level cache still has a stale entry. Evict it so
        // the normal "pending" + resubscribe path fires.
        subscribedKeys.delete(key);
        keysCleanedUp.current.delete(key);
      }
      if (!subscribedKeys.has(key)) {
        setSubscriptionStatuses((prev) => {
          const next = new Map(prev);
          next.set(key, "pending");
          return next;
        });
      }

      const currentSid = sessionIdRef.current;
      if (currentSid && subscribedKeys.get(key) !== currentSid) {
        triggerResubscribeRef.current?.([key]);
      }

      return () => {
        subscriptionsRef.current.delete(key);
        setSubscriptionStatuses((prev) => {
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
        keysCleanedUp.current.add(key);
      };
    },
    [],
  );

  useEffect(() => {
    if (!enabled || !accessToken || !clientId) return () => {};
    let active = true;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let keepaliveTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectDelay = 1000;
    let pendingSubscribes = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingKeysQueue: string[] = [];
    let activeSocketId = 0;
    const retryQueue = new Map<string, number>(); // key -> timestamp when it can be retried
    const retryBackoff = new Map<string, number>(); // key -> current delay

    const abortCtrl = new AbortController();
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        if (abortCtrl.signal.aborted) { resolve(); return; }
        const timer = setTimeout(resolve, ms);
        abortCtrl.signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
      });

    const resetKeepalive = (timeoutSeconds: number, socketId: number) => {
      if (keepaliveTimer) clearTimeout(keepaliveTimer);
      const raw = Number(timeoutSeconds);
      const fallback = Number.isFinite(raw) && raw > 0 ? raw : 10;
      keepaliveTimer = setTimeout(
        () => {
          if (!active) return;
          if (activeSocketId !== socketId) return;
          console.warn("[useEventSub] Keepalive timeout, reconnecting");
          ws?.close();
        },
        (fallback + KEEPALIVE_GRACE_S) * 1000,
      );
    };

    const queueRetry = (key: string) => {
      const previous = retryBackoff.get(key);
      const nextDelay =
        previous === undefined
          ? SUBSCRIPTION_RETRY_BASE_MS
          : Math.min(previous * 2, SUBSCRIPTION_RETRY_MAX_MS);
      retryBackoff.set(key, nextDelay);
      retryQueue.set(key, Date.now() + nextDelay);
    };

    const scheduleRetries = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (!active) return;
      const sid = sessionIdRef.current;
      if (!sid) return;

      const now = Date.now();
      const readyKeys: string[] = [];
      let nextTs: number | null = null;

      for (const [key, ts] of retryQueue) {
        if (subscribedKeys.get(key) === sid) {
          retryQueue.delete(key);
          continue;
        }
        if (ts <= now) {
          readyKeys.push(key);
        } else if (nextTs === null || ts < nextTs) {
          nextTs = ts;
        }
      }

      for (const key of readyKeys) {
        retryQueue.delete(key);
      }

      if (readyKeys.length > 0) {
        void subscribeAll(sid, readyKeys);
      } else if (nextTs !== null) {
        retryTimer = setTimeout(() => {
          retryTimer = null;
          scheduleRetries();
        }, Math.max(0, nextTs - Date.now()));
      }
    };

    const subscribeAll = async (sid: string, keys?: string[]) => {
      if (pendingSubscribes) {
        if (keys) pendingKeysQueue.push(...keys);
        return;
      }
      pendingSubscribes = true;
      try {
        let entries: [string, Subscription][];
        if (keys) {
          pendingKeysQueue.push(...keys);
          const allKeys = [...new Set(pendingKeysQueue)];
          pendingKeysQueue = [];
          entries = allKeys
            .map((k) => [k, subscriptionsRef.current.get(k)] as const)
            .filter((e): e is [string, Subscription] => e[1] != null);
        } else {
          entries = Array.from(subscriptionsRef.current.entries());
        }
        for (let i = 0; i < entries.length; i++) {
          if (!active) return;
          if (sessionIdRef.current !== sid) return;
          if (Date.now() < rateLimitedUntilRef.current) {
            const wait = rateLimitedUntilRef.current - Date.now();
            await sleep(wait);
            if (!active || sessionIdRef.current !== sid) return;
          }
          const [key, sub] = entries[i];
          if (subscribedKeys.get(key) === sid) {
            retryQueue.delete(key);
            continue;
          }
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
              rateLimitedUntilRef.current = Date.now() + POST_429_COOLDOWN_MS;
            }
            if (res.ok || res.status === 409) {
              subscribedKeys.set(key, sid);
              retryQueue.delete(key);
              retryBackoff.delete(key);
              setSubscriptionStatuses((prev) => {
                const next = new Map(prev);
                next.set(key, "connected");
                return next;
              });
            } else if (res.status === 401 || res.status === 403) {
              // Permanent scope/auth failure, don't waste retries.
              retryQueue.delete(key);
              retryBackoff.delete(key);
              setSubscriptionStatuses((prev) => {
                const next = new Map(prev);
                next.set(key, "scope_error");
                return next;
              });
              sub.onScopeError?.();
            } else if (res.status === 400) {
              const message =
                typeof (res.body as { message?: unknown } | undefined)
                  ?.message === "string"
                  ? ((res.body as { message: string }).message ?? "")
                  : "";
              console.warn(
                `[useEventSub] Subscription rejected for ${sub.type}:`,
                message || res.body,
              );
              if (
                /session (does not exist|has already disconnected)|invalid session/i.test(
                  message,
                )
              ) {
                // The WebSocket session is gone. Reconnect so the new
                // session's welcome triggers a fresh subscription pass.
                ws?.close(4001, "stale eventsub session");
                return;
              }
              // A 400 for a static payload will not fix itself.
              retryQueue.delete(key);
              retryBackoff.delete(key);
              setSubscriptionStatuses((prev) => {
                const next = new Map(prev);
                next.set(key, "error");
                return next;
              });
            } else {
              // Retriable (5xx, 429 after internal cooldown, etc.)
              queueRetry(key);
            }
          } catch (err) {
            console.error(
              `[useEventSub] Subscription error for ${sub.type}:`,
              err,
            );
            queueRetry(key);
          }
          if (i < entries.length - 1) {
            await sleep(SUBSCRIPTION_STAGGER_MS);
          }
        }
      } finally {
        pendingSubscribes = false;
        if (
          pendingKeysQueue.length > 0 &&
          active &&
          sessionIdRef.current === sid
        ) {
          const queued = [...pendingKeysQueue];
          pendingKeysQueue = [];
          void subscribeAll(sid, queued);
        } else {
          scheduleRetries();
        }
      }
    };

    const connect = (targetUrl: string, isTwitchReconnect = false) => {
      if (!active) return;
      const socketId = ++activeSocketId;
      const currentWs = new WebSocket(targetUrl);
      ws = currentWs;

      currentWs.onopen = () => {
        reconnectDelay = 1000;
      };

      currentWs.onmessage = async (event) => {
        if (!active) return;
        if (ws !== currentWs) return;
        let data: any;
        try {
          data = JSON.parse(event.data as string);
        } catch {
          return;
        }

        const msgType: string | undefined = data?.metadata?.message_type;

        if (msgType === "notification") {
          resetKeepalive(10, socketId);
          const subType: string | undefined = data?.payload?.subscription?.type;
          if (subType) {
            const incomingCondition =
              data?.payload?.subscription?.condition ?? {};
            const key = `${subType}:${JSON.stringify(incomingCondition)}`;
            let sub = subscriptionsRef.current.get(key);
            if (!sub) {
              const prefix = `${subType}:`;
              const matches: Subscription[] = [];
              for (const [k, v] of subscriptionsRef.current) {
                if (
                  k.startsWith(prefix) &&
                  conditionsEqual(
                    parseConditionFromKey(k, subType),
                    incomingCondition,
                  )
                ) {
                  matches.push(v);
                }
              }
              if (matches.length === 1) {
                sub = matches[0];
              } else if (matches.length > 1) {
                console.warn(
                  "[useEventSub] Ambiguous notification for",
                  subType,
                  "- matching subscriptions have identical conditions, dropping event",
                );
              }
            }
            console.log("[EventSub] notification:", subType, "found:", !!sub);
            sub?.onNotification(data.payload.event);
          }
        } else if (msgType === "session_welcome") {
          const session = data.payload?.session;
          const sid: string | undefined = session?.id;
          const keepaliveTimeout: number =
            session?.keepalive_timeout_seconds ?? 10;
          if (!sid) return;
          setSessionId(sid);
          sessionIdRef.current = sid;

          if (isTwitchReconnect) {
            // Twitch migrates existing subscriptions to the new session.
            // Keep our local tracking in sync instead of resubscribing.
            for (const [key] of subscribedKeys) {
              subscribedKeys.set(key, sid);
            }
            setSubscriptionStatuses((prev) => {
              const next = new Map(prev);
              for (const [key] of next) {
                next.set(key, "connected");
              }
              return next;
            });
          } else {
            subscribedKeys.clear();
            setSubscriptionStatuses(new Map());
          }

          resetKeepalive(keepaliveTimeout, socketId);
          await subscribeAll(sid);
        } else if (msgType === "session_keepalive") {
          const keepaliveTimeout: number =
            data.payload?.session?.keepalive_timeout_seconds ?? 10;
          resetKeepalive(keepaliveTimeout, socketId);
        } else if (msgType === "session_reconnect") {
          const reconnectUrl: string | undefined =
            data?.payload?.session?.reconnect_url;
          currentWs.close(1000, "reconnect requested by server");
          if (active) connect(reconnectUrl ?? WS_URL, true);
        } else if (msgType === "revocation") {
          console.warn(
            "[useEventSub] Subscription revoked:",
            data.payload?.subscription?.status,
          );
        }
      };

      currentWs.onerror = () => {
        console.error("[useEventSub] WebSocket error");
      };

      currentWs.onclose = (evt) => {
        // Ignore events from a socket that has already been replaced by a
        // newer one. This prevents an old socket from clearing the new session
        // state after a Twitch-managed reconnect.
        if (ws !== currentWs) return;
        if (keepaliveTimer) clearTimeout(keepaliveTimer);
        if (!active) return;
        sessionIdRef.current = null;
        setSessionId(null);
        if (evt.code !== 1000) {
          setSubscriptionStatuses((prev) => {
            const next = new Map(prev);
            for (const [key] of next) {
              next.set(key, "error");
            }
            return next;
          });
          const delay = Math.min(reconnectDelay, MAX_RECONNECT_DELAY_MS);
          reconnectTimer = setTimeout(() => {
            reconnectDelay *= 2;
            connect(targetUrl, false);
          }, delay);
        }
      };
    };

    connect(WS_URL, false);

    let debouncedKeys: string[] = [];
    triggerResubscribeRef.current = (keys?: string[]) => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      if (keys) debouncedKeys.push(...keys);
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        if (active && sessionIdRef.current === sid) {
          const keysToSubscribe = debouncedKeys.length > 0
            ? [...new Set(debouncedKeys)]
            : undefined;
          debouncedKeys = [];
          void subscribeAll(sid, keysToSubscribe);
        } else {
          debouncedKeys = [];
        }
      }, 300);
    };

    return () => {
      active = false;
      abortCtrl.abort();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (keepaliveTimer) clearTimeout(keepaliveTimer);
      if (retryTimer) clearTimeout(retryTimer);
      if (debounceTimer) clearTimeout(debounceTimer);
      triggerResubscribeRef.current = null;
      sessionIdRef.current = null;
      ws?.close(1000, "hook unmounting");
    };
  }, [accessToken, clientId, enabled]);

  return { subscribe, sessionId, subscriptionStatuses };
}

/**
 * Resolve a channel name to a numeric ID if needed.
 * Returns the ID unchanged if already numeric.
 */
export { resolveBroadcasterId };
