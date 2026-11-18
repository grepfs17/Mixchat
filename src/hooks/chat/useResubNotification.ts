import { useCallback, useEffect, useRef, useState } from "react";
import type { TwitchResubNotification } from "../../lib/twitchResub";

interface TwitchResubApiResponse {
  notification: TwitchResubNotification | null;
}

const POLL_INTERVAL_MS = 5 * 60_000;

export interface UseResubNotificationResult {
  /** Visible notification, or null when nothing is pending or it was dismissed. */
  notification: TwitchResubNotification | null;
  sharing: boolean;
  error: string | null;
  share: (message: string, includeStreak: boolean) => Promise<boolean>;
  dismiss: () => void;
}

/**
 * Watches for the viewer's pending resub notification on the selected channel.
 * Twitch only exposes this through its internal GQL API, proxied by
 * `/api/twitch-resub`. Polling is paused while the tab is hidden and refreshed
 * when the tab regains focus so a renewal that happens mid-session is found.
 */
export function useResubNotification(
  channel: string | null,
  enabled: boolean,
): UseResubNotificationResult {
  const [notification, setNotification] =
    useState<TwitchResubNotification | null>(null);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastNotificationIdRef = useRef<string | null>(null);
  const sharedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setNotification(null);
    setDismissedId(null);
    setError(null);
    lastNotificationIdRef.current = null;
    sharedIdsRef.current = new Set();
    if (!channel || !enabled) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const fetchOnce = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(
          `/api/twitch-resub?channel=${encodeURIComponent(channel)}`,
        );
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 401) setNotification(null);
          return;
        }
        const data = (await res.json()) as TwitchResubApiResponse;
        if (cancelled) return;
        const next =
          data?.notification && !sharedIdsRef.current.has(data.notification.id)
            ? data.notification
            : null;
        const nextId = next?.id ?? null;
        if (nextId !== lastNotificationIdRef.current) {
          lastNotificationIdRef.current = nextId;
          setError(null);
        }
        setNotification(next);
      } catch (err) {
        if (cancelled) return;
        console.warn(
          "[resub] fetch failed:",
          err instanceof Error ? err.message : err,
        );
      }
    };

    const scheduleNext = () => {
      if (cancelled) return;
      timer = setTimeout(() => {
        if (document.hidden) {
          scheduleNext();
          return;
        }
        void fetchOnce().then(scheduleNext);
      }, POLL_INTERVAL_MS);
    };

    const handleVisible = () => {
      if (document.hidden) return;
      void fetchOnce();
    };

    void fetchOnce().then(scheduleNext);
    document.addEventListener("visibilitychange", handleVisible);
    window.addEventListener("focus", handleVisible);

    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisible);
      window.removeEventListener("focus", handleVisible);
    };
  }, [channel, enabled]);

  const dismiss = useCallback(() => {
    setDismissedId((prev) => notification?.id ?? prev);
  }, [notification]);

  const share = useCallback(
    async (message: string, includeStreak: boolean): Promise<boolean> => {
      if (!channel || !notification) return false;

      setSharing(true);
      setError(null);
      try {
        const res = await fetch("/api/twitch-resub", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel,
            message,
            includeStreak,
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          if (res.status === 401) setNotification(null);
          setError(data.error || "Could not share your resub message.");
          return false;
        }
        sharedIdsRef.current.add(notification.id);
        setNotification(null);
        setDismissedId(null);
        return true;
      } catch {
        setError("Could not share your resub message.");
        return false;
      } finally {
        setSharing(false);
      }
    },
    [channel, notification],
  );

  const visibleNotification =
    notification && notification.id !== dismissedId ? notification : null;

  return { notification: visibleNotification, sharing, error, share, dismiss };
}
