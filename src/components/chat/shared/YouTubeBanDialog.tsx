import { useEffect, useRef } from "react";

interface YouTubeBanDialogProps {
  channelId: string;
  username: string;
  videoId?: string | null;
  onConfirm: (channelId: string, username: string) => void;
  onClose: () => void;
}

/**
 * YouTube bans through the Data API are scoped to the current live chat.
 * This confirmation makes that limitation explicit before the request runs.
 */
export default function YouTubeBanDialog({
  channelId,
  username,
  videoId,
  onConfirm,
  onClose,
}: YouTubeBanDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const openChatPopout = () => {
    if (!videoId) return;
    window.open(
      `https://www.youtube.com/live_chat?is_popout=1&dark_theme=1&v=${encodeURIComponent(videoId)}`,
      "yt-chat-popout",
      "width=400,height=600,noopener,noreferrer",
    );
  };

  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open && typeof el.showModal === "function") el.showModal();
    cancelRef.current?.focus();
    return () => {
      if (el?.open) el.close();
    };
  }, []);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handleClose = () => onClose();
    el.addEventListener("close", handleClose);
    return () => el.removeEventListener("close", handleClose);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      className="yt-timeout-dialog"
      aria-labelledby="yt-ban-dialog-title"
    >
      <div className="yt-timeout-title" id="yt-ban-dialog-title">
        Ban {username}?
      </div>
      <p className="yt-ban-dialog-note">
        YouTube's Data API can only ban this user from the current live
        stream. It cannot hide the user from your channel. To hide them
        across your channel, open the YouTube chat popout and choose Hide
        user from their message menu.
      </p>
      {videoId && (
        <button
          type="button"
          className="yt-ban-dialog-popout"
          onClick={openChatPopout}
        >
          Open YouTube chat popout
        </button>
      )}
      <div className="yt-timeout-actions">
        <button
          type="button"
          ref={cancelRef}
          className="yt-timeout-btn yt-timeout-btn--cancel"
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          className="yt-timeout-btn yt-timeout-btn--ok"
          onClick={() => onConfirm(channelId, username)}
        >
          Ban for this stream
        </button>
      </div>
    </dialog>
  );
}
