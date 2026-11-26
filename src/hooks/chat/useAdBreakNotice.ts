import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getTwitchAdSchedule,
  snoozeTwitchNextAd,
  startTwitchCommercial,
  type CommercialLength,
  type TwitchAdSchedule,
} from "../../lib/twitch";

const NOTICE_LEAD_MS = 5 * 60_000;
/** Treat a next_ad_at more than 2 minutes in the past as stale. */
const NOTICE_GRACE_MS = 2 * 60_000;
const SCHEDULE_POLL_MS = 30_000;

export interface AdBreakNotice {
  nextAdAt: Date;
  snoozeCount: number;
}

export interface UseAdBreakNoticeResult {
  /** Present when an ad break is within the 5-minute notice window. */
  notice: AdBreakNotice | null;
  /** Full latest schedule, regardless of the notice window. */
  schedule: TwitchAdSchedule | null;
  snooze: () => Promise<void>;
  snoozing: boolean;
  runCommercial: (length: CommercialLength) => Promise<void>;
  runningLength: CommercialLength | null;
  dismiss: () => void;
}

/**
 * Replicates Twitch's chat ad-break warning: the broadcaster sees a
 * snoozeable notice above chat shortly before an automatic ad break.
 *
 * Twitch's own notification is first-party; publicly the only way to know
 * an ad break is incoming is polling `next_ad_at` from Get Ad Schedule
 * (EventSub only has channel.ad_break.begin, which fires when ads are
 * already running). The schedule requires the broadcaster token, so the
 * hook is only active on own channel; unauthorized responses stop the
 * polling until reconnect.
 */
export function useAdBreakNotice({
  broadcasterId,
  enabled,
}: {
  broadcasterId: string;
  enabled: boolean;
}): UseAdBreakNoticeResult {
  const [schedule, setSchedule] = useState<TwitchAdSchedule | null>(null);
  const [authError, setAuthError] = useState(false);
  const [snoozing, setSnoozing] = useState(false);
  const [runningLength, setRunningLength] = useState<CommercialLength | null>(
    null,
  );
  const [dismissedNextAdAt, setDismissedNextAdAt] = useState<string | null>(
    null,
  );
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Latest poll function, so actions can force a refresh from outside the
  // polling effect.
  const loadRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    setSchedule(null);
    setAuthError(false);
    if (!enabled || !broadcasterId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const next = await getTwitchAdSchedule(broadcasterId);
        if (cancelled) return;
        setSchedule(next);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("Reconnect Twitch")) {
          // Missing ad scopes: stop polling, reconnecting grants them.
          setAuthError(true);
        } else {
          console.error("useAdBreakNotice poll failed:", err);
        }
        setSchedule(null);
      }
    };

    loadRef.current = load;
    void load();
    pollTimer.current = setInterval(() => void load(), SCHEDULE_POLL_MS);
    return () => {
      cancelled = true;
      loadRef.current = async () => {};
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [enabled, broadcasterId]);

  const notice = useMemo<AdBreakNotice | null>(() => {
    if (!schedule?.nextAdAt) return null;
    if (dismissedNextAdAt === schedule.nextAdAt) return null;
    const ms = new Date(schedule.nextAdAt).getTime() - Date.now();
    if (ms > NOTICE_LEAD_MS || ms < -NOTICE_GRACE_MS) return null;
    return {
      nextAdAt: new Date(schedule.nextAdAt),
      snoozeCount: schedule.snoozeCount,
    };
  }, [schedule, dismissedNextAdAt]);

  const snooze = useCallback(async () => {
    if (snoozing) return;
    setSnoozing(true);
    try {
      const next = await snoozeTwitchNextAd(broadcasterId, schedule ?? undefined);
      setSchedule(next);
      // The new timestamp is outside the dismissed key, so the banner stays.
      setDismissedNextAdAt(null);
    } catch (err) {
      console.error("useAdBreakNotice snooze failed:", err);
    } finally {
      setSnoozing(false);
    }
  }, [broadcasterId, snoozing, schedule]);

  const runCommercial = useCallback(
    async (length: CommercialLength) => {
      if (runningLength) return;
      setRunningLength(length);
      try {
        await startTwitchCommercial(broadcasterId, length);
        // Refresh the schedule so the countdown reflects the reset.
        setTimeout(() => void loadRef.current(), 2_000);
      } catch (err) {
        console.error("useAdBreakNotice runCommercial failed:", err);
      } finally {
        setRunningLength(null);
      }
    },
    [broadcasterId, runningLength],
  );

  const dismiss = useCallback(() => {
    if (schedule?.nextAdAt) setDismissedNextAdAt(schedule.nextAdAt);
  }, [schedule?.nextAdAt]);

  return {
    notice: authError ? null : notice,
    schedule: authError ? null : schedule,
    snooze,
    snoozing,
    runCommercial,
    runningLength,
    dismiss,
  };
}
