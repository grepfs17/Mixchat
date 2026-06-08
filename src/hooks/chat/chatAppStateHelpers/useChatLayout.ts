import { useState, useEffect } from "react";

export interface UseChatLayoutOptions {
  selectedTwitchChannelDisplayName?: string;
}

export interface UseChatLayoutReturn {
  chatSplitRatio: number;
  isDraggingChatSplit: boolean;
  setIsDraggingChatSplit: (v: boolean) => void;
}

export function useChatLayout({
  selectedTwitchChannelDisplayName = "",
}: UseChatLayoutOptions): UseChatLayoutReturn {
  const [chatSplitRatio, setChatSplitRatio] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("mixchat_chat_split_ratio");
      return saved ? parseFloat(saved) : 50;
    }
    return 50;
  });
  const [isDraggingChatSplit, setIsDraggingChatSplit] = useState(false);

  useEffect(() => {
    if (isDraggingChatSplit) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = document.querySelector("[data-chat-app-container]");
      if (!container) return;
      const rect = container.getBoundingClientRect();
      let percentage = ((e.clientY - rect.top) / rect.height) * 100;
      if (percentage < 20) percentage = 20;
      if (percentage > 80) percentage = 80;
      setChatSplitRatio(percentage);
    };

    const handleMouseUp = () => {
      setIsDraggingChatSplit(false);
      localStorage.setItem(
        "mixchat_chat_split_ratio",
        chatSplitRatio.toString(),
      );
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingChatSplit, chatSplitRatio]);

  useEffect(() => {
    if (selectedTwitchChannelDisplayName) {
      document.title = `Mixchat - ${selectedTwitchChannelDisplayName}`;
    } else {
      document.title = "Mixchat - Multi-Platform Live Chat";
    }
  }, [selectedTwitchChannelDisplayName]);

  return {
    chatSplitRatio,
    isDraggingChatSplit,
    setIsDraggingChatSplit,
  };
}
