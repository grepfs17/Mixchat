import { useState, useCallback } from "react";
import { manageHeldAutomodMessage } from "../../../lib/twitch";
import type { HeldMessage } from "../eventSubHelpers/useAutomodQueue";

export interface UseAutomodStateReturn {
  heldMessages: HeldMessage[];
  handleHeldMessage: (message: HeldMessage) => void;
  approveMessage: (msgId: string) => Promise<void>;
  denyMessage: (msgId: string) => Promise<void>;
  dismissMessage: (msgId: string) => void;
  clearAll: () => void;
}

export function useAutomodState({
  moderatorId,
  onError,
}: {
  moderatorId: string;
  onError?: (message: string) => void;
}): UseAutomodStateReturn {
  const [heldMessages, setHeldMessages] = useState<HeldMessage[]>([]);

  const handleHeldMessage = useCallback((message: HeldMessage) => {
    setHeldMessages((prev) => {
      // Deduplicate by message ID
      if (prev.some((m) => m.id === message.id)) return prev;
      return [...prev, message];
    });
  }, []);

  const dismissMessage = useCallback((msgId: string) => {
    setHeldMessages((prev) => prev.filter((m) => m.id !== msgId));
  }, []);

  const clearAll = useCallback(() => {
    setHeldMessages([]);
  }, []);

  const approveMessage = useCallback(
    async (msgId: string) => {
      try {
        await manageHeldAutomodMessage(moderatorId, msgId, "ALLOW");
        dismissMessage(msgId);
      } catch (error) {
        console.error("Failed to approve automod message:", error);
        onError?.("Failed to approve message");
      }
    },
    [moderatorId, dismissMessage, onError],
  );

  const denyMessage = useCallback(
    async (msgId: string) => {
      try {
        await manageHeldAutomodMessage(moderatorId, msgId, "DENY");
        dismissMessage(msgId);
      } catch (error) {
        console.error("Failed to deny automod message:", error);
        onError?.("Failed to deny message");
      }
    },
    [moderatorId, dismissMessage, onError],
  );

  return {
    heldMessages,
    handleHeldMessage,
    approveMessage,
    denyMessage,
    dismissMessage,
    clearAll,
  };
}
