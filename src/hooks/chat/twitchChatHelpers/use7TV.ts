import { useEffect } from "react";
import type { TwitchMessage } from "../../../lib/types";

interface UseTwitchChat7TVOptions {
  enabled: boolean;
  onMessageRef: React.RefObject<(message: TwitchMessage) => void>;
}

export function useTwitchChat7TV({
  enabled,
  onMessageRef,
}: UseTwitchChat7TVOptions): void {
  useEffect(() => {
    if (!enabled) return;

    const handleEmoteAdded = (e: any) => {
      const { name } = e.detail;
      onMessageRef.current({
        id: `7tv-added-${Date.now()}`,
        platform: "twitch",
        author: "7TV",
        content: `Emote added: ${name}`,
        timestamp: new Date(),
        authorColor: "#00ccff",
        messageType: "notice",
      });
    };

    const handleEmoteRemoved = (e: any) => {
      const { name } = e.detail;
      onMessageRef.current({
        id: `7tv-removed-${Date.now()}`,
        platform: "twitch",
        author: "7TV",
        content: `Emote removed: ${name}`,
        timestamp: new Date(),
        authorColor: "#ff4444",
        messageType: "notice",
      });
    };

    window.addEventListener("7tv-emote-added", handleEmoteAdded);
    window.addEventListener("7tv-emote-removed", handleEmoteRemoved);

    return () => {
      window.removeEventListener("7tv-emote-added", handleEmoteAdded);
      window.removeEventListener("7tv-emote-removed", handleEmoteRemoved);
    };
  }, [enabled, onMessageRef]);
}
