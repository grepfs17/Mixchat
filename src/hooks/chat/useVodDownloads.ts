import { useCallback, useEffect, useRef } from "react";

export type VodChatDownloadFormat = "json" | "html";

export interface UseVodDownloadsOptions {
  videoId: string | null | undefined;
  title?: string;
  channelName?: string;
  onNotify?: (message: string, type: "success" | "error" | "info") => void;
}

export interface UseVodDownloadsResult {
  downloadVod: () => void;
  downloadVodChat: (format: VodChatDownloadFormat) => void;
}

function triggerDownload(href: string) {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = "";
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * Starts browser downloads for the VOD media file and its chat export. Both
 * endpoints stream the file, so this only has to navigate a temporary anchor.
 */
export function useVodDownloads({
  videoId,
  title,
  channelName,
  onNotify,
}: UseVodDownloadsOptions): UseVodDownloadsResult {
  const onNotifyRef = useRef(onNotify);

  useEffect(() => {
    onNotifyRef.current = onNotify;
  }, [onNotify]);

  const downloadVod = useCallback(() => {
    if (!videoId) return;
    const params = new URLSearchParams({ video_id: videoId });
    triggerDownload(`/api/twitch-vod-download?${params.toString()}`);
    onNotifyRef.current?.("VOD download started", "info");
  }, [videoId]);

  const downloadVodChat = useCallback(
    (format: VodChatDownloadFormat) => {
      if (!videoId) return;

      const params = new URLSearchParams({ video_id: videoId, format });
      if (title) params.set("title", title);
      if (channelName) params.set("channel", channelName);

      triggerDownload(`/api/twitch-vod-chat-download?${params.toString()}`);
      onNotifyRef.current?.("Chat download started", "info");
    },
    [videoId, title, channelName],
  );

  return { downloadVod, downloadVodChat };
}
