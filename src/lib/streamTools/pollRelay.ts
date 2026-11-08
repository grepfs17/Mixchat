import type { PollState } from "../../components/chat/shared/bannerTypes";
import type { PollConfig } from "../streamerTools/poll";

export type PollRelayAction = "create" | "end";
export type PollRelayCommandStatus =
  | "pending"
  | "claimed"
  | "done"
  | "error";

export interface PollRelayCommand {
  id: string;
  action: PollRelayAction;
  config?: PollConfig;
  /** Display name supplied by the requesting moderator. */
  requestedBy?: string;
  requestedAt: number;
  status: PollRelayCommandStatus;
  claimedAt?: number;
  error?: string;
}

export interface PollRelayState {
  poll: PollState | null;
  command: PollRelayCommand | null;
  updatedAt: number;
}

/**
 * Validate a poll snapshot mirrored by the broadcaster client. Returns
 * `undefined` when the shape is invalid, `null` for an explicit clear.
 */
export function sanitizePollState(
  value: unknown,
): PollState | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Partial<PollState>;
  if (typeof raw.id !== "string" || !raw.id) return undefined;
  if (typeof raw.title !== "string") return undefined;
  if (!Array.isArray(raw.choices)) return undefined;

  const choices: PollState["choices"] = [];
  for (const item of raw.choices.slice(0, 5)) {
    if (!item || typeof item !== "object") return undefined;
    const choice = item as { id?: unknown; title?: unknown; votes?: unknown };
    if (typeof choice.id !== "string" || !choice.id) return undefined;
    if (typeof choice.title !== "string") return undefined;
    const votes =
      typeof choice.votes === "number" && Number.isFinite(choice.votes)
        ? Math.max(0, Math.floor(choice.votes))
        : 0;
    choices.push({ id: choice.id, title: choice.title, votes });
  }
  if (choices.length === 0) return undefined;

  const endsAt = new Date(raw.endsAt as string | number | Date);
  if (Number.isNaN(endsAt.getTime())) return undefined;

  const totalVotes =
    typeof raw.totalVotes === "number" && Number.isFinite(raw.totalVotes)
      ? Math.max(0, Math.floor(raw.totalVotes))
      : choices.reduce((sum, choice) => sum + choice.votes, 0);

  return {
    id: raw.id,
    title: raw.title,
    choices,
    totalVotes,
    endsAt,
    ...(typeof raw.status === "string"
      ? { status: raw.status.slice(0, 32) }
      : {}),
  };
}
