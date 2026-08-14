import { useCallback } from "react";
import { sendHelixMessage } from "../../../lib/twitch";

interface UseTwitchChatSendOptions {
  userId: string;
  broadcasterId: string;
  channelName: string;
}

export function useTwitchChatSend({
  userId,
  broadcasterId,
  channelName,
}: UseTwitchChatSendOptions) {
  return useCallback(
    async (message: string, replyToMessageId?: string) => {
      if (!userId) {
        throw new Error("Not connected to chat");
      }

      try {
        await sendHelixMessage(
          broadcasterId || channelName,
          userId,
          message,
          replyToMessageId,
        );
      } catch (error) {
        console.error("Failed to send message:", error);
        throw error;
      }
    },
    [broadcasterId, channelName, userId],
  );
}
