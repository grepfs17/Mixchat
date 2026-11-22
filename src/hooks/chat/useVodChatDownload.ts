import { useCallback, useEffect, useRef } from "react";

export type VodChatDownloadFormat = "json" | "html";

export interface UseVodChatDownloadOptions {
  videoId: string | null | undefined;
  title?: string;
  channelName?: string;
  onNotify?: (message: string, type: "success" | "error" | "info") => void;
}

/**
 * Triggers a browser download for the full VOD chat. The download endpoint
 * streams the file, so this only has to navigate a temporary anchor.
 */
export function useVodChatDownload({
  videoId,
  title,
  channelName,
  onNotify,
}: UseVodChatDownloadOptions): (format: VodChatDownloadFormat) => void {
  const onNotifyRef = useRef(onNotify);

  useEffect(() => {
    onNotifyRef.current = onNotify;
  }, [onNotify]);

  return useCallback(
    (format: VodChatDownloadFormat) => {
      if (!videoId) return;

      const params = new URLSearchParams({ video_id: videoId, format });
      if (title) params.set("title", title);
      if (channelName) params.set("channel", channelName);

      const anchor = document.createElement("a");
      anchor.href = `/api/twitch-vod-chat-download?${params.toString()}`;
      anchor.download = "";
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      onNotifyRef.current?.("Chat download started", "info");
    },
    [videoId, title, channelName],
  );
}
