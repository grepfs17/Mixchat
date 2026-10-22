/**
 * Banner state types shared by banner components and EventSub hooks.
 * A single canonical declaration avoids duplicate-export warnings.
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

/** Streamer's currently pinned Twitch chat message. Persists until
 *  the broadcaster unpins, so the UI renders it as a sticky banner. */
export interface PinnedChatHighlightState {
  channel: string;
  messageId: string;
  senderLogin: string;
  senderDisplayName: string;
  senderColor?: string;
  message: string;
  pinnedAt: Date;
  /** Twitch login of the moderator/donor who pinned the message. Optional
   *  because the field isn't always populated. */
  pinnedByLogin?: string;
  pinnedByDisplayName?: string;
}
