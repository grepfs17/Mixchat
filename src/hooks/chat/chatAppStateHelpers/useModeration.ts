import { useState, useEffect, useCallback } from "react";
import {
  deleteChatMessage,
  createBan,
  checkUserModStatus,
  removeBan,
  resolveBroadcasterId,
  cancelRaid,
  warnChatUser,
} from "../../../lib/twitch";
import type {
  ChatMessage,
  PlatformSession,
  Platform,
  MessageType,
} from "../../../lib/types";

export interface UseModerationOptions {
  twitchSession?: PlatformSession;
  selectedTwitchChannel?: string;
  selectedTwitchChannelName?: string;
  disableModModeByDefault?: boolean;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setNotification: (
    notification: {
      message: string;
      type: "success" | "error" | "info";
      id?: number;
    } | null,
  ) => void;
  notificationIdRef: React.MutableRefObject<number>;
}

export interface UseModerationReturn {
  isModerator: boolean;
  modModeActive: boolean;
  setIsModerator: (v: boolean) => void;
  setModModeActive: (v: boolean) => void;
  handleToggleModMode: () => void;
  handleDelete: (messageId: string) => Promise<void>;
  handleBan: (userId: string, displayName?: string) => Promise<void>;
  handleTimeout: (
    userId: string,
    seconds: number,
    displayName?: string,
  ) => Promise<void>;
  handleUntimeout: (userName: string) => Promise<void>;
  handleWarn: (userName: string) => Promise<void>;
  handleCancelRaid: () => Promise<void>;
  handleOwnBadgesLoaded: (
    badges: Record<string, string>,
    badgeDetails: Record<string, { url: string; title: string }>,
  ) => void;
}

export function useModeration({
  twitchSession,
  selectedTwitchChannel = "",
  selectedTwitchChannelName = "",
  disableModModeByDefault = false,
  setMessages,
  setNotification,
  notificationIdRef,
}: UseModerationOptions): UseModerationReturn {
  const [isModerator, setIsModerator] = useState(false);
  const [modModeActive, setModModeActive] = useState(false);

  useEffect(() => {
    if (twitchSession && selectedTwitchChannelName) {
      const isOwnerByName =
        (twitchSession.username || "").toLowerCase() ===
        selectedTwitchChannelName.toLowerCase();
      const isOwnerById =
        twitchSession.userId && selectedTwitchChannel
          ? twitchSession.userId === selectedTwitchChannel
          : false;
      const isOwner = isOwnerByName || isOwnerById;
      if (isOwner) {
        setIsModerator(true);
        setModModeActive(!disableModModeByDefault);
      } else {
        setModModeActive(false);
      }
    } else {
      setModModeActive(false);
    }
  }, [
    twitchSession,
    selectedTwitchChannelName,
    selectedTwitchChannel,
    disableModModeByDefault,
  ]);

  useEffect(() => {
    const checkModViaApi = async () => {
      if (
        twitchSession?.userId &&
        selectedTwitchChannel &&
        twitchSession.userId
      ) {
        try {
          const isMod = await checkUserModStatus(
            twitchSession.userId,
            import.meta.env.PUBLIC_TWITCH_CLIENT_ID,
            selectedTwitchChannel,
            twitchSession.userId,
          );
          if (isMod) {
            setIsModerator(true);
          }
        } catch (err) {
          console.error("[ChatApp] API mod check failed:", err);
        }
      }
    };
    checkModViaApi();
  }, [twitchSession?.userId, selectedTwitchChannel]);

  const handleOwnBadgesLoaded = useCallback(
    (
      badges: Record<string, string>,
      badgeDetails: Record<string, { url: string; title: string }>,
    ) => {
      const isOwnerByName =
        (twitchSession?.username || "").toLowerCase() ===
        selectedTwitchChannelName.toLowerCase();
      const isOwnerById =
        twitchSession?.userId && selectedTwitchChannel
          ? twitchSession.userId === selectedTwitchChannel
          : false;
      const isOwner = isOwnerByName || isOwnerById;
      const isMod = Boolean(
        badges && (badges["moderator"] || badges["broadcaster"]),
      );
      setIsModerator(isMod || isOwner);
    },
    [
      twitchSession?.username,
      twitchSession?.userId,
      selectedTwitchChannelName,
      selectedTwitchChannel,
    ],
  );

  const handleToggleModMode = useCallback(() => {
    if (!isModerator) return;
    setModModeActive((v) => !v);
  }, [isModerator]);

  const handleDelete = useCallback(
    async (messageId: string) => {
      if (!twitchSession || !selectedTwitchChannel) return;
      try {
        await deleteChatMessage(
          selectedTwitchChannel,
          twitchSession.userId,
          messageId,
        );
        notificationIdRef.current += 1;
        setNotification({
          message: "Message deleted",
          type: "success",
          id: notificationIdRef.current,
        });
      } catch (err) {
        console.error("Failed to delete message:", err);
        notificationIdRef.current += 1;
        setNotification({
          message: "Failed to delete message",
          type: "error",
          id: notificationIdRef.current,
        });
      }
    },
    [selectedTwitchChannel, twitchSession, notificationIdRef, setNotification],
  );

  const handleBan = useCallback(
    async (userId: string, displayName?: string) => {
      if (!twitchSession || !selectedTwitchChannel) return;
      try {
        await createBan(
          selectedTwitchChannel,
          twitchSession.userId,
          userId,
          undefined,
          "Banned via Mixchat",
        );
        notificationIdRef.current += 1;
        setNotification({
          message: `${displayName || userId} banned`,
          type: "success",
          id: notificationIdRef.current,
        });
      } catch (err) {
        console.error("Failed to ban user:", err);
        notificationIdRef.current += 1;
        setNotification({
          message: "Failed to ban user",
          type: "error",
          id: notificationIdRef.current,
        });
      }
    },
    [selectedTwitchChannel, twitchSession, notificationIdRef, setNotification],
  );

  const handleTimeout = useCallback(
    async (userId: string, seconds: number, displayName?: string) => {
      if (!twitchSession || !selectedTwitchChannel) return;
      try {
        await createBan(
          selectedTwitchChannel,
          twitchSession.userId,
          userId,
          seconds,
          `Timeout ${seconds}s`,
        );
        notificationIdRef.current += 1;
        setNotification({
          message: `${displayName || userId} timed out for ${seconds}s`,
          type: "success",
          id: notificationIdRef.current,
        });
      } catch (err) {
        console.error("Failed to timeout user:", err);
        notificationIdRef.current += 1;
        setNotification({
          message: "Failed to timeout user",
          type: "error",
          id: notificationIdRef.current,
        });
      }
    },
    [selectedTwitchChannel, twitchSession, notificationIdRef, setNotification],
  );

  const handleUntimeout = useCallback(
    async (userName: string) => {
      if (!twitchSession || !selectedTwitchChannel) return;
      try {
        const targetUserId = await resolveBroadcasterId(userName);
        await removeBan(
          selectedTwitchChannel,
          twitchSession.userId,
          targetUserId,
        );
        setMessages((prev) => [
          ...prev,
          {
            id: `untimeout-${userName}-${Date.now()}`,
            platform: "twitch" as Platform,
            author: "System",
            content: `${userName} timeout/ban was removed.`,
            timestamp: new Date(),
            userId: "system",
            authorColor: "#22c55e",
            mentionsUser: false,
            emotes: {},
            isBot: true,
            badges: {},
            badgeDetails: {},
            messageType: "untimeout" as MessageType,
            targetUsername: userName,
          },
        ]);
        notificationIdRef.current += 1;
        setNotification({
          message: `Removed timeout/ban for ${userName}`,
          type: "success",
          id: notificationIdRef.current,
        });
      } catch (err) {
        console.error("Failed to untimeout user:", err);
        notificationIdRef.current += 1;
        setNotification({
          message: "Failed to remove timeout",
          type: "error",
          id: notificationIdRef.current,
        });
      }
    },
    [
      selectedTwitchChannel,
      twitchSession,
      notificationIdRef,
      setNotification,
      setMessages,
    ],
  );

  const handleWarn = useCallback(
    async (userName: string) => {
      if (!selectedTwitchChannel || !twitchSession) return;
      const reason = prompt(
        `Enter a warning message for @${userName}:`,
        "Please follow the chat rules",
      );
      if (!reason) return;
      try {
        const resolvedUserId = await resolveBroadcasterId(userName);
        if (resolvedUserId === userName && !/^\d+$/.test(resolvedUserId)) {
          notificationIdRef.current += 1;
          setNotification({
            message: `Could not find user ${userName}`,
            type: "error",
            id: notificationIdRef.current,
          });
          return;
        }
        await warnChatUser(
          selectedTwitchChannel,
          twitchSession.userId,
          resolvedUserId,
          reason,
        );
        notificationIdRef.current += 1;
        setNotification({
          message: `Warning sent to ${userName}`,
          type: "success",
          id: notificationIdRef.current,
        });
      } catch (err: any) {
        console.error("Failed to warn user:", err);
        notificationIdRef.current += 1;
        setNotification({
          message: err.message || "Failed to warn user",
          type: "error",
          id: notificationIdRef.current,
        });
      }
    },
    [selectedTwitchChannel, twitchSession, notificationIdRef, setNotification],
  );

  const handleCancelRaid = useCallback(async () => {
    if (!selectedTwitchChannel) return;
    try {
      await cancelRaid(selectedTwitchChannel);
      notificationIdRef.current += 1;
      setNotification({
        message: "Raid cancelled",
        type: "success",
        id: notificationIdRef.current,
      });
    } catch (err: any) {
      console.error("Failed to cancel raid:", err);
      notificationIdRef.current += 1;
      setNotification({
        message: err.message || "Failed to cancel raid",
        type: "error",
        id: notificationIdRef.current,
      });
    }
  }, [selectedTwitchChannel, notificationIdRef, setNotification]);

  return {
    isModerator,
    modModeActive,
    setIsModerator,
    setModModeActive,
    handleToggleModMode,
    handleDelete,
    handleBan,
    handleTimeout,
    handleUntimeout,
    handleWarn,
    handleCancelRaid,
    handleOwnBadgesLoaded,
  };
}
