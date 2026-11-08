import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { PollState } from "../../components/chat/shared/bannerTypes";
import { createTwitchPoll, endTwitchPoll } from "../../lib/twitch";
import { getPollRelay, pollRelayAction } from "../../lib/streamTools/api";
import type { PollRelayCommand } from "../../lib/streamTools/pollRelay";
import {
  defaultPollConfig,
  validatePollConfig,
  type PollConfig,
} from "../../lib/streamerTools/poll";

export type PollCreatorPhase = "config" | "active" | "ended";

const ENDED_STATUSES = new Set(["completed", "archived", "terminated"]);
const RELAY_POLL_MS = 2000;
const RELAY_SYNC_DEBOUNCE_MS = 800;

export interface UsePollCreatorOptions {
  /** Broadcaster id or login. */
  broadcasterId: string;
  /** Whether the current user can create or end polls directly. */
  canManage: boolean;
  /** Whether the broadcaster's channel can run native polls. */
  affiliateEligible?: boolean;
  /** Live poll state from EventSub (broadcaster client only). */
  livePoll: PollState | null;
  setPoll: Dispatch<SetStateAction<PollState | null>>;
  onNotify: (message: string, type: "success" | "error" | "info") => void;
  /** Channel key used to relay mod requests to the broadcaster client. */
  relayChannelKey?: string | null;
  /** Current user's role for relay purposes. */
  relayRole?: "owner" | "moderator";
}

export interface UsePollCreatorResult {
  phase: PollCreatorPhase;
  config: PollConfig;
  error: string | null;
  starting: boolean;
  ending: boolean;
  /** Poll state to render. For moderators this comes from the relay. */
  effectivePoll: PollState | null;
  /** Pending/claimed/done relay command, when relay is active. */
  relayCommand: PollRelayCommand | null;
  setField: <K extends keyof PollConfig>(
    key: K,
    value: PollConfig[K],
  ) => void;
  setChoice: (index: number, value: string) => void;
  addChoice: () => void;
  removeChoice: (index: number) => void;
  start: () => Promise<void>;
  end: () => Promise<void>;
  startNew: () => void;
}

export function usePollCreator({
  broadcasterId,
  canManage,
  affiliateEligible = true,
  livePoll,
  setPoll,
  onNotify,
  relayChannelKey = null,
  relayRole = "owner",
}: UsePollCreatorOptions): UsePollCreatorResult {
  const [config, setConfig] = useState<PollConfig>(defaultPollConfig);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [relayPoll, setRelayPoll] = useState<PollState | null>(null);
  const [relayCommand, setRelayCommand] = useState<PollRelayCommand | null>(
    null,
  );
  const [dismissedPollId, setDismissedPollId] = useState<string | null>(null);

  const relayKey = relayChannelKey?.trim() || null;
  const isModeratorRelay = Boolean(relayKey && relayRole === "moderator");
  const isOwnerRelay = Boolean(relayKey && relayRole === "owner");

  const effectivePoll = useMemo<PollState | null>(() => {
    if (isModeratorRelay) {
      return relayPoll && relayPoll.id !== dismissedPollId ? relayPoll : null;
    }
    return livePoll;
  }, [dismissedPollId, isModeratorRelay, livePoll, relayPoll]);

  const phase = useMemo<PollCreatorPhase>(() => {
    if (!effectivePoll) return "config";
    const status = effectivePoll.status?.toLowerCase();
    if (status && ENDED_STATUSES.has(status)) return "ended";
    return "active";
  }, [effectivePoll]);

  const livePollRef = useRef(livePoll);
  useEffect(() => {
    livePollRef.current = livePoll;
  }, [livePoll]);
  const relayPollRef = useRef(relayPoll);
  useEffect(() => {
    relayPollRef.current = relayPoll;
  }, [relayPoll]);
  const broadcasterIdRef = useRef(broadcasterId);
  useEffect(() => {
    broadcasterIdRef.current = broadcasterId;
  }, [broadcasterId]);
  const onNotifyRef = useRef(onNotify);
  useEffect(() => {
    onNotifyRef.current = onNotify;
  }, [onNotify]);
  const setPollRef = useRef(setPoll);
  useEffect(() => {
    setPollRef.current = setPoll;
  }, [setPoll]);
  const affiliateEligibleRef = useRef(affiliateEligible);
  useEffect(() => {
    affiliateEligibleRef.current = affiliateEligible;
  }, [affiliateEligible]);

  // Reset relay state on channel switch so a previous channel's poll cannot
  // leak into the new channel's panel.
  useEffect(() => {
    setRelayPoll(null);
    setRelayCommand(null);
    setDismissedPollId(null);
  }, [relayKey]);

  const executeRelayCommand = useCallback(
    async (command: PollRelayCommand, key: string) => {
      try {
        if (!affiliateEligibleRef.current) {
          throw new Error(
            "The streamer's channel is not eligible for polls. Affiliate or Partner status is required.",
          );
        }
        if (command.action === "create") {
          if (!command.config) throw new Error("Invalid poll request.");
          const created = await createTwitchPoll(
            broadcasterIdRef.current,
            command.config,
          );
          setPollRef.current(created);
          await pollRelayAction(key, "ack", {
            commandId: command.id,
            poll: created,
          });
          onNotifyRef.current("Poll created for a moderator", "success");
        } else {
          const current = livePollRef.current ?? relayPollRef.current;
          if (!current) throw new Error("No active poll.");
          const ended = await endTwitchPoll(broadcasterIdRef.current, current.id);
          const result = ended ?? { ...current, status: "terminated" };
          setPollRef.current(result);
          await pollRelayAction(key, "ack", {
            commandId: command.id,
            poll: result,
          });
          onNotifyRef.current("Poll ended for a moderator", "success");
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to run poll request";
        await pollRelayAction(key, "ack", {
          commandId: command.id,
          error: message,
        }).catch(() => {});
        onNotifyRef.current(message, "error");
      }
    },
    [],
  );

  // Poll the relay. The broadcaster client claims and executes mod requests;
  // moderator clients just mirror the relayed poll state.
  useEffect(() => {
    if (!relayKey) return;
    let cancelled = false;
    let running = false;

    const tick = async () => {
      if (running) return;
      if (typeof document !== "undefined" && document.hidden) return;
      running = true;
      try {
        const state = await getPollRelay(relayKey);
        if (cancelled) return;
        setRelayPoll(state.poll);
        setRelayCommand(state.command);

        if (
          isOwnerRelay &&
          state.command &&
          state.command.status === "pending"
        ) {
          const claimed = await pollRelayAction(relayKey, "claim", {
            commandId: state.command.id,
          });
          if (!cancelled && claimed.claimed) {
            await executeRelayCommand(claimed.claimed, relayKey);
            const next = await getPollRelay(relayKey);
            if (!cancelled) {
              setRelayPoll(next.poll);
              setRelayCommand(next.command);
            }
          }
        }
      } catch {
        // Keep the last known relay state and retry on the next tick.
      } finally {
        running = false;
      }
    };

    void tick();
    const timer = window.setInterval(tick, RELAY_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [executeRelayCommand, isOwnerRelay, relayKey]);

  // Broadcasters mirror EventSub updates so moderators can see live results.
  useEffect(() => {
    if (!relayKey || !isOwnerRelay || !livePoll) return;
    const timer = window.setTimeout(() => {
      void pollRelayAction(relayKey, "sync", { poll: livePoll }).catch(
        () => {},
      );
    }, RELAY_SYNC_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [isOwnerRelay, livePoll, relayKey]);

  // Surface relay failures from the broadcaster on moderator clients.
  useEffect(() => {
    if (!isModeratorRelay || !relayCommand) return;
    if (relayCommand.status === "error") {
      setError(
        relayCommand.error ?? "The streamer could not complete the request.",
      );
    } else if (relayCommand.status === "done") {
      setError(null);
    }
  }, [isModeratorRelay, relayCommand]);

  const setField = useCallback(
    <K extends keyof PollConfig>(key: K, value: PollConfig[K]) => {
      setConfig((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const setChoice = useCallback((index: number, value: string) => {
    setConfig((prev) => {
      if (index < 0 || index >= prev.choices.length) return prev;
      const choices = prev.choices.map((choice, i) =>
        i === index ? value : choice,
      );
      return { ...prev, choices };
    });
  }, []);

  const addChoice = useCallback(() => {
    setConfig((prev) => {
      if (prev.choices.length >= 5) return prev;
      return { ...prev, choices: [...prev.choices, ""] };
    });
  }, []);

  const removeChoice = useCallback((index: number) => {
    setConfig((prev) => {
      if (prev.choices.length <= 2) return prev;
      if (index < 0 || index >= prev.choices.length) return prev;
      return {
        ...prev,
        choices: prev.choices.filter((_, i) => i !== index),
      };
    });
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (phase === "active") {
      setError("A poll is already running.");
      return;
    }
    if (!canManage && !isModeratorRelay) {
      setError("Only the broadcaster can create polls.");
      return;
    }
    const validationError = validatePollConfig(config);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (canManage && !affiliateEligible) {
      setError("Twitch polls are available to Affiliates and Partners only.");
      return;
    }

    setStarting(true);
    try {
      if (isModeratorRelay && relayKey) {
        const res = await pollRelayAction(relayKey, "create", { config });
        setRelayCommand(res.command);
        setRelayPoll(res.poll);
        setError(null);
        onNotify("Poll request sent to the streamer", "info");
      } else {
        const created = await createTwitchPoll(broadcasterId, config);
        setPoll(created);
        onNotify("Poll started", "success");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create poll";
      setError(message);
      onNotify(message, "error");
    } finally {
      setStarting(false);
    }
  }, [
    affiliateEligible,
    broadcasterId,
    canManage,
    config,
    isModeratorRelay,
    onNotify,
    phase,
    relayKey,
    setPoll,
  ]);

  const end = useCallback(async () => {
    setError(null);
    if (!canManage && !isModeratorRelay) {
      setError("Only the broadcaster can end polls.");
      return;
    }
    if (!effectivePoll) {
      setError("No active poll.");
      return;
    }

    setEnding(true);
    try {
      if (isModeratorRelay && relayKey) {
        const res = await pollRelayAction(relayKey, "end");
        setRelayCommand(res.command);
        setRelayPoll(res.poll);
        setError(null);
        onNotify("End request sent to the streamer", "info");
      } else {
        const ended = await endTwitchPoll(broadcasterId, effectivePoll.id);
        setPoll(ended ?? { ...effectivePoll, status: "terminated" });
        onNotify("Poll ended", "success");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to end poll";
      setError(message);
      onNotify(message, "error");
    } finally {
      setEnding(false);
    }
  }, [
    broadcasterId,
    canManage,
    effectivePoll,
    isModeratorRelay,
    onNotify,
    relayKey,
    setPoll,
  ]);

  const startNew = useCallback(() => {
    setError(null);
    setConfig(defaultPollConfig());
    if (isModeratorRelay) {
      setDismissedPollId(relayPoll?.id ?? null);
      return;
    }
    setPoll(null);
    if (isOwnerRelay && relayKey) {
      void pollRelayAction(relayKey, "reset").catch(() => {});
    }
  }, [isModeratorRelay, isOwnerRelay, relayKey, relayPoll?.id, setPoll]);

  return {
    phase,
    config,
    error,
    starting,
    ending,
    effectivePoll,
    relayCommand,
    setField,
    setChoice,
    addChoice,
    removeChoice,
    start,
    end,
    startNew,
  };
}
