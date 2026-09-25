import { useState, useEffect, useCallback, useRef } from "react";
import { getRecentMessages } from "../../../lib/twitch";
import { saveMessage, pruneMessages } from "../../../lib/chatHistoryStorage";
import {
  CHAT_HISTORY_MAX_AGE_HOURS,
  getMaxDisplayedMessages,
  REDEMPTION_DEDUP_MS,
} from "../../../lib/types";
import type { TwitchMessage, PlatformSession } from "../../../lib/types";

/**
 * Cross-source dedup for channel point redemptions. Twitch delivers the
 * same redemption over IRC (USERNOTICE `channel_points_reward` / PRIVMSG
 * `custom-reward-id`), EventSub and PubSub; the first copy to arrive
 * within the window wins. Returns `true` when the redemption is a
 * duplicate that should be dropped.
 */
export function isDuplicateRedemption(
  recent: Map<string, number>,
  rewardId: string,
  userId: string,
): boolean {
  const dedupKey = `${rewardId}-${userId}`;
  const now = Date.now();
  if (now - (recent.get(dedupKey) ?? 0) < REDEMPTION_DEDUP_MS) return true;
  recent.set(dedupKey, now);
  for (const [key, ts] of recent) {
    if (now - ts > REDEMPTION_DEDUP_MS) recent.delete(key);
  }
  return false;
}

export interface UseChatMessagesOptions {
  selectedTwitchChannelName?: string;
  twitchSession?: PlatformSession;
  showDeletedMessages?: boolean;
  showDeletedMessagesRef?: React.RefObject<boolean>;
  currentUserBadgesRef?: React.RefObject<{
    badges: Record<string, string>;
    badgeDetails: Record<string, { url: string; title: string }>;
  }>;
  badgesReady?: boolean;
}

export interface UseChatMessagesReturn {
  messages: TwitchMessage[];
  showPreloadedMessages: boolean;
  setMessages: React.Dispatch<React.SetStateAction<TwitchMessage[]>>;
  setShowPreloadedMessages: (v: boolean) => void;
  preloadedMessagesRef: React.RefObject<Set<string>>;
  recentRedemptionsRef: React.RefObject<Map<string, number>>;
  handleTwitchMessage: (message: TwitchMessage) => void;
  handleMessageDeleted: (messageId: string) => void;
}

export function useChatMessages({
  selectedTwitchChannelName = "",
  twitchSession,
  showDeletedMessages = true,
  showDeletedMessagesRef,
  currentUserBadgesRef,
  badgesReady = false,
}: UseChatMessagesOptions = {}): UseChatMessagesReturn {
  const [messages, setMessages] = useState<TwitchMessage[]>([]);
  const [showPreloadedMessages, setShowPreloadedMessages] = useState(true);
  const preloadedMessagesRef = useRef<Set<string>>(new Set());
  const recentRedemptionsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    pruneMessages(CHAT_HISTORY_MAX_AGE_HOURS);

    const interval = setInterval(
      () => pruneMessages(CHAT_HISTORY_MAX_AGE_HOURS),
      3600000,
    );
    return () => clearInterval(interval);
  }, []);

  // Clear messages when switching channels — intentional
  // eslint-disable-next-line no-adjust-state-on-prop-change
  useEffect(() => {
    setMessages([]);
    preloadedMessagesRef.current.clear();
  }, [selectedTwitchChannelName]);

  useEffect(() => {
    if (!showPreloadedMessages || !selectedTwitchChannelName || !badgesReady)
      return;

    let cancelled = false;
    const loadRecentMessages = async () => {
      try {
        const recentMessages = await getRecentMessages(
          selectedTwitchChannelName,
        );
        if (cancelled) return;
        recentMessages.forEach((msg) =>
          preloadedMessagesRef.current.add(msg.id),
        );
        const uniqueRecent = recentMessages.filter(
          (msg, index, self) =>
            index === self.findIndex((t) => t.id === msg.id),
        );
        if (!cancelled) {
          const max = getMaxDisplayedMessages();
          setMessages(uniqueRecent.slice(-max));
        }
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to load recent messages:", error);
      }
    };
    loadRecentMessages();
    return () => {
      cancelled = true;
    };
  }, [showPreloadedMessages, selectedTwitchChannelName, badgesReady]);

  const handleTwitchMessage = useCallback(
    (message: TwitchMessage) => {
      if (currentUserBadgesRef?.current) {
        if (message.isCurrentUser && !message.optimistic) {
          const hasBadges =
            (message.badgeDetails &&
              Object.keys(message.badgeDetails).length > 0) ||
            (message.badges && Object.keys(message.badges).length > 0);
          if (hasBadges) {
            currentUserBadgesRef.current = {
              badges: message.badges || {},
              badgeDetails: message.badgeDetails || {},
            };
          }
        }
      }

      // Dedup redemptions before touching state: the same redemption
      // arrives from IRC AND PubSub (and EventSub on the broadcaster's
      // own channel). Note this deliberately runs outside the setMessages
      // updater — writing the ref inside a reducer would misbehave under
      // React StrictMode's double-invocation.
      if (
        message.messageType === "redemption" &&
        message.rewardId &&
        message.userId &&
        isDuplicateRedemption(
          recentRedemptionsRef.current,
          message.rewardId,
          message.userId,
        )
      ) {
        return;
      }

      setMessages((prev) => {
        const existingIdx = prev.findIndex(
          (m) => m.id === message.id || m.id === `optimistic_${message.id}`,
        );
        if (existingIdx !== -1) {
          const existing = prev[existingIdx];
          if (existing.optimistic || existing.id.startsWith("optimistic_")) {
            saveMessage(message, selectedTwitchChannelName);
            const copy = [...prev];
            copy[existingIdx] = message;
            return copy;
          }
          const enrichments: Partial<TwitchMessage> = {};
          if (!existing.rewardTitle && message.rewardTitle)
            enrichments.rewardTitle = message.rewardTitle;
          if (existing.rewardCost == null && message.rewardCost != null)
            enrichments.rewardCost = message.rewardCost;
          if (!existing.authorAvatar && message.authorAvatar)
            enrichments.authorAvatar = message.authorAvatar;
          if (!existing.sourceChannelLogin && message.sourceChannelLogin)
            enrichments.sourceChannelLogin = message.sourceChannelLogin;
          if (!existing.sourceChannelAvatar && message.sourceChannelAvatar)
            enrichments.sourceChannelAvatar = message.sourceChannelAvatar;

          if (Object.keys(enrichments).length > 0) {
            const copy = [...prev];
            copy[existingIdx] = { ...existing, ...enrichments };
            return copy;
          }
          return prev;
        }

        const sessionName = (
          twitchSession?.displayName ||
          twitchSession?.username ||
          ""
        ).toLowerCase();
        const isFromSession = Boolean(
          message.isCurrentUser ||
          (message.userId && message.userId === twitchSession?.userId) ||
          (message.author &&
            sessionName &&
            message.author.toLowerCase() === sessionName),
        );

        const normalize = (s?: string) =>
          (s || "").normalize("NFKC").trim().toLowerCase();
        const serverNorm = normalize(message.content);

        if (isFromSession) {
          let matchIndex = -1;

          if (message.userId) {
            matchIndex = prev.findIndex(
              (m) =>
                m.optimistic &&
                m.userId === message.userId &&
                normalize(m.content) === serverNorm &&
                (m.replyTo?.id || "") === (message.replyTo?.id || ""),
            );
          }

          if (matchIndex === -1 && message.author) {
            matchIndex = prev.findIndex(
              (m) =>
                m.optimistic &&
                m.author &&
                m.author.toLowerCase() === message.author.toLowerCase() &&
                normalize(m.content) === serverNorm &&
                (m.replyTo?.id || "") === (message.replyTo?.id || ""),
            );
          }

          if (matchIndex === -1) {
            const serverTs = message.timestamp
              ? new Date(message.timestamp).getTime()
              : Date.now();
            matchIndex = prev.findIndex(
              (m) =>
                m.optimistic &&
                Math.abs((m.timestamp?.getTime() || 0) - serverTs) < 10000 &&
                normalize(m.content) === serverNorm &&
                (m.replyTo?.id || "") === (message.replyTo?.id || ""),
            );
          }

          if (matchIndex !== -1) {
            saveMessage(message, selectedTwitchChannelName);
            const copy = [...prev];
            copy[matchIndex] = message;
            const max = getMaxDisplayedMessages();
            return copy.length > max ? copy.slice(-max) : copy;
          }
        }

        const updated = [...prev, message];

        saveMessage(message, selectedTwitchChannelName);

        const max = getMaxDisplayedMessages();
        return updated.length > max ? updated.slice(-max) : updated;
      });
    },
    [twitchSession, selectedTwitchChannelName, currentUserBadgesRef],
  );

  const handleMessageDeleted = useCallback(
    (messageId: string) => {
      setMessages((prev) => {
        if (showDeletedMessagesRef?.current ?? showDeletedMessages) {
          return prev.map((m) =>
            m.id === messageId ? { ...m, isDeleted: true } : m,
          );
        } else {
          return prev.filter((m) => m.id !== messageId);
        }
      });
    },
    [showDeletedMessagesRef, showDeletedMessages],
  );

  return {
    messages,
    showPreloadedMessages,
    setMessages,
    setShowPreloadedMessages,
    preloadedMessagesRef,
    recentRedemptionsRef,
    handleTwitchMessage,
    handleMessageDeleted,
  };
}
