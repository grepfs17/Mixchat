import { useEffect, useRef, useState } from "react";
import type { PinnedChatHighlightState } from "../../components/chat/shared/bannerTypes";
import type { TwitchPinnedHighlightRaw } from "../../lib/twitchPinnedHighlight";

interface PinnedHighlightApiResponse {
  highlight: TwitchPinnedHighlightRaw | null;
}

const POLL_INTERVAL_MS = 60_000;

interface UsePinnedChatHighlightResult {
  highlight: PinnedChatHighlightState | null;
  /** User has closed this banner for the current pin; the underlying fetch
   *  keeps polling so we re-render if the streamer pins a NEW message. The
   *  tuple `(messageId, pinnedAtIso)` covers the case where the streamer
   *  unpins and re-pins the same message id (Twitch is idempotent here). */
  dismissedMessageId: string | null;
  dismissedPinnedAt: string | null;
  dismiss: () => void;
}

/**
 * Polls `/api/pinned-highlight?channel=<login>` on a fixed cadence, returning
 * the most recent pinned message or null. The polling hook is suspended when
 * the document is hidden (Page Visibility API) so background tabs don't burn
 * rate-limit budget.
 */
export function usePinnedChatHighlight(
  channel: string | null,
): UsePinnedChatHighlightResult {
  const [highlight, setHighlight] = useState<PinnedChatHighlightState | null>(
    null,
  );
  const [dismissedMessageId, setDismissedMessageId] = useState<string | null>(
    null,
  );
  const [dismissedPinnedAt, setDismissedPinnedAt] = useState<string | null>(
    null,
  );
  const lastFetchedChannelRef = useRef<string | null>(null);

  useEffect(() => {
    if (!channel) {
      setHighlight(null);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const fetchOnce = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(
          `/api/pinned-highlight?channel=${encodeURIComponent(channel)}`,
        );
        if (!res.ok) {
          // Auth errors are the only "real" failure mode (cookie expired).
          // Twitch GQL errors already return `{highlight: null}` from the
          // endpoint, so a !ok here is almost certainly a 401/429.
          if (!cancelled && (res.status === 401 || res.status === 429)) {
            console.warn(
              "[pinned-highlight] non-ok response:",
              res.status,
              "channel:",
              channel,
            );
          }
          return;
        }
        if (cancelled) return;
        const data = (await res.json()) as PinnedHighlightApiResponse;
        const raw = data?.highlight ?? null;
        if (cancelled) return;
        if (!raw) {
          setHighlight(null);
          setDismissedMessageId(null);
          setDismissedPinnedAt(null);
          return;
        }
        // raw is a PinnedChatMessage node: the actual chat message lives under
        // .pinnedMessage, the moderator who pinned lives under .pinnedBy, and
        // the sender color is exposed as .pinnedMessage.sender.chatColor.
        setHighlight({
          channel,
          messageId: raw.pinnedMessage.id,
          senderLogin: raw.pinnedMessage.sender.login,
          senderDisplayName: raw.pinnedMessage.sender.displayName,
          senderColor: raw.pinnedMessage.sender.chatColor || undefined,
          message: raw.pinnedMessage.content.text,
          pinnedAt: new Date(raw.updatedAt),
          pinnedByLogin: raw.pinnedBy?.login,
          pinnedByDisplayName: raw.pinnedBy?.displayName,
        });
      } catch (err) {
        if (cancelled) return;
        console.warn(
          "[pinned-highlight] fetch threw:",
          err instanceof Error ? err.message : err,
        );
      }
    };

    const scheduleNext = () => {
      if (cancelled) return;
      timer = setTimeout(() => {
        if (document.hidden) {
          // Skip a tick while hidden; re-arm with the same interval so we
          // recover as soon as the tab regains focus.
          scheduleNext();
          return;
        }
        void fetchOnce().then(scheduleNext);
      }, POLL_INTERVAL_MS);
    };

    if (lastFetchedChannelRef.current !== channel) {
      setHighlight(null);
      setDismissedMessageId(null);
      setDismissedPinnedAt(null);
    }
    lastFetchedChannelRef.current = channel;
    void fetchOnce().then(scheduleNext);

    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [channel]);

  const dismiss = () => {
    if (!highlight) return;
    setDismissedMessageId(highlight.messageId);
    setDismissedPinnedAt(highlight.pinnedAt.toISOString());
  };

  return {
    highlight,
    dismissedMessageId,
    dismissedPinnedAt,
    dismiss,
  };
}
