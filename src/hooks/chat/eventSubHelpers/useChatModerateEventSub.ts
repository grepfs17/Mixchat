/**
 * Subscribes to `channel.moderate` v1 via the shared EventSub connection.
 * Adds the moderator name to delete, ban, and timeout actions, which IRC
 * does not include.
 *
 * Requires the moderator:read:* / moderator:manage:* scopes listed in
 * TWITCH_SCOPES and a broadcaster or moderator token for the channel.
 */

import { useEffect, useRef } from "react";
import type { SubscribeFn } from "../useEventSub";
import {
  rememberModerationActor,
  type ModerationActorAction,
} from "../../../lib/twitchModerationActions";

export interface ChatModerateEvent {
  action: "delete" | ModerationActorAction;
  moderatorName: string;
  targetLogin: string;
  targetUserId?: string;
  messageId?: string;
}

interface UseChatModerateEventSubOptions {
  subscribe: SubscribeFn;
  channelId: string;
  moderatorId: string;
  enabled: boolean;
  onModerate: (event: ChatModerateEvent) => void;
  onScopeError?: () => void;
}

function readName(event: any): string {
  const name = event?.moderator_user_name || event?.moderator_user_login || "";
  return typeof name === "string" ? name.trim() : "";
}

export function useChatModerateEventSub({
  subscribe,
  channelId,
  moderatorId,
  enabled,
  onModerate,
  onScopeError,
}: UseChatModerateEventSubOptions): void {
  const onModerateRef = useRef(onModerate);
  useEffect(() => {
    onModerateRef.current = onModerate;
  }, [onModerate]);

  const subscribeRef = useRef(subscribe);
  useEffect(() => {
    subscribeRef.current = subscribe;
  }, [subscribe]);

  useEffect(() => {
    if (!enabled || !channelId || !moderatorId) return;

    const unsubscribe = subscribeRef.current(
      "channel.moderate",
      "1",
      {
        broadcaster_user_id: channelId,
        moderator_user_id: moderatorId,
      },
      (ev: any) => {
        const action = ev?.action;
        if (action !== "delete" && action !== "ban" && action !== "timeout") {
          return;
        }

        const moderatorName = readName(ev);
        if (!moderatorName) return;

        if (action === "delete") {
          const details = ev.delete;
          const messageId =
            typeof details?.message_id === "string" ? details.message_id : "";
          if (!messageId) return;
          onModerateRef.current({
            action,
            moderatorName,
            targetLogin: details?.user_login ?? "",
            messageId,
          });
          return;
        }

        const details = action === "ban" ? ev.ban : ev.timeout;
        const targetLogin =
          typeof details?.user_login === "string" ? details.user_login : "";
        if (!targetLogin) return;
        rememberModerationActor(action, targetLogin, moderatorName);
        onModerateRef.current({
          action,
          moderatorName,
          targetLogin,
          targetUserId:
            typeof details?.user_id === "string" ? details.user_id : undefined,
        });
      },
      onScopeError,
    );

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, moderatorId, enabled]);
}
