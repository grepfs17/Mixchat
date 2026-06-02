/**
 * useChannelPointRedemptions
 *
 * Connects to the Twitch EventSub WebSocket and subscribes to
 * `channel.channel_points_custom_reward_redemption.add` for the watched
 * channel.
 *
 * This catches channel-point redemptions that do NOT require user text input,
 * because Twitch does not send those through IRC. Redemptions WITH user input
 * still arrive as normal PRIVMSG (handled by useTwitchChat) and are ignored
 * here to avoid duplicates.
 *
 * Required scope: channel:read:redemptions
 */

import { useEffect, useRef } from "react";
import { resolveBroadcasterId } from "../lib/twitch";
import type { ChatMessage } from "../lib/types";

export interface RedemptionEvent {
  /** EventSub redemption ID (unique per redemption) */
  id: string;
  userId: string;
  userName: string;
  userDisplayName: string;
  rewardId: string;
  rewardTitle: string;
  rewardCost: number;
  /** User-entered text; empty when the reward does not require input */
  userInput: string;
  redeemedAt: string;
}

interface UseChannelPointRedemptionsOptions {
  /**
   * Numeric Twitch user ID or login name of the channel being watched.
   */
  channelId: string;
  /** Viewer's Twitch user access token */
  accessToken: string;
  /** Twitch client ID (PUBLIC_TWITCH_CLIENT_ID) */
  clientId: string;
  /** Set to false to disable without unmounting */
  enabled: boolean;
  /** Called when a non-text redemption is detected */
  onRedemption: (message: ChatMessage) => void;
  /** Called on 401/403 subscription rejection */
  onScopeError?: () => void;
}

const EVENTSUB_WS_URL = "wss://eventsub.wss.twitch.tv/ws";
const KEEPALIVE_GRACE_S = 5;

export function useChannelPointRedemptions({
  channelId,
  accessToken,
  clientId,
  enabled,
  onRedemption,
  onScopeError,
}: UseChannelPointRedemptionsOptions): void {
  const onRedemptionRef = useRef(onRedemption);
  useEffect(() => {
    onRedemptionRef.current = onRedemption;
  }, [onRedemption]);

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

    const resetKeepalive = (timeoutSeconds: number) => {
      if (keepaliveTimer) clearTimeout(keepaliveTimer);
      const raw = Number(timeoutSeconds);
      const fallback = Number.isFinite(raw) && raw > 0 ? raw : 10;
      const ms = (fallback + KEEPALIVE_GRACE_S) * 1000;
      keepaliveTimer = setTimeout(() => {
        console.warn(
          "[useChannelPointRedemptions] Keepalive timeout — reconnecting",
        );
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
              `[useChannelPointRedemptions] Could not resolve channel name "${channelId}" to ID`,
            );
            return;
          }
          numericId = resolved;
          console.log(
            `[useChannelPointRedemptions] Resolved "${channelId}" to numeric ID ${numericId}`,
          );
        } catch (err) {
          console.error(
            `[useChannelPointRedemptions] Error resolving channel name "${channelId}":`,
            err,
          );
          return;
        }
      }

      const connect = (targetUrl: string) => {
        if (!active) return;
        ws = new WebSocket(targetUrl);

        ws.onopen = () => {
          console.log(
            "[useChannelPointRedemptions] EventSub WebSocket connected",
          );
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
                    type: "channel.channel_points_custom_reward_redemption.add",
                    version: "1",
                    condition: { broadcaster_user_id: numericId },
                    transport: { method: "websocket", session_id: sessionId },
                  }),
                },
              );

              if (!subRes.ok) {
                const errBody = await subRes.json().catch(() => ({}));
                if (subRes.status === 401 || subRes.status === 403) {
                  console.warn(
                    "[useChannelPointRedemptions] Subscription rejected — token may be invalid or missing channel:read:redemptions scope.",
                    errBody,
                  );
                  onScopeErrorRef.current?.();
                } else {
                  console.warn(
                    "[useChannelPointRedemptions] Subscription failed:",
                    subRes.status,
                    errBody,
                  );
                }
              } else {
                console.log(
                  "[useChannelPointRedemptions] Subscribed to redemption events for channel",
                  numericId,
                );
              }
            } catch (err) {
              console.error(
                "[useChannelPointRedemptions] Subscription request error:",
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
            if (
              subType === "channel.channel_points_custom_reward_redemption.add"
            ) {
              const ev = data.payload.event;
              const userInput: string = (ev.user_input as string) ?? "";

              // Skip text-input redemptions — those already arrive via IRC
              // as PRIVMSG with custom-reward-id. Adding them here would
              // create duplicates.
              if (userInput.trim().length > 0) return;

              const redemptionEvent: RedemptionEvent = {
                id: ev.id as string,
                userId: ev.user_id as string,
                userName: ev.user_login as string,
                userDisplayName: ev.user_name as string,
                rewardId: ev.reward?.id as string,
                rewardTitle: ev.reward?.title as string,
                rewardCost: Number(ev.reward?.cost ?? 0),
                userInput: userInput.trim(),
                redeemedAt: ev.redeemed_at as string,
              };

              const chatMessage: ChatMessage = {
                id: `redemption-${redemptionEvent.id}`,
                platform: "twitch",
                author:
                  redemptionEvent.userDisplayName || redemptionEvent.userName,
                content: `${redemptionEvent.userDisplayName || redemptionEvent.userName} redeemed ${redemptionEvent.rewardTitle}`,
                timestamp: new Date(redemptionEvent.redeemedAt),
                userId: redemptionEvent.userId,
                authorColor: "#c9a2ff",
                mentionsUser: false,
                emotes: {},
                isBot: false,
                badges: {},
                badgeDetails: {},
                messageType: "redemption",
                rewardId: redemptionEvent.rewardId,
                rewardTitle: redemptionEvent.rewardTitle,
                rewardCost: redemptionEvent.rewardCost,
              };

              onRedemptionRef.current(chatMessage);
            }
          } else if (msgType === "session_reconnect") {
            const reconnectUrl: string | undefined =
              data.payload?.session?.reconnect_url;
            ws?.close(1000, "reconnect requested by server");
            if (active) connect(reconnectUrl ?? EVENTSUB_WS_URL);
          } else if (msgType === "revocation") {
            console.warn(
              "[useChannelPointRedemptions] Subscription revoked:",
              data.payload?.subscription?.status,
            );
          }
        };

        ws.onerror = () => {
          console.error("[useChannelPointRedemptions] WebSocket error");
        };

        ws.onclose = (evt) => {
          if (keepaliveTimer) clearTimeout(keepaliveTimer);
          if (!active) return;
          if (evt.code !== 1000) {
            console.log(
              `[useChannelPointRedemptions] WS closed (code ${evt.code}) — reconnecting in 5 s`,
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
