import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { PredictionState } from "../../components/chat/shared/bannerTypes";
import { createTwitchPrediction, updateTwitchPrediction } from "../../lib/twitch";
import {
  PREDICTION_LIMITS,
  defaultPredictionConfig,
  validatePredictionConfig,
  type PredictionConfig,
} from "../../lib/streamerTools/prediction";

export type PredictionCreatorPhase =
  | "config"
  | "active"
  | "locked"
  | "ended";

export interface UsePredictionCreatorOptions {
  /** Broadcaster id or login. */
  broadcasterId: string;
  /** Whether the current user can manage predictions. */
  canManage: boolean;
  /** Live prediction state from EventSub. */
  livePrediction: PredictionState | null;
  setPrediction: Dispatch<SetStateAction<PredictionState | null>>;
  onNotify: (message: string, type: "success" | "error" | "info") => void;
}

export interface UsePredictionCreatorResult {
  phase: PredictionCreatorPhase;
  config: PredictionConfig;
  error: string | null;
  starting: boolean;
  acting: boolean;
  setField: <K extends keyof PredictionConfig>(
    key: K,
    value: PredictionConfig[K],
  ) => void;
  setOutcome: (index: number, value: string) => void;
  addOutcome: () => void;
  removeOutcome: (index: number) => void;
  start: () => Promise<void>;
  lock: () => Promise<void>;
  resolve: (winningOutcomeId: string) => Promise<void>;
  cancel: () => Promise<void>;
  startNew: () => void;
}

export function usePredictionCreator({
  broadcasterId,
  canManage,
  livePrediction,
  setPrediction,
  onNotify,
}: UsePredictionCreatorOptions): UsePredictionCreatorResult {
  const [config, setConfig] = useState<PredictionConfig>(defaultPredictionConfig);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [acting, setActing] = useState(false);

  const phase = useMemo<PredictionCreatorPhase>(() => {
    if (!livePrediction) return "config";
    if (livePrediction.status === "active") return "active";
    if (livePrediction.status === "locked") return "locked";
    return "ended";
  }, [livePrediction]);

  const setField = useCallback(
    <K extends keyof PredictionConfig>(
      key: K,
      value: PredictionConfig[K],
    ) => {
      setConfig((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const setOutcome = useCallback((index: number, value: string) => {
    setConfig((prev) => {
      if (index < 0 || index >= prev.outcomes.length) return prev;
      const outcomes = prev.outcomes.map((outcome, i) =>
        i === index ? value : outcome,
      );
      return { ...prev, outcomes };
    });
  }, []);

  const addOutcome = useCallback(() => {
    setConfig((prev) => {
      if (prev.outcomes.length >= PREDICTION_LIMITS.maxOutcomes) return prev;
      return { ...prev, outcomes: [...prev.outcomes, ""] };
    });
  }, []);

  const removeOutcome = useCallback((index: number) => {
    setConfig((prev) => {
      if (prev.outcomes.length <= PREDICTION_LIMITS.minOutcomes) return prev;
      if (index < 0 || index >= prev.outcomes.length) return prev;
      return {
        ...prev,
        outcomes: prev.outcomes.filter((_, i) => i !== index),
      };
    });
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!canManage) {
      setError("Only the broadcaster can create predictions.");
      return;
    }
    if (phase !== "config") {
      setError("Finish the current prediction first.");
      return;
    }
    const validationError = validatePredictionConfig(config);
    if (validationError) {
      setError(validationError);
      return;
    }

    setStarting(true);
    try {
      const created = await createTwitchPrediction(broadcasterId, config);
      setPrediction(created);
      onNotify("Prediction started", "success");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create prediction";
      setError(message);
      onNotify(message, "error");
    } finally {
      setStarting(false);
    }
  }, [broadcasterId, canManage, config, onNotify, phase, setPrediction]);

  const updateStatus = useCallback(
    async (
      status: "LOCKED" | "RESOLVED" | "CANCELED",
      winningOutcomeId?: string,
      successMessage?: string,
    ) => {
      setError(null);
      if (!canManage) {
        setError("Only the broadcaster can manage predictions.");
        return;
      }
      if (!livePrediction) {
        setError("No active prediction.");
        return;
      }

      setActing(true);
      try {
        const updated = await updateTwitchPrediction(
          broadcasterId,
          livePrediction.id,
          status,
          winningOutcomeId,
        );
        setPrediction(updated);
        if (successMessage) onNotify(successMessage, "success");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update prediction";
        setError(message);
        onNotify(message, "error");
      } finally {
        setActing(false);
      }
    },
    [broadcasterId, canManage, livePrediction, onNotify, setPrediction],
  );

  const lock = useCallback(async () => {
    if (phase !== "active") {
      setError("A prediction can only be locked while it is active.");
      return;
    }
    await updateStatus("LOCKED", undefined, "Prediction locked");
  }, [phase, updateStatus]);

  const resolve = useCallback(
    async (winningOutcomeId: string) => {
      if (phase !== "locked") {
        setError("Lock the prediction before resolving it.");
        return;
      }
      if (!winningOutcomeId) {
        setError("Choose the winning outcome.");
        return;
      }
      await updateStatus("RESOLVED", winningOutcomeId, "Prediction resolved");
    },
    [phase, updateStatus],
  );

  const cancel = useCallback(async () => {
    if (phase !== "active" && phase !== "locked") {
      setError("There is no active prediction to cancel.");
      return;
    }
    await updateStatus("CANCELED", undefined, "Prediction canceled");
  }, [phase, updateStatus]);

  const startNew = useCallback(() => {
    setError(null);
    setConfig(defaultPredictionConfig());
    setPrediction(null);
  }, [setPrediction]);

  return {
    phase,
    config,
    error,
    starting,
    acting,
    setField,
    setOutcome,
    addOutcome,
    removeOutcome,
    start,
    lock,
    resolve,
    cancel,
    startNew,
  };
}
