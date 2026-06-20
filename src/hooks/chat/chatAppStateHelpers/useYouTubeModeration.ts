import { useState, useEffect, useCallback, useRef } from "react";
import type { PlatformSession } from "../../../lib/types";
import type { YTMessage } from "../../../components/chat/unified/types";
import {
  deleteYouTubeMessage,
  banYouTubeUser,
  timeoutYouTubeUser,
} from "../../../lib/youtubeModeration";

export interface UseYouTubeModerationOptions {
  youtubeSession?: PlatformSession;
  youtubeVideoId?: string | null;
  setNotification: (
    notification: {
      message: string;
      type: "success" | "error" | "info";
      id?: number;
    } | null,
  ) => void;
  notificationIdRef: React.RefObject<number>;
  onLocalDelete?: (messageId: string) => void;
  /**
   * Current YouTube chat messages. Used to attach author channel + text to a
   * delete request so the server can resolve the official Data API message id
   * (the rendered InnerTube id is not accepted by liveChatMessages.delete).
   */
  messages?: YTMessage[];
  /** Reconstructs the plain text of a YT message from its parts. */
  getMessageText?: (m: YTMessage) => string;
}

export interface UseYouTubeModerationReturn {
  isYouTubeModerator: boolean;
  youtubeModModeActive: boolean;
  setIsYouTubeModerator: (v: boolean) => void;
  setYoutubeModModeActive: (v: boolean) => void;
  handleToggleYoutubeModMode: () => void;
  handleYtDelete: (messageId: string) => Promise<void>;
  handleYtBan: (channelId: string, displayName?: string) => Promise<void>;
  handleYtTimeout: (
    channelId: string,
    seconds: number,
    displayName?: string,
  ) => Promise<void>;
  handleYtOwnBadgesLoaded: (badges: Record<string, string> | undefined) => void;
}

const YOUTUBE_MOD_BADGE_KEYS = ["moderator", "owner", "broadcaster"];

function isYouTubeModBadge(value: string | undefined): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  return YOUTUBE_MOD_BADGE_KEYS.some((k) => lower.includes(k));
}

export function useYouTubeModeration({
  youtubeSession,
  youtubeVideoId,
  setNotification,
  notificationIdRef,
  onLocalDelete,
  messages,
  getMessageText,
}: UseYouTubeModerationOptions): UseYouTubeModerationReturn {
  const [isYouTubeModerator, setIsYouTubeModerator] = useState(false);
  const [youtubeModModeActive, setYoutubeModModeActive] = useState(false);
  const lastNotifiedIdRef = useRef<number | null>(null);

  // Keep the latest messages in a ref so handleYtDelete stays stable while
  // still seeing current data when resolving the official message id.
  const messagesRef = useRef<YTMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages ?? [];
  }, [messages]);

  useEffect(() => {
    if (!youtubeVideoId) {
      setYoutubeModModeActive(false);
      return;
    }
    if (isYouTubeModerator) {
      setYoutubeModModeActive(true);
    } else {
      setYoutubeModModeActive(false);
    }
  }, [isYouTubeModerator, youtubeVideoId]);

  const handleToggleYoutubeModMode = useCallback(() => {
    if (!isYouTubeModerator) return;
    setYoutubeModModeActive((v) => !v);
  }, [isYouTubeModerator]);

  const notify = useCallback(
    (message: string, type: "success" | "error" | "info") => {
      notificationIdRef.current += 1;
      const id = notificationIdRef.current;
      lastNotifiedIdRef.current = id;
      setNotification({ message, type, id });
    },
    [notificationIdRef, setNotification],
  );

  const handleYtDelete = useCallback(
    async (messageId: string) => {
      if (!youtubeVideoId) return;
      onLocalDelete?.(messageId);

      // Attach author channel + text + timestamp so the server can resolve the
      // official Data API message id (the rendered InnerTube id won't match).
      const target = messagesRef.current.find((m) => m.id === messageId);
      const context = target
        ? {
            channelId: target.authorChannelId,
            text: getMessageText ? getMessageText(target) : undefined,
            publishedAtMs:
              target.timestamp instanceof Date
                ? target.timestamp.getTime()
                : target.timestamp
                  ? new Date(target.timestamp).getTime()
                  : undefined,
          }
        : undefined;

      try {
        await deleteYouTubeMessage(youtubeVideoId, messageId, context);
        notify("Message deleted", "success");
      } catch (err) {
        console.error("Failed to delete YouTube message:", err);
        const message =
          err instanceof Error ? err.message : "Failed to delete message";
        notify(message, "error");
      }
    },
    [youtubeVideoId, notify, onLocalDelete, getMessageText],
  );

  const handleYtBan = useCallback(
    async (channelId: string, displayName?: string) => {
      if (!youtubeVideoId) return;
      try {
        await banYouTubeUser(youtubeVideoId, channelId, displayName);
        notify(`${displayName || channelId} banned`, "success");
      } catch (err) {
        console.error("Failed to ban YouTube user:", err);
        const message =
          err instanceof Error ? err.message : "Failed to ban user";
        notify(message, "error");
      }
    },
    [youtubeVideoId, notify],
  );

  const handleYtTimeout = useCallback(
    async (channelId: string, seconds: number, displayName?: string) => {
      if (!youtubeVideoId) return;
      try {
        await timeoutYouTubeUser(
          youtubeVideoId,
          channelId,
          seconds,
          displayName,
        );
        notify(
          `${displayName || channelId} timed out for ${seconds}s`,
          "success",
        );
      } catch (err) {
        console.error("Failed to timeout YouTube user:", err);
        const message =
          err instanceof Error ? err.message : "Failed to timeout user";
        notify(message, "error");
      }
    },
    [youtubeVideoId, notify],
  );

  const handleYtOwnBadgesLoaded = useCallback(
    (badges: Record<string, string> | undefined) => {
      if (!badges) return;
      // YouTube badge objects are keyed by the badge *label* (e.g. "Moderator",
      // "Owner") with the icon URL as the value. Inspect the keys.
      const isMod = Object.keys(badges).some((label) =>
        isYouTubeModBadge(label),
      );
      if (isMod) setIsYouTubeModerator(true);
    },
    [],
  );

  return {
    isYouTubeModerator,
    youtubeModModeActive,
    setIsYouTubeModerator,
    setYoutubeModModeActive,
    handleToggleYoutubeModMode,
    handleYtDelete,
    handleYtBan,
    handleYtTimeout,
    handleYtOwnBadgesLoaded,
  };
}
