import { useState, useEffect, useCallback, useRef } from "react";
import { getRecentMessages } from "../../../lib/twitch";
import { saveMessage, pruneMessages } from "../../../lib/chatHistoryStorage";
import { MAX_DISPLAYED_MESSAGES } from "../../../lib/types";
import type { ChatMessage, PlatformSession } from "../../../lib/types";

export interface UseChatMessagesOptions {
  selectedTwitchChannelName?: string;
  twitchSession?: PlatformSession;
  showDeletedMessages?: boolean;
  showDeletedMessagesRef?: React.MutableRefObject<boolean>;
  currentUserBadgesRef?: React.MutableRefObject<{
    badges: Record<string, string>;
    badgeDetails: Record<string, { url: string; title: string }>;
  }>;
}

export interface UseChatMessagesReturn {
  messages: ChatMessage[];
  showPreloadedMessages: boolean;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setShowPreloadedMessages: (v: boolean) => void;
  preloadedMessagesRef: React.MutableRefObject<Set<string>>;
  recentRedemptionsRef: React.MutableRefObject<Map<string, number>>;
  handleTwitchMessage: (message: ChatMessage) => void;
  handleMessageDeleted: (messageId: string) => void;
}

export function useChatMessages({
  selectedTwitchChannelName = "",
  twitchSession,
  showDeletedMessages = true,
  showDeletedMessagesRef,
  currentUserBadgesRef,
}: UseChatMessagesOptions = {}): UseChatMessagesReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showPreloadedMessages, setShowPreloadedMessages] = useState(true);
  const preloadedMessagesRef = useRef<Set<string>>(new Set());
  const recentRedemptionsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    pruneMessages(24);

    const interval = setInterval(() => pruneMessages(24), 3600000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setMessages([]);
    preloadedMessagesRef.current.clear();
  }, [selectedTwitchChannelName]);

  useEffect(() => {
    if (!showPreloadedMessages || !selectedTwitchChannelName) return;

    const loadRecentMessages = async () => {
      try {
        const recentMessages = await getRecentMessages(
          selectedTwitchChannelName,
        );
        recentMessages.forEach((msg) =>
          preloadedMessagesRef.current.add(msg.id),
        );
        const uniqueRecent = recentMessages.filter(
          (msg, index, self) =>
            index === self.findIndex((t) => t.id === msg.id),
        );
        setMessages(uniqueRecent);
      } catch (error) {
        console.error("Failed to load recent messages:", error);
      }
    };
    loadRecentMessages();
  }, [showPreloadedMessages, selectedTwitchChannelName]);

  const handleTwitchMessage = useCallback(
    (message: ChatMessage) => {
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
          const enrichments: Partial<ChatMessage> = {};
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
            return copy.length > MAX_DISPLAYED_MESSAGES
              ? copy.slice(-MAX_DISPLAYED_MESSAGES)
              : copy;
          }
        }

        if (
          message.messageType === "redemption" &&
          message.rewardId &&
          message.userId &&
          (!message.content || message.content.trim().length === 0)
        ) {
          const dedupKey = `${message.rewardId}-${message.userId}`;
          const recentTime = recentRedemptionsRef.current.get(dedupKey);
          if (recentTime && Math.abs(Date.now() - recentTime) < 5000) {
            return prev;
          }
        }

        const updated = [...prev, message];

        saveMessage(message, selectedTwitchChannelName);

        return updated.length > MAX_DISPLAYED_MESSAGES
          ? updated.slice(-MAX_DISPLAYED_MESSAGES)
          : updated;
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
