import { useState, useEffect, useCallback } from "react";
import {
  deleteTwitchMessage,
  createBan,
  checkUserModStatus,
  removeBan,
  resolveBroadcasterId,
  cancelRaid,
  warnChatUser,
  clearChat,
  startRaid,
  sendAnnouncement,
  sendShoutout,
} from "../../../lib/twitch";
import type {
  TwitchMessage,
  PlatformSession,
  Platform,
  MessageType,
} from "../../../lib/types";
import type { RaidOutEvent } from "../eventSubHelpers/useRaidDetection";
import type { ModModeTarget } from "../../../contexts/ModerationContext";

export interface UseModerationOptions {
  twitchSession?: PlatformSession;
  selectedTwitchChannel?: string;
  selectedTwitchChannelName?: string;
  /** Current mod mode target selection, drives modModeActive. */
  modModeTarget?: ModModeTarget;
  setMessages: React.Dispatch<React.SetStateAction<TwitchMessage[]>>;
  setNotification: (
    notification: {
      message: string;
      type: "success" | "error" | "info";
      id?: number;
    } | null,
  ) => void;
  notificationIdRef: React.RefObject<number>;
  setPendingRaid: (raid: RaidOutEvent | null) => void;
  setIsRaidInitiator: (initiator: boolean) => void;
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
  handleModCommand: (
    message: string,
  ) => Promise<{ handled: boolean; error?: string }>;
}

export function useModeration({
  twitchSession,
  selectedTwitchChannel = "",
  selectedTwitchChannelName = "",
  modModeTarget = "off",
  setMessages,
  setNotification,
  notificationIdRef,
  setPendingRaid,
  setIsRaidInitiator,
}: UseModerationOptions): UseModerationReturn {
  const [isModerator, setIsModerator] = useState(false);
  const [modModeActive, setModModeActive] = useState(false);

  // Derive moderator status from session and channel — intentional
  // eslint-disable-next-line no-adjust-state-on-prop-change
  useEffect(() => {
    if (twitchSession && selectedTwitchChannelName) {
      const isOwnerByName =
        (twitchSession.username || "").toLowerCase() ===
        selectedTwitchChannelName.toLowerCase();
      const isOwnerById =
        twitchSession.userId && selectedTwitchChannel
          ? twitchSession.userId === selectedTwitchChannel
          : false;
      if (isOwnerByName || isOwnerById) {
        setIsModerator(true);
      }
    }
  }, [twitchSession, selectedTwitchChannelName, selectedTwitchChannel]);

  useEffect(() => {
    setModModeActive(
      isModerator && (modModeTarget === "twitch" || modModeTarget === "both"),
    );
  }, [isModerator, modModeTarget]);

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
        await deleteTwitchMessage(
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
          `Timeout via Mixchat ${seconds}s`,
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
      setPendingRaid(null);
      setIsRaidInitiator(false);
    } catch (err: any) {
      console.error("Failed to cancel raid:", err);
      notificationIdRef.current += 1;
      setNotification({
        message: err.message || "Failed to cancel raid",
        type: "error",
        id: notificationIdRef.current,
      });
    }
  }, [
    selectedTwitchChannel,
    notificationIdRef,
    setNotification,
    setPendingRaid,
    setIsRaidInitiator,
  ]);

  const handleModCommand = useCallback(
    async (message: string): Promise<{ handled: boolean; error?: string }> => {
      if (
        !message.startsWith("/") ||
        !twitchSession ||
        !selectedTwitchChannel
      ) {
        return { handled: false };
      }

      const parts = message.split(/\s+/);
      const cmd = parts[0].toLowerCase();

      if (
        cmd === "/timeout" ||
        cmd === "/ban" ||
        cmd === "/unban" ||
        cmd === "/untimeout" ||
        cmd === "/clear"
      ) {
        try {
          if (cmd === "/clear") {
            await clearChat(selectedTwitchChannel, twitchSession.userId);
            return { handled: true };
          }

          const targetUser = parts[1];
          if (!targetUser)
            return { handled: false, error: `${cmd} requires a username` };

          const resolvedTargetId = await resolveBroadcasterId(targetUser);
          if (
            resolvedTargetId === targetUser &&
            !/^\d+$/.test(resolvedTargetId)
          ) {
            return {
              handled: false,
              error: `Could not find user ${targetUser}`,
            };
          }

          if (cmd === "/unban" || cmd === "/untimeout") {
            await removeBan(
              selectedTwitchChannel,
              twitchSession.userId,
              resolvedTargetId,
            );
            setMessages((prev) => [
              ...prev,
              {
                id: `untimeout-${targetUser}-${Date.now()}`,
                platform: "twitch" as Platform,
                author: "System",
                content: `${targetUser} timeout/ban was removed.`,
                timestamp: new Date(),
                userId: "system",
                authorColor: "#22c55e",
                mentionsUser: false,
                emotes: {},
                isBot: true,
                badges: {},
                badgeDetails: {},
                messageType: "untimeout" as MessageType,
                targetUsername: targetUser,
              },
            ]);
            notificationIdRef.current += 1;
            setNotification({
              message: `Removed timeout/ban for ${targetUser}`,
              type: "success",
              id: notificationIdRef.current,
            });
            return { handled: true };
          }

          let duration: number | undefined = undefined;
          let reasonIndex = 2;

          if (cmd === "/timeout") {
            const durationStr = parts[2] || "600";
            const match = durationStr.match(/^(\d+)([smhd])?$/i);
            if (match) {
              const val = parseInt(match[1]);
              const unit = (match[2] || "s").toLowerCase();
              const multipliers: Record<string, number> = {
                s: 1,
                m: 60,
                h: 3600,
                d: 86400,
              };
              duration = val * (multipliers[unit] || 1);
              reasonIndex = 3;
            } else {
              duration = 600;
            }
          }

          const reason = parts.slice(reasonIndex).join(" ") || null;
          await createBan(
            selectedTwitchChannel,
            twitchSession.userId,
            resolvedTargetId,
            duration,
            reason,
          );
          return { handled: true };
        } catch (err: any) {
          return {
            handled: true,
            error: err.message || `Failed to execute ${cmd}`,
          };
        }
      }

      if (cmd === "/raid" || cmd === "/unraid") {
        const isOwnerByName =
          (twitchSession?.username || "").toLowerCase() ===
          (selectedTwitchChannelName || "").toLowerCase();
        const isOwnerById =
          twitchSession?.userId && selectedTwitchChannel
            ? twitchSession.userId === selectedTwitchChannel
            : false;
        if (!isOwnerByName && !isOwnerById) {
          return {
            handled: false,
            error: "Only the broadcaster can start or cancel a raid",
          };
        }

        try {
          if (cmd === "/unraid") {
            await cancelRaid(selectedTwitchChannel);
            notificationIdRef.current += 1;
            setNotification({
              message: "Raid cancelled",
              type: "success",
              id: notificationIdRef.current,
            });
            setPendingRaid(null);
            setIsRaidInitiator(false);
            return { handled: true };
          }

          const targetUser = parts[1];
          if (!targetUser)
            return { handled: false, error: "/raid requires a username" };

          const resolvedTargetId = await resolveBroadcasterId(targetUser);
          if (
            resolvedTargetId === targetUser &&
            !/^\d+$/.test(resolvedTargetId)
          ) {
            return {
              handled: false,
              error: `Could not find user ${targetUser}`,
            };
          }

          await startRaid(selectedTwitchChannel, resolvedTargetId);
          notificationIdRef.current += 1;
          setNotification({
            message: `Raiding ${targetUser}`,
            type: "success",
            id: notificationIdRef.current,
          });
          setPendingRaid({
            fromLogin: twitchSession?.username || "",
            fromDisplayName:
              twitchSession?.displayName || twitchSession?.username || "",
            targetLogin: targetUser,
            targetDisplayName: targetUser,
            viewerCount: 0,
          });
          setIsRaidInitiator(true);
          return { handled: true };
        } catch (err: any) {
          return {
            handled: true,
            error: err.message || `Failed to execute ${cmd}`,
          };
        }
      }

      if (cmd === "/announce") {
        const announcementText = parts.slice(1).join(" ");
        if (!announcementText) {
          return { handled: false, error: "Usage: /announce <message>" };
        }
        try {
          await sendAnnouncement(
            selectedTwitchChannel,
            twitchSession.userId,
            announcementText,
          );
          notificationIdRef.current += 1;
          setNotification({
            message: "Announcement sent!",
            type: "success",
            id: notificationIdRef.current,
          });
          return { handled: true };
        } catch (err: any) {
          return {
            handled: true,
            error: err.message || "Failed to send announcement",
          };
        }
      }

      if (cmd === "/shoutout") {
        const targetUser = parts[1];
        if (!targetUser) {
          return { handled: false, error: "Usage: /shoutout <username>" };
        }
        try {
          const resolvedTargetId = await resolveBroadcasterId(targetUser);
          if (
            resolvedTargetId === targetUser &&
            !/^\d+$/.test(resolvedTargetId)
          ) {
            return {
              handled: false,
              error: `Could not find user ${targetUser}`,
            };
          }
          await sendShoutout(
            selectedTwitchChannel,
            resolvedTargetId,
            twitchSession.userId,
          );
          notificationIdRef.current += 1;
          setNotification({
            message: `Shoutout sent to ${targetUser}!`,
            type: "success",
            id: notificationIdRef.current,
          });
          return { handled: true };
        } catch (err: any) {
          return {
            handled: true,
            error: err.message || "Failed to send shoutout",
          };
        }
      }

      if (cmd === "/warn") {
        const targetUser = parts[1];
        if (!targetUser) {
          return { handled: false, error: "Usage: /warn <username> [reason]" };
        }
        try {
          const resolvedTargetId = await resolveBroadcasterId(targetUser);
          if (
            resolvedTargetId === targetUser &&
            !/^\d+$/.test(resolvedTargetId)
          ) {
            return {
              handled: false,
              error: `Could not find user ${targetUser}`,
            };
          }
          const reason = parts.slice(2).join(" ") || undefined;
          await warnChatUser(
            selectedTwitchChannel,
            twitchSession.userId,
            resolvedTargetId,
            reason,
          );
          notificationIdRef.current += 1;
          setNotification({
            message: `Warning sent to ${targetUser}`,
            type: "success",
            id: notificationIdRef.current,
          });
          return { handled: true };
        } catch (err: any) {
          return { handled: true, error: err.message || "Failed to warn user" };
        }
      }

      return { handled: false };
    },
    [
      twitchSession,
      selectedTwitchChannel,
      selectedTwitchChannelName,
      notificationIdRef,
      setNotification,
      setMessages,
      setPendingRaid,
      setIsRaidInitiator,
    ],
  );

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
    handleModCommand,
  };
}
