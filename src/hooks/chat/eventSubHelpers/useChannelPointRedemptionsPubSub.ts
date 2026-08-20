/**
 * useChannelPointRedemptionsPubSub
 *
 * Viewer-scoped channel point redemption feed via Twitch PubSub topic
 * `community-points-channel-v1.<broadcasterId>`.
 *
 * Unlike the EventSub subscription
 * (`channel.channel_points_custom_reward_redemption.add`), which only
 * works when the logged-in user is the channel's broadcaster (it requires
 * the `channel:read:redemptions` scope on the broadcaster's token), the
 * PubSub topic accepts a LISTEN from ANY authenticated user for ANY
 * channel. This is how viewer-facing clients like Chatterino show
 * channel point redemptions while watching other streamers' channels.
 *
 * The emitted `TwitchMessage` shape matches the chat pipeline's existing
 * redemption handling; the shared `recentRedemptionsRef` dedup in
 * `useLiveEvents` / `useChatMessages` collapses duplicates between IRC
 * and PubSub.
 */

import { useEffect, useRef, useState } from "react";
import { resolveBroadcasterId } from "../useEventSub";
import type { SubscriptionStatus } from "../useEventSub";
import type { TwitchMessage } from "../../../lib/types";

/** Connection state of the PubSub feed — reuses the EventSub status
 *  vocabulary (`SubscriptionStatus`) plus `"disconnected"` for "feed not
 *  active" so the chat header can render it like the subscription UI. */
export type PubSubConnectionStatus = SubscriptionStatus | "disconnected";

const PUBSUB_URL = "wss://pubsub-edge.twitch.tv";
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const RECONNECT_JITTER_MS = 250;

interface RedemptionEvent {
  id: string;
  userId: string;
  userName: string;
  userDisplayName: string;
  rewardId: string;
  rewardTitle: string;
  rewardCost: number;
  userInput: string;
  redeemedAt: string;
}

interface UseChannelPointRedemptionsPubSubOptions {
  channelId: string;
  accessToken: string;
  enabled: boolean;
  onRedemption: (message: TwitchMessage) => void;
}

function toChatMessage(redemptionEvent: RedemptionEvent): TwitchMessage {
  return {
    id: `redemption-${redemptionEvent.id}`,
    platform: "twitch",
    author: redemptionEvent.userDisplayName || redemptionEvent.userName,
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
}

/**
 * Parse the inner PubSub message payload (`reward-redeemed` /
 * `automatic-reward-redeemed`) into a `TwitchMessage`. Redemptions that
 * carry user input are skipped here — Twitch already surfaces those as
 * regular chat messages (PRIVMSG tagged `custom-reward-id`), so posting
 * them again would duplicate them in the feed.
 */
function handleRedeemPayload(
  innerMessage: unknown,
  onRedemption: (message: TwitchMessage) => void,
): void {
  const root = innerMessage as {
    type?: string;
    data?: {
      redemption?: {
        id?: string;
        user?: { id?: string; login?: string; display_name?: string };
        redeemed_at?: string;
        reward?: { id?: string; title?: string; cost?: number };
        user_input?: string;
      };
    };
  } | null;

  const eventType = root?.type;
  if (
    eventType !== "reward-redeemed" &&
    eventType !== "automatic-reward-redeemed"
  ) {
    return;
  }
  const redemption = root?.data?.redemption;
  if (!redemption) return;

  const userInput: string = redemption.user_input ?? "";
  if (userInput.trim().length > 0) return;

  const reward = redemption.reward ?? {};
  const user = redemption.user ?? {};

  const redemptionEvent: RedemptionEvent = {
    id: redemption.id ?? "",
    userId: user.id ?? "",
    userName: user.login ?? "",
    userDisplayName: user.display_name ?? user.login ?? "",
    rewardId: reward.id ?? "",
    rewardTitle: reward.title ?? "Channel Points Redemption",
    rewardCost: Number(reward.cost ?? 0),
    userInput: userInput.trim(),
    redeemedAt: redemption.redeemed_at ?? new Date().toISOString(),
  };

  onRedemption(toChatMessage(redemptionEvent));
}

export function useChannelPointRedemptionsPubSub({
  channelId,
  accessToken,
  enabled,
  onRedemption,
}: UseChannelPointRedemptionsPubSubOptions): PubSubConnectionStatus {
  const onRedemptionRef = useRef(onRedemption);
  useEffect(() => {
    onRedemptionRef.current = onRedemption;
  }, [onRedemption]);

  const [connectionStatus, setConnectionStatus] =
    useState<PubSubConnectionStatus>("disconnected");

  useEffect(() => {
    if (!enabled || !channelId || !accessToken) {
      setConnectionStatus("disconnected");
      return;
    }

    let cancelled = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectDelay = RECONNECT_BASE_MS;

    const connect = (topic: string) => {
      if (cancelled) return;
      // Non-browser environments (SSR, jsdom tests) may lack WebSocket.
      if (typeof WebSocket === "undefined") return;

      setConnectionStatus("pending");

      let socket: WebSocket;
      try {
        socket = new WebSocket(PUBSUB_URL);
      } catch (err) {
        console.warn(
          "[useChannelPointRedemptionsPubSub] socket creation failed:",
          err,
        );
        setConnectionStatus("error");
        return;
      }
      ws = socket;

      socket.onopen = () => {
        if (cancelled || ws !== socket) return;
        reconnectDelay = RECONNECT_BASE_MS;
        setConnectionStatus("connected");
        try {
          socket.send(
            JSON.stringify({
              type: "LISTEN",
              data: {
                topics: [topic],
                auth_token: accessToken,
              },
            }),
          );
        } catch (err) {
          console.warn(
            "[useChannelPointRedemptionsPubSub] LISTEN send failed:",
            err,
          );
        }
      };

      socket.onmessage = (event) => {
        if (cancelled || ws !== socket) return;
        let payload: unknown;
        try {
          payload = JSON.parse(String(event.data));
        } catch {
          return;
        }
        const msg = payload as {
          type?: string;
          error?: string | null;
          data?: { topic?: string; message?: string };
        } | null;

        switch (msg?.type) {
          case "PING":
            // Server keepalive — respond within 10 seconds or the socket
            // is dropped.
            try {
              socket.send(JSON.stringify({ type: "PONG" }));
            } catch {
              /* ignore */
            }
            return;
          case "RECONNECT":
            // Server is going down; closing triggers the reconnect path.
            socket.close(1000, "server requested reconnect");
            return;
          case "RESPONSE":
            if (msg.error) {
              console.warn(
                "[useChannelPointRedemptionsPubSub] LISTEN rejected for topic:",
                topic,
                msg.error,
              );
            }
            return;
          case "MESSAGE":
            if (msg.data?.topic !== topic) return;
            try {
              const inner = JSON.parse(msg.data.message ?? "{}");
              handleRedeemPayload(inner, (message) =>
                onRedemptionRef.current(message),
              );
            } catch {
              /* malformed payload — ignore */
            }
            return;
          default:
            return;
        }
      };

      socket.onclose = () => {
        if (ws !== socket) return;
        ws = null;
        if (cancelled) return;
        setConnectionStatus("error");
        const delay =
          reconnectDelay + Math.floor(Math.random() * RECONNECT_JITTER_MS);
        reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
        reconnectTimer = setTimeout(() => connect(topic), delay);
      };
    };

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
      connect(`community-points-channel-v1.${numericId}`);
    };

    void setup();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        ws?.close(1000, "hook unmounting");
      } catch {
        /* ignore */
      }
    };
  }, [channelId, accessToken, enabled]);

  return connectionStatus;
}