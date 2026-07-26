import { useState, useEffect, useCallback, useRef } from "react";
import type { PlatformSession } from "../../../lib/types";
import type { YTMessage } from "../../../components/chat/unified/types";
import type { ModModeTarget } from "../../../contexts/ModerationContext";
import {
  deleteYouTubeMessage,
  banYouTubeUser,
  timeoutYouTubeUser,
} from "../../../lib/youtubeModeration";

export interface UseYouTubeModerationOptions {
  youtubeSession?: PlatformSession;
  youtubeVideoId?: string | null;
  /** Channel id of the live stream's owner, used to detect the broadcaster. */
  ytChannelId?: string | null;
  /** Current mod mode target selection, drives youtubeModModeActive. */
  modModeTarget?: ModModeTarget;
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
}

export function useYouTubeModeration({
  youtubeSession,
  youtubeVideoId,
  ytChannelId,
  modModeTarget = "off",
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

  // Moderator detection is scoped to the *current* stream and is fully
  // recomputed whenever the stream or its messages change — there is no
  // permanent "once a mod, always a mod" latch that could leak across streams.
  //
  //  - Broadcaster: the signed-in channel id equals the stream owner's channel
  //    id (authoritative, per-stream — sticky so it survives message churn).
  //  - Non-owner moderator: an authoritative moderator/owner badge appears on
  //    the signed-in user's OWN message in the current chat buffer.
  //
  // Anyone else (including verified channels and members) is NOT a moderator.
  const ownChannelId = youtubeSession?.userId;
  const ownerConfirmedVideoRef = useRef<string | null>(null);
  // Reset YouTube mod state when video/channel changes — intentional
  // eslint-disable-next-line no-adjust-state-on-prop-change
  useEffect(() => {
    if (!youtubeVideoId || !ownChannelId) {
      ownerConfirmedVideoRef.current = null;
      setIsYouTubeModerator(false);
      return;
    }

    // Broadcaster of this exact stream — sticky for the stream's lifetime.
    if (ytChannelId && ownChannelId === ytChannelId) {
      ownerConfirmedVideoRef.current = youtubeVideoId;
      setIsYouTubeModerator(true);
      return;
    }
    if (ownerConfirmedVideoRef.current === youtubeVideoId) return;

    // Non-owner moderator: re-derived from the current buffer so stale messages
    // from a previously-viewed stream can never keep mod mode enabled here.
    const hasOwnModMessage = (messages ?? []).some(
      (m) =>
        m.authorChannelId === ownChannelId &&
        (m.authorIsModerator || m.authorIsOwner),
    );
    setIsYouTubeModerator(hasOwnModMessage);
  }, [youtubeVideoId, ytChannelId, ownChannelId, messages]);

  // Sync YouTube mod mode based on moderator status — intentional
  // eslint-disable-next-line no-adjust-state-on-prop-change
  useEffect(() => {
    if (!youtubeVideoId) {
      setYoutubeModModeActive(false);
      return;
    }
    setYoutubeModModeActive(
      isYouTubeModerator &&
        (modModeTarget === "youtube" || modModeTarget === "both"),
    );
  }, [isYouTubeModerator, modModeTarget, youtubeVideoId]);

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

  return {
    isYouTubeModerator,
    youtubeModModeActive,
    setIsYouTubeModerator,
    setYoutubeModModeActive,
    handleToggleYoutubeModMode,
    handleYtDelete,
    handleYtBan,
    handleYtTimeout,
  };
}
