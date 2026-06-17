import { useCallback } from "react";
import type { ChatClient } from "@twurple/chat";

interface UseTwitchChatSendOptions {
  client: ChatClient | null;
  isConnected: boolean;
  channelName: string;
}

export function useTwitchChatSend({
  client,
  isConnected,
  channelName,
}: UseTwitchChatSendOptions) {
  return useCallback(
    async (message: string, replyToMessageId?: string) => {
      if (!client || !isConnected) {
        throw new Error("Not connected to chat");
      }

      try {
        if (replyToMessageId) {
          await client.say(channelName, message, { replyTo: replyToMessageId });
        } else {
          await client.say(channelName, message);
        }
      } catch (error) {
        console.error("Failed to send message:", error);
        throw error;
      }
    },
    [client, isConnected, channelName],
  );
}
