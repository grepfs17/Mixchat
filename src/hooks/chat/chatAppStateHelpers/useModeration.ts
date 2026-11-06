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
  sendHelixMessage,
  pinTwitchMessage,
  unpinTwitchMessage,
  getPinnedTwitchMessageId,
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
  handleDelete: (messageId: string) => Promise<void>;
  handleBan: (userId: string, displayName?: string) => Promise<void>;
  handleTimeout: (
    userId: string,
    seconds: number,
    displayName?: string,
  ) => Promise<void>;
  handleUntimeout: (userName: string) => Promise<void>;
  handleWarn: (userName: string) => Promise<void>;
  handleShoutout: (userName: string) => Promise<void>;
  handlePinMessage: (messageId: string) => Promise<void>;
  handleCancelRaid: () => Promise<void>;
  handleOwnBadgesLoaded: (
    badges: Record<string, string>,
    badgeDetails: Record<string, { url: string; title: string }>,
  ) => void;
  handleModCommand: (
    message: string,
  ) => Promise<{ handled: boolean; error?: string }>;
}

function parseTimeoutDuration(raw: string): number {
  const match = raw.match(/^(\d+)([smhd])?$/i);
  if (match) {
    const val = parseInt(match[1]);
    const unit = (match[2] || "s").toLowerCase();
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return val * (multipliers[unit] || 1);
  }
  return 600;
}

function makeSystemMessage(targetUser: string): TwitchMessage {
  return {
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
  };
}

interface ModCommandDeps {
  notificationIdRef: React.RefObject<number>;
  setNotification: (n: { message: string; type: "success" | "error" | "info"; id?: number } | null) => void;
  setMessages: React.Dispatch<React.SetStateAction<TwitchMessage[]>>;
  setPendingRaid: (raid: RaidOutEvent | null) => void;
  setIsRaidInitiator: (v: boolean) => void;
}

function notify(
  deps: ModCommandDeps,
  message: string,
  type: "success" | "error",
): void {
  deps.notificationIdRef.current += 1;
  deps.setNotification({ message, type, id: deps.notificationIdRef.current });
}

async function executeModCommand(
  action: string,
  parts: string[],
  session: PlatformSession,
  channelId: string,
  channelName: string,
  isOwner: boolean,
  deps: ModCommandDeps,
): Promise<{ handled: boolean; error?: string }> {
  const catchErr = (err: any, cmd: string) =>
    ({ handled: true, error: err.message || `Failed to execute ${cmd}` });

  // Commands that require no target user
  if (action === "/clear") {
    try {
      await clearChat(channelId, session.userId);
      return { handled: true };
    } catch (err) { return catchErr(err, action); }
  }

  if (action === "/raid" || action === "/unraid") {
    if (!isOwner) return { handled: false, error: "Only the broadcaster can start or cancel a raid" };
    try {
      if (action === "/unraid") {
        await cancelRaid(channelId);
        notify(deps, "Raid cancelled", "success");
        deps.setPendingRaid(null);
        deps.setIsRaidInitiator(false);
        return { handled: true };
      }
      const targetUser = parts[1];
      if (!targetUser) return { handled: false, error: "/raid requires a username" };
      const resolvedId = await resolveBroadcasterId(targetUser);
      if (resolvedId === targetUser && !/^\d+$/.test(resolvedId))
        return { handled: false, error: `Could not find user ${targetUser}` };
      await startRaid(channelId, resolvedId);
      notify(deps, `Raiding ${targetUser}`, "success");
      deps.setPendingRaid({
        fromLogin: session?.username || "",
        fromDisplayName: session?.displayName || session?.username || "",
        targetLogin: targetUser,
        targetDisplayName: targetUser,
        viewerCount: 0,
      });
      deps.setIsRaidInitiator(true);
      return { handled: true };
    } catch (err) { return catchErr(err, action); }
  }

  if (action === "/announce") {
    const text = parts.slice(1).join(" ");
    if (!text) return { handled: false, error: "Usage: /announce <message>" };
    try {
      await sendAnnouncement(channelId, session.userId, text);
      notify(deps, "Announcement sent!", "success");
      return { handled: true };
    } catch (err) { return catchErr(err, action); }
  }

  if (action === "/pin") {
    const text = parts.slice(1).join(" ");
    if (!text) return { handled: false, error: "Usage: /pin <message>" };
    try {
      const messageId = await sendHelixMessage(channelId, session.userId, text);
      if (!messageId) {
        return {
          handled: true,
          error: "Message was sent but could not be pinned (no message ID returned)",
        };
      }
      await pinTwitchMessage(channelId, session.userId, messageId);
      notify(deps, "Message pinned!", "success");
      return { handled: true };
    } catch (err) { return catchErr(err, action); }
  }

  if (action === "/unpin") {
    try {
      const messageId = await getPinnedTwitchMessageId(channelId, session.userId);
      if (!messageId) {
        notify(deps, "No pinned message to unpin", "error");
        return { handled: true };
      }
      await unpinTwitchMessage(channelId, session.userId, messageId);
      notify(deps, "Message unpinned!", "success");
      return { handled: true };
    } catch (err) { return catchErr(err, action); }
  }

  // Commands that require a target user
  const targetUser = parts[1];
  if (!targetUser) {
    const usage = action === "/warn" ? "Usage: /warn <username> [reason]" : `${action} requires a username`;
    return { handled: false, error: usage };
  }

  const resolvedId = await resolveBroadcasterId(targetUser);
  if (resolvedId === targetUser && !/^\d+$/.test(resolvedId))
    return { handled: false, error: `Could not find user ${targetUser}` };

  switch (action) {
    case "/unban":
    case "/untimeout":
      try {
        await removeBan(channelId, session.userId, resolvedId);
        deps.setMessages((prev) => [...prev, makeSystemMessage(targetUser)]);
        notify(deps, `Removed timeout/ban for ${targetUser}`, "success");
        return { handled: true };
      } catch (err) { return catchErr(err, action); }

    case "/timeout": {
      const duration = parseTimeoutDuration(parts[2] || "600");
      const reasonIdx = /^\d+([smhd])?$/i.test(parts[2] || "") ? 3 : 2;
      const reason = parts.slice(reasonIdx).join(" ") || null;
      try {
        await createBan(channelId, session.userId, resolvedId, duration, reason);
        return { handled: true };
      } catch (err) { return catchErr(err, action); }
    }

    case "/ban": {
      const reason = parts.slice(2).join(" ") || null;
      try {
        await createBan(channelId, session.userId, resolvedId, undefined, reason);
        return { handled: true };
      } catch (err) { return catchErr(err, action); }
    }

    case "/shoutout":
      try {
        await sendShoutout(channelId, resolvedId, session.userId);
        notify(deps, `Shoutout sent to ${targetUser}!`, "success");
        return { handled: true };
      } catch (err) { return catchErr(err, action); }

    case "/warn": {
      const reason = parts.slice(2).join(" ") || undefined;
      try {
        await warnChatUser(channelId, session.userId, resolvedId, reason);
        notify(deps, `Warning sent to ${targetUser}`, "success");
        return { handled: true };
      } catch (err) { return catchErr(err, action); }
    }

    default:
      return { handled: false };
  }
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

  // Moderator status is channel-scoped. Clear the previous channel's result
  // before the name/API/badge checks run again for the new channel.
  useEffect(() => {
    setIsModerator(false);
  }, [twitchSession?.userId, selectedTwitchChannel, selectedTwitchChannelName]);

  const modModeActive =
    isModerator && (modModeTarget === "twitch" || modModeTarget === "both");

  // Derive moderator status from session and channel. Intentional
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
    let cancelled = false;
    const checkModViaApi = async () => {
      if (
        twitchSession?.userId &&
        selectedTwitchChannel &&
        twitchSession.userId
      ) {
        try {
          const isMod = await checkUserModStatus(
            twitchSession.accessToken,
            import.meta.env.PUBLIC_TWITCH_CLIENT_ID,
            selectedTwitchChannel,
            twitchSession.userId,
          );
          if (!cancelled && isMod) {
            setIsModerator(true);
          }
        } catch (err) {
          if (cancelled) return;
          console.error("[ChatApp] API mod check failed:", err);
        }
      }
    };
    checkModViaApi();
    return () => {
      cancelled = true;
    };
  }, [twitchSession?.userId, twitchSession?.accessToken, selectedTwitchChannel]);

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

  const handleShoutout = useCallback(
    async (userName: string) => {
      if (!selectedTwitchChannel || !twitchSession) return;
      const target = userName.replace(/^@/, "").trim();
      if (!target) return;
      try {
        await sendShoutout(
          selectedTwitchChannel,
          target,
          twitchSession.userId,
        );
        notificationIdRef.current += 1;
        setNotification({
          message: `Shoutout sent to ${target}!`,
          type: "success",
          id: notificationIdRef.current,
        });
      } catch (err: any) {
        console.error("Failed to send shoutout:", err);
        notificationIdRef.current += 1;
        setNotification({
          message: err.message || "Failed to send shoutout",
          type: "error",
          id: notificationIdRef.current,
        });
      }
    },
    [selectedTwitchChannel, twitchSession, notificationIdRef, setNotification],
  );

  const handlePinMessage = useCallback(
    async (messageId: string) => {
      if (!twitchSession || !selectedTwitchChannel) return;
      try {
        await pinTwitchMessage(
          selectedTwitchChannel,
          twitchSession.userId,
          messageId,
        );
        notificationIdRef.current += 1;
        setNotification({
          message: "Message pinned",
          type: "success",
          id: notificationIdRef.current,
        });
      } catch (err) {
        console.error("Failed to pin message:", err);
        notificationIdRef.current += 1;
        setNotification({
          message: "Failed to pin message",
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
      const action = parts[0].toLowerCase();

      const isOwner = Boolean(
        (twitchSession?.username || "").toLowerCase() ===
          (selectedTwitchChannelName || "").toLowerCase() ||
        (twitchSession?.userId &&
          twitchSession.userId === selectedTwitchChannel),
      );

      return executeModCommand(
        action,
        parts,
        twitchSession,
        selectedTwitchChannel,
        selectedTwitchChannelName,
        isOwner,
        { notificationIdRef, setNotification, setMessages, setPendingRaid, setIsRaidInitiator },
      );
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
    handleDelete,
    handleBan,
    handleTimeout,
    handleUntimeout,
    handleWarn,
    handleShoutout,
    handlePinMessage,
    handleCancelRaid,
    handleOwnBadgesLoaded,
    handleModCommand,
  };
}
