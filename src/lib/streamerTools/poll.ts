import type { PollState } from "../../components/chat/shared/bannerTypes";

export const POLL_LIMITS = {
  minChoices: 2,
  maxChoices: 5,
  maxTitleLength: 60,
  maxChoiceLength: 25,
  minDuration: 15,
  maxDuration: 1800,
  minChannelPointsPerVote: 1,
  maxChannelPointsPerVote: 10000,
  maxBitsPerVote: 10000,
} as const;

export const POLL_DURATION_PRESETS: { label: string; value: number }[] = [
  { label: "1 min", value: 60 },
  { label: "5 min", value: 300 },
  { label: "10 min", value: 600 },
  { label: "15 min", value: 900 },
  { label: "30 min", value: 1800 },
];

export interface PollConfig {
  title: string;
  choices: string[];
  duration: number;
  channelPointsVoting: boolean;
  channelPointsPerVote: number;
  bitsVoting: boolean;
  bitsPerVote: number;
}

export interface TwitchPollChoiceResponse {
  id: string;
  title: string;
  votes?: number;
  bits_votes?: number;
  channel_points_votes?: number;
}

export interface TwitchPollResponse {
  id: string;
  title: string;
  choices: TwitchPollChoiceResponse[];
  status?: string;
  started_at?: string;
  ends_at?: string;
  ended_at?: string;
}

export function defaultPollConfig(): PollConfig {
  return {
    title: "",
    choices: ["", ""],
    duration: 300,
    channelPointsVoting: false,
    channelPointsPerVote: 100,
    bitsVoting: false,
    bitsPerVote: 100,
  };
}

function isInteger(value: number): boolean {
  return Number.isInteger(value);
}

export function validatePollConfig(config: PollConfig): string | null {
  const title = config.title.trim();
  if (!title) return "Enter a poll question.";
  if (title.length > POLL_LIMITS.maxTitleLength) {
    return `Question must be ${POLL_LIMITS.maxTitleLength} characters or fewer.`;
  }

  const choices = config.choices.map((c) => c.trim());
  if (choices.length < POLL_LIMITS.minChoices) {
    return `Add at least ${POLL_LIMITS.minChoices} choices.`;
  }
  if (choices.length > POLL_LIMITS.maxChoices) {
    return `Use at most ${POLL_LIMITS.maxChoices} choices.`;
  }
  if (choices.some((c) => !c)) return "Every choice needs text.";
  if (choices.some((c) => c.length > POLL_LIMITS.maxChoiceLength)) {
    return `Each choice must be ${POLL_LIMITS.maxChoiceLength} characters or fewer.`;
  }
  const normalized = choices.map((c) => c.toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    return "Choices must be unique.";
  }

  if (
    !isInteger(config.duration) ||
    config.duration < POLL_LIMITS.minDuration ||
    config.duration > POLL_LIMITS.maxDuration
  ) {
    return `Duration must be between ${POLL_LIMITS.minDuration} and ${POLL_LIMITS.maxDuration} seconds.`;
  }

  if (config.channelPointsVoting) {
    if (
      !isInteger(config.channelPointsPerVote) ||
      config.channelPointsPerVote < POLL_LIMITS.minChannelPointsPerVote ||
      config.channelPointsPerVote > POLL_LIMITS.maxChannelPointsPerVote
    ) {
      return `Channel Points per vote must be between ${POLL_LIMITS.minChannelPointsPerVote} and ${POLL_LIMITS.maxChannelPointsPerVote}.`;
    }
  }

  if (config.bitsVoting) {
    if (
      !isInteger(config.bitsPerVote) ||
      config.bitsPerVote < 0 ||
      config.bitsPerVote > POLL_LIMITS.maxBitsPerVote
    ) {
      return `Bits per vote must be between 0 and ${POLL_LIMITS.maxBitsPerVote}.`;
    }
  }

  return null;
}

export type PollCommand = "createpoll" | "endpoll" | null;

/**
 * Detect a local poll command. These never reach Twitch chat: the caller
 * handles them and swallows the message.
 */
export function parsePollCommand(message: string): PollCommand {
  const action = message.trim().split(/\s+/)[0]?.toLowerCase();
  if (action === "/createpoll") return "createpoll";
  if (action === "/endpoll") return "endpoll";
  return null;
}

export function mapTwitchPoll(poll: TwitchPollResponse): PollState {
  const choices = poll.choices.map((choice) => ({
    id: choice.id,
    title: choice.title,
    votes: choice.votes ?? 0,
  }));
  return {
    id: poll.id,
    title: poll.title,
    choices,
    totalVotes: choices.reduce((sum, choice) => sum + choice.votes, 0),
    endsAt: new Date(poll.ends_at || poll.started_at || Date.now()),
    status: poll.status?.toLowerCase(),
  };
}
