/**
 * useAutomodQueue
 *
 * Connects to Twitch EventSub WebSocket and subscribes to
 * `automod.message.hold` to receive messages held by AutoMod.
 *
 * Required scope: moderator:manage:automod
 */

import { useEffect, useRef } from "react";

const EVENTSUB_WS_URL = "wss://eventsub.wss.twitch.tv/ws";
const KEEPALIVE_GRACE_S = 5;
const MAX_RECONNECT_DELAY_MS = 30000;

export interface HeldMessage {
  id: string;
  content: string;
  userId: string;
  userName: string;
  userDisplayName: string;
  category: string;
  level: number;
  holdDate: string;
}

export interface ResolvedMessage {
  messageId: string;
  status: "approved" | "denied" | "expired";
}

interface UseAutomodQueueOptions {
  channelId: string;
  moderatorId: string;
  accessToken: string;
  clientId: string;
  enabled: boolean;
  onHeldMessage: (message: HeldMessage) => void;
  onResolvedMessage?: (resolved: ResolvedMessage) => void;
  onScopeError?: () => void;
}

export function useAutomodQueue({
  channelId,
  moderatorId,
  accessToken,
  clientId,
  enabled,
  onHeldMessage,
  onResolvedMessage,
  onScopeError,
}: UseAutomodQueueOptions): void {
  const onHeldMessageRef = useRef(onHeldMessage);
  useEffect(() => {
    onHeldMessageRef.current = onHeldMessage;
  }, [onHeldMessage]);

  const onResolvedMessageRef = useRef(onResolvedMessage);
  useEffect(() => {
    onResolvedMessageRef.current = onResolvedMessage;
  }, [onResolvedMessage]);

  const onScopeErrorRef = useRef(onScopeError);
  useEffect(() => {
    onScopeErrorRef.current = onScopeError;
  }, [onScopeError]);

  const accessTokenRef = useRef(accessToken);
  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    if (!enabled || !channelId || !moderatorId || !accessToken || !clientId)
      return;
    let active = true;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let keepaliveTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectDelay = 1000;

    const resetKeepalive = (timeoutSeconds: number) => {
      if (keepaliveTimer) clearTimeout(keepaliveTimer);
      const raw = Number(timeoutSeconds);
      const fallback = Number.isFinite(raw) && raw > 0 ? raw : 10;
      const ms = (fallback + KEEPALIVE_GRACE_S) * 1000;
      keepaliveTimer = setTimeout(() => {
        console.warn("[useAutomodQueue] Keepalive timeout — reconnecting");
        ws?.close();
      }, ms);
    };

    const connect = (targetUrl: string) => {
      if (!active) return;
      ws = new WebSocket(targetUrl);

      ws.onopen = () => {
        console.log("[useAutomodQueue] EventSub WebSocket connected");
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
          const sessionId: string | undefined = session?.id;
          const keepaliveTimeout: number =
            session?.keepalive_timeout_seconds ?? 10;

          if (!sessionId) return;
          resetKeepalive(keepaliveTimeout);

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
                  type: "automod.message.hold",
                  version: "1",
                  condition: {
                    broadcaster_user_id: channelId,
                    moderator_user_id: moderatorId,
                  },
                  transport: { method: "websocket", session_id: sessionId },
                }),
              },
            );

            if (!subRes.ok) {
              const errBody = await subRes.json().catch(() => ({}));
              console.warn(
                "[useAutomodQueue] Subscription failed:",
                subRes.status,
                errBody,
              );
              if (subRes.status === 401 || subRes.status === 403) {
                onScopeErrorRef.current?.();
              }
            } else {
              console.log(
                "[useAutomodQueue] Subscribed to automod.message.hold for channel",
                channelId,
              );
            }

            // Also subscribe to automod.message.update to detect when another mod resolves a message
            const updateSubRes = await fetch(
              "https://api.twitch.tv/helix/eventsub/subscriptions",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${accessTokenRef.current}`,
                  "Client-Id": clientId,
                },
                body: JSON.stringify({
                  type: "automod.message.update",
                  version: "1",
                  condition: {
                    broadcaster_user_id: channelId,
                    moderator_user_id: moderatorId,
                  },
                  transport: { method: "websocket", session_id: sessionId },
                }),
              },
            );

            if (!updateSubRes.ok) {
              console.warn(
                "[useAutomodQueue] automod.message.update subscription failed:",
                updateSubRes.status,
              );
            } else {
              console.log(
                "[useAutomodQueue] Subscribed to automod.message.update for channel",
                channelId,
              );
            }
          } catch (err) {
            console.error(
              "[useAutomodQueue] Subscription request error:",
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

          if (subType === "automod.message.hold") {
            const ev = data.payload.event;

            // v1: message is a string; v2: message is { text, fragments }
            const rawMessage = ev.message;
            let content: string;
            if (typeof rawMessage === "string") {
              content = rawMessage;
            } else if (rawMessage && typeof rawMessage === "object") {
              content = (rawMessage as any).text ?? "";
            } else {
              content = "";
            }
            const category = (ev.category as string) ?? "unknown";
            const level = Number(ev.level ?? 1);
            const holdDate = (ev.held_at as string) ?? new Date().toISOString();

            const heldMsg: HeldMessage = {
              id: ev.message_id as string,
              content,
              userId: ev.user_id as string,
              userName: ev.user_login as string,
              userDisplayName: ev.user_name as string,
              category,
              level,
              holdDate,
            };

            console.log("[useAutomodQueue] Held message received:", heldMsg);
            onHeldMessageRef.current(heldMsg);
          } else if (subType === "automod.message.update") {
            const ev = data.payload.event;
            const resolved = {
              messageId: ev.message_id as string,
              status: ev.status as "approved" | "denied" | "expired",
            };
            console.log("[useAutomodQueue] Message resolved:", resolved);
            onResolvedMessageRef.current?.(resolved);
          }
        } else if (msgType === "session_reconnect") {
          const reconnectUrl: string | undefined =
            data.payload?.session?.reconnect_url;
          ws?.close(1000, "reconnect requested by server");
          if (active) connect(reconnectUrl ?? EVENTSUB_WS_URL);
        } else if (msgType === "revocation") {
          console.warn(
            "[useAutomodQueue] Subscription revoked:",
            data.payload?.subscription?.status,
          );
        } else if (msgType === "PONG") {
          // Keepalive response
        }
      };

      ws.onerror = () => {
        console.error("[useAutomodQueue] WebSocket error");
      };

      ws.onclose = (evt) => {
        if (keepaliveTimer) clearTimeout(keepaliveTimer);
        if (!active) return;
        if (evt.code !== 1000) {
          const delay = Math.min(reconnectDelay, MAX_RECONNECT_DELAY_MS);
          console.log(
            `[useAutomodQueue] WS closed (code ${evt.code}) — reconnecting in ${delay} ms`,
          );
          reconnectTimer = setTimeout(() => {
            reconnectDelay *= 2;
            connect(targetUrl);
          }, delay);
        }
      };
    };

    connect(EVENTSUB_WS_URL);

    return () => {
      active = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (keepaliveTimer) clearTimeout(keepaliveTimer);
      ws?.close(1000, "hook unmounting");
    };
  }, [channelId, moderatorId, clientId, enabled]);
}
