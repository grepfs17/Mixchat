import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { PollState } from "../../components/chat/shared/bannerTypes";
import { createTwitchPoll, endTwitchPoll } from "../../lib/twitch";
import {
  defaultPollConfig,
  validatePollConfig,
  type PollConfig,
} from "../../lib/streamerTools/poll";

export type PollCreatorPhase = "config" | "active" | "ended";

const ENDED_STATUSES = new Set(["completed", "archived", "terminated"]);

export interface UsePollCreatorOptions {
  /** Broadcaster id or login. */
  broadcasterId: string;
  /** Whether the current user can create or end polls. */
  canManage: boolean;
  /** Live poll state from EventSub. */
  livePoll: PollState | null;
  setPoll: Dispatch<SetStateAction<PollState | null>>;
  onNotify: (message: string, type: "success" | "error" | "info") => void;
}

export interface UsePollCreatorResult {
  phase: PollCreatorPhase;
  config: PollConfig;
  error: string | null;
  starting: boolean;
  ending: boolean;
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
  livePoll,
  setPoll,
  onNotify,
}: UsePollCreatorOptions): UsePollCreatorResult {
  const [config, setConfig] = useState<PollConfig>(defaultPollConfig);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);

  const phase = useMemo<PollCreatorPhase>(() => {
    if (!livePoll) return "config";
    const status = livePoll.status?.toLowerCase();
    if (status && ENDED_STATUSES.has(status)) return "ended";
    return "active";
  }, [livePoll]);

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
    if (!canManage) {
      setError("Only the broadcaster can create polls.");
      return;
    }
    if (phase === "active") {
      setError("A poll is already running.");
      return;
    }
    const validationError = validatePollConfig(config);
    if (validationError) {
      setError(validationError);
      return;
    }

    setStarting(true);
    try {
      const created = await createTwitchPoll(broadcasterId, config);
      setPoll(created);
      onNotify("Poll started", "success");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create poll";
      setError(message);
      onNotify(message, "error");
    } finally {
      setStarting(false);
    }
  }, [broadcasterId, canManage, config, onNotify, phase, setPoll]);

  const end = useCallback(async () => {
    setError(null);
    if (!canManage) {
      setError("Only the broadcaster can end polls.");
      return;
    }
    if (!livePoll) {
      setError("No active poll.");
      return;
    }

    setEnding(true);
    try {
      const ended = await endTwitchPoll(broadcasterId, livePoll.id);
      setPoll(ended ?? { ...livePoll, status: "terminated" });
      onNotify("Poll ended", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to end poll";
      setError(message);
      onNotify(message, "error");
    } finally {
      setEnding(false);
    }
  }, [broadcasterId, canManage, livePoll, onNotify, setPoll]);

  const startNew = useCallback(() => {
    setError(null);
    setConfig(defaultPollConfig());
    setPoll(null);
  }, [setPoll]);

  return {
    phase,
    config,
    error,
    starting,
    ending,
    setField,
    setChoice,
    addChoice,
    removeChoice,
    start,
    end,
    startNew,
  };
}
