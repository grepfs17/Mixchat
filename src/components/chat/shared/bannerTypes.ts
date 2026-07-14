/**
 * Centralized banner state types.
 *
 * The banner components and the upstream EventSub hooks (in
 * src/hooks/chat/eventSubHelpers) all share these shapes. The banner
 * files and the hooks drain down to this single canonical declaration
 * to avoid duplicate-export warnings.
 */

export interface CelebrationState {
  id: string;
  userName: string;
  userDisplayName: string;
  bitsUsed: number;
  totalBitsUsed: number;
  messageEffectId: string | null;
  endsAt: Date;
}

export interface HypeTrainState {
  level: number;
  progress: number;
  goal: number;
  totalPoints: number;
  topContributors: Array<{ displayName: string; points: number }>;
  endsAt: Date;
}

export interface PollChoice {
  id: string;
  title: string;
  votes: number;
}

export interface PollState {
  id: string;
  title: string;
  choices: PollChoice[];
  totalVotes: number;
  endsAt: Date;
  status?: string;
}

export interface PredictionOutcome {
  id: string;
  title: string;
  color: string;
  users: number;
  channelPoints: number;
}

export interface PredictionState {
  id: string;
  title: string;
  outcomes: PredictionOutcome[];
  totalPoints: number;
  totalUsers: number;
  status: "active" | "locked" | "resolved" | "canceled";
  winningOutcomeId?: string;
  endsAt?: Date;
  lockedAt?: Date;
}
