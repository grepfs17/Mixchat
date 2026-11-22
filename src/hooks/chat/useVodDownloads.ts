import { useCallback, useEffect, useRef } from "react";

export type VodChatDownloadFormat = "json" | "html";

export interface UseVodDownloadsOptions {
  videoId: string | null | undefined;
  title?: string;
  channelName?: string;
  onNotify?: (message: string, type: "success" | "error" | "info") => void;
}

export interface UseVodDownloadsResult {
  downloadVod: () => Promise<void>;
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

function downloadErrorMessage(status: number): string {
  if (status === 401) {
    return "Twitch session expired. Re-login to download this VOD.";
  }
  if (status === 429) {
    return "Too many downloads. Try again in a few minutes.";
  }
  return "VOD download is unavailable right now.";
}

/**
 * Starts browser downloads for the VOD media file and its chat export. The
 * media route is preflighted with HEAD: an anchor download saves whatever body
 * comes back, so a 401 or 429 would otherwise land as a JSON file.
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

  const downloadVod = useCallback(async () => {
    if (!videoId) return;
    const params = new URLSearchParams({ video_id: videoId });
    const href = `/api/twitch-vod-download?${params.toString()}`;

    try {
      const res = await fetch(href, { method: "HEAD" });
      if (!res.ok) {
        onNotifyRef.current?.(downloadErrorMessage(res.status), "error");
        return;
      }
    } catch {
      onNotifyRef.current?.("Could not reach the download service.", "error");
      return;
    }

    triggerDownload(href);
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
