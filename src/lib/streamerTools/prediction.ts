import type { PredictionState } from "../../components/chat/shared/bannerTypes";

export const PREDICTION_LIMITS = {
  minOutcomes: 2,
  maxOutcomes: 10,
  maxTitleLength: 45,
  maxOutcomeLength: 25,
  minWindow: 30,
  maxWindow: 1800,
} as const;

export const PREDICTION_WINDOW_PRESETS: { label: string; value: number }[] = [
  { label: "1 min", value: 60 },
  { label: "2 min", value: 120 },
  { label: "5 min", value: 300 },
  { label: "10 min", value: 600 },
  { label: "15 min", value: 900 },
  { label: "30 min", value: 1800 },
];

export interface PredictionConfig {
  title: string;
  outcomes: string[];
  windowSeconds: number;
}

export interface TwitchPredictionOutcomeResponse {
  id: string;
  title: string;
  color?: string;
  users?: number;
  channel_points?: number;
}

export interface TwitchPredictionResponse {
  id: string;
  title: string;
  outcomes: TwitchPredictionOutcomeResponse[];
  status?: string;
  created_at?: string;
  locked_at?: string;
  ended_at?: string;
  winning_outcome_id?: string;
  prediction_window?: number;
}

export function defaultPredictionConfig(): PredictionConfig {
  return {
    title: "",
    outcomes: ["", ""],
    windowSeconds: 120,
  };
}

export function validatePredictionConfig(
  config: PredictionConfig,
): string | null {
  const title = config.title.trim();
  if (!title) return "Enter a prediction title.";
  if (title.length > PREDICTION_LIMITS.maxTitleLength) {
    return `Title must be ${PREDICTION_LIMITS.maxTitleLength} characters or fewer.`;
  }

  const outcomes = config.outcomes.map((outcome) => outcome.trim());
  if (outcomes.length < PREDICTION_LIMITS.minOutcomes) {
    return `Add at least ${PREDICTION_LIMITS.minOutcomes} outcomes.`;
  }
  if (outcomes.length > PREDICTION_LIMITS.maxOutcomes) {
    return `Use at most ${PREDICTION_LIMITS.maxOutcomes} outcomes.`;
  }
  if (outcomes.some((outcome) => !outcome)) {
    return "Every outcome needs text.";
  }
  if (outcomes.some((outcome) => outcome.length > PREDICTION_LIMITS.maxOutcomeLength)) {
    return `Each outcome must be ${PREDICTION_LIMITS.maxOutcomeLength} characters or fewer.`;
  }
  const normalized = outcomes.map((outcome) => outcome.toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    return "Outcomes must be unique.";
  }

  if (
    !Number.isInteger(config.windowSeconds) ||
    config.windowSeconds < PREDICTION_LIMITS.minWindow ||
    config.windowSeconds > PREDICTION_LIMITS.maxWindow
  ) {
    return `Prediction window must be between ${PREDICTION_LIMITS.minWindow} and ${PREDICTION_LIMITS.maxWindow} seconds.`;
  }

  return null;
}

export type PredictionCommand =
  | "createprediction"
  | "lockprediction"
  | "cancelprediction"
  | null;

/**
 * Detect a local prediction command. These never reach Twitch chat: the
 * caller handles them and swallows the message.
 */
export function parsePredictionCommand(message: string): PredictionCommand {
  const action = message.trim().split(/\s+/)[0]?.toLowerCase();
  if (action === "/createprediction") return "createprediction";
  if (action === "/lockprediction") return "lockprediction";
  if (action === "/cancelprediction") return "cancelprediction";
  return null;
}

function mapStatus(status: string | undefined): PredictionState["status"] {
  switch (status?.toUpperCase()) {
    case "LOCKED":
      return "locked";
    case "RESOLVED":
      return "resolved";
    case "CANCELED":
      return "canceled";
    default:
      return "active";
  }
}

function predictionEndsAt(
  prediction: TwitchPredictionResponse,
): Date | undefined {
  if (prediction.locked_at) return new Date(prediction.locked_at);
  if (!prediction.created_at || !prediction.prediction_window) return undefined;
  const createdAt = new Date(prediction.created_at).getTime();
  if (!Number.isFinite(createdAt)) return undefined;
  return new Date(createdAt + prediction.prediction_window * 1000);
}

export function mapTwitchPrediction(
  prediction: TwitchPredictionResponse,
): PredictionState {
  const outcomes = prediction.outcomes.map((outcome) => ({
    id: outcome.id,
    title: outcome.title,
    color: outcome.color ?? "blue",
    users: outcome.users ?? 0,
    channelPoints: outcome.channel_points ?? 0,
  }));
  return {
    id: prediction.id,
    title: prediction.title,
    outcomes,
    totalPoints: outcomes.reduce(
      (sum, outcome) => sum + outcome.channelPoints,
      0,
    ),
    totalUsers: outcomes.reduce((sum, outcome) => sum + outcome.users, 0),
    status: mapStatus(prediction.status),
    winningOutcomeId: prediction.winning_outcome_id,
    endsAt: predictionEndsAt(prediction),
    lockedAt: prediction.locked_at
      ? new Date(prediction.locked_at)
      : undefined,
  };
}
