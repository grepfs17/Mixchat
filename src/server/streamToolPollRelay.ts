import { randomUUID } from "node:crypto";
import type { PollState } from "../components/chat/shared/bannerTypes";
import type { PollConfig } from "../lib/streamerTools/poll";
import type {
  PollRelayCommand,
  PollRelayState,
} from "../lib/streamTools/pollRelay";

/**
 * Ephemeral, channel-scoped relay for poll commands.
 *
 * Moderators cannot call Twitch's poll endpoints with their own token, so a
 * mod request waits here until the broadcaster's open Mixchat client claims
 * it and creates or ends the poll with the broadcaster token. The broadcaster
 * also mirrors the live EventSub poll state back here so mods can watch it.
 *
 * This is intentionally in-memory: a pending request is short-lived and must
 * be executed by a connected broadcaster client. A server restart simply
 * drops stale requests.
 */
const relays = new Map<string, PollRelayState>();

/** Pending/claimed requests older than this are considered failed. */
const COMMAND_TTL_MS = 2 * 60 * 1000;
/** A claimed request can be retried after this if the owner never acked. */
const CLAIM_TTL_MS = 15 * 1000;
/** Completed requests stay visible briefly so the requester can read them. */
const RESULT_TTL_MS = 30 * 1000;

function normalizeKey(channelKey: string): string {
  return channelKey.trim().toLowerCase();
}

function freshState(): PollRelayState {
  return { poll: null, command: null, updatedAt: 0 };
}

function prune(state: PollRelayState): void {
  const command = state.command;
  if (!command) return;
  const age = Date.now() - command.requestedAt;

  if (command.status === "pending" && age > COMMAND_TTL_MS) {
    command.status = "error";
    command.error = "The streamer did not respond. Try again.";
    return;
  }
  if (command.status === "claimed" && age > COMMAND_TTL_MS) {
    command.status = "error";
    command.error = "The streamer did not respond. Try again.";
    return;
  }
  if (
    (command.status === "done" || command.status === "error") &&
    age > RESULT_TTL_MS + COMMAND_TTL_MS
  ) {
    state.command = null;
  }
}

function load(channelKey: string): PollRelayState {
  const key = normalizeKey(channelKey);
  const state = relays.get(key) ?? freshState();
  prune(state);
  relays.set(key, state);
  return state;
}

export function getPollRelay(channelKey: string): PollRelayState {
  return load(channelKey);
}

export function enqueuePollCommand(
  channelKey: string,
  action: "create" | "end",
  config: PollConfig | undefined,
  requestedBy: string | undefined,
): PollRelayCommand {
  const state = load(channelKey);
  if (
    state.command &&
    (state.command.status === "pending" || state.command.status === "claimed")
  ) {
    throw new Error("Another poll request is already pending.");
  }

  const command: PollRelayCommand = {
    id: randomUUID(),
    action,
    ...(config ? { config } : {}),
    ...(requestedBy ? { requestedBy } : {}),
    requestedAt: Date.now(),
    status: "pending",
  };
  state.command = command;
  state.updatedAt = Date.now();
  return command;
}

/**
 * Atomically claim a pending command for the broadcaster client. Returns null
 * when another client already claimed it or it is no longer pending.
 */
export function claimPollCommand(
  channelKey: string,
  commandId: string,
): PollRelayCommand | null {
  const state = load(channelKey);
  const command = state.command;
  if (!command || command.id !== commandId) return null;

  const claimExpired =
    command.status === "claimed" &&
    command.claimedAt !== undefined &&
    Date.now() - command.claimedAt > CLAIM_TTL_MS;
  if (command.status !== "pending" && !claimExpired) return null;

  command.status = "claimed";
  command.claimedAt = Date.now();
  state.updatedAt = Date.now();
  return { ...command };
}

export function ackPollCommand(
  channelKey: string,
  commandId: string,
  result: PollState | null | undefined,
  error: string | undefined,
): boolean {
  const state = load(channelKey);
  const command = state.command;
  if (!command || command.id !== commandId) return false;

  command.status = error ? "error" : "done";
  if (error) command.error = error;
  if (result !== undefined) state.poll = result;
  state.updatedAt = Date.now();
  return true;
}

export function syncPollState(
  channelKey: string,
  poll: PollState | null,
): void {
  const state = load(channelKey);
  state.poll = poll;
  state.updatedAt = Date.now();
}

export function __resetPollRelayForTests(): void {
  relays.clear();
}
