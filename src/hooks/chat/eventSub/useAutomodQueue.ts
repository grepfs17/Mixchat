/**
 * useAutomodQueue
 *
 * Subscribes to `automod.message.hold` and `automod.message.update`
 * via the shared EventSub connection.
 *
 * Required scope: moderator:manage:automod
 */

import { useEffect, useRef } from "react";
import { useEventSub } from "./useEventSub";

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

  const { subscribe } = useEventSub({ accessToken, clientId, enabled });
  const subscribeRef = useRef(subscribe);
  useEffect(() => {
    subscribeRef.current = subscribe;
  }, [subscribe]);

  useEffect(() => {
    if (!enabled || !channelId || !moderatorId) return;

    const unsubHold = subscribeRef.current(
      "automod.message.hold",
      "1",
      {
        broadcaster_user_id: channelId,
        moderator_user_id: moderatorId,
      },
      (ev: any) => {
        const rawMessage = ev.message;
        let content: string;
        if (typeof rawMessage === "string") {
          content = rawMessage;
        } else if (rawMessage && typeof rawMessage === "object") {
          content = rawMessage.text ?? "";
        } else {
          content = "";
        }

        onHeldMessageRef.current({
          id: ev.message_id as string,
          content,
          userId: ev.user_id as string,
          userName: ev.user_login as string,
          userDisplayName: ev.user_name as string,
          category: (ev.category as string) ?? "unknown",
          level: Number(ev.level ?? 1),
          holdDate: (ev.held_at as string) ?? new Date().toISOString(),
        });
      },
      onScopeError,
    );

    const unsubUpdate = subscribeRef.current(
      "automod.message.update",
      "1",
      {
        broadcaster_user_id: channelId,
        moderator_user_id: moderatorId,
      },
      (ev: any) => {
        onResolvedMessageRef.current?.({
          messageId: ev.message_id as string,
          status: ev.status as "approved" | "denied" | "expired",
        });
      },
    );

    return () => {
      unsubHold();
      unsubUpdate();
    };
  }, [channelId, moderatorId, enabled]);
}
