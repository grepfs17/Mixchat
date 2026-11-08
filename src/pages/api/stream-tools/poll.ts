import type { APIRoute } from "astro";
import type { PollState } from "../../../components/chat/shared/bannerTypes";
import { checkRateLimit } from "../../../lib/rateLimit";
import {
  validatePollConfig,
  type PollConfig,
} from "../../../lib/streamerTools/poll";
import {
  sanitizePollState,
  type PollRelayState,
} from "../../../lib/streamTools/pollRelay";
import { parseChannelKey } from "../../../lib/wheel/api";
import { clientAddress, json } from "../../../server/wheelApi";
import { authorizeChannel } from "../../../server/wheelAuth";
import { readJsonBody } from "../../../server/jsonBody";
import {
  ackPollCommand,
  claimPollCommand,
  enqueuePollCommand,
  getPollRelay,
  syncPollState,
} from "../../../server/streamToolPollRelay";

const MAX_BODY_BYTES = 16 * 1024;
const MAX_REQUESTER_LENGTH = 100;

type AccessResult = { error: Response } | { key: string };

async function authorize(
  cookies: Parameters<typeof authorizeChannel>[0],
  channelKey: string | null | undefined,
  allowModerators: boolean,
): Promise<AccessResult> {
  const channel = parseChannelKey(channelKey ?? null);
  if (!channel) return { error: json({ error: "Missing channel" }, 400) };
  if (channel.channelPlatform !== "twitch") {
    return { error: json({ error: "Polls require a Twitch channel" }, 400) };
  }
  const auth = await authorizeChannel(
    cookies,
    channel,
    allowModerators ? { allowModerators: true } : undefined,
  );
  if (auth === "unauthenticated") {
    return { error: json({ error: "Not authenticated" }, 401) };
  }
  if (auth !== "ok") return { error: json({ error: "Forbidden" }, 403) };
  return {
    key: `${channel.channelPlatform}:${channel.channelName.toLowerCase()}`,
  };
}

function readPollConfig(value: unknown): {
  config: PollConfig | null;
  error: string | null;
} {
  if (!value || typeof value !== "object") {
    return { config: null, error: "Invalid poll config." };
  }
  const raw = value as Partial<PollConfig>;
  const config: PollConfig = {
    title: typeof raw.title === "string" ? raw.title : "",
    choices: Array.isArray(raw.choices)
      ? raw.choices.slice(0, 10).map((choice) => String(choice ?? ""))
      : [],
    duration: typeof raw.duration === "number" ? raw.duration : Number.NaN,
    channelPointsVoting: Boolean(raw.channelPointsVoting),
    channelPointsPerVote:
      typeof raw.channelPointsPerVote === "number"
        ? raw.channelPointsPerVote
        : Number.NaN,
    bitsVoting: Boolean(raw.bitsVoting),
    bitsPerVote:
      typeof raw.bitsPerVote === "number" ? raw.bitsPerVote : Number.NaN,
  };
  const error = validatePollConfig(config);
  return { config: error ? null : config, error };
}

function relayResponse(
  state: PollRelayState,
  extra: Record<string, unknown> = {},
): Response {
  return json({ ...state, ...extra });
}

export const GET: APIRoute = async ({ request, cookies }) => {
  if (
    !checkRateLimit(
      `${clientAddress(request)}:stream-tools-poll-read`,
      180,
      60_000,
    )
  ) {
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }

  const channelKey = new URL(request.url).searchParams.get("channelKey");
  const access = await authorize(cookies, channelKey, true);
  if ("error" in access) return access.error;
  return relayResponse(getPollRelay(access.key));
};

export const POST: APIRoute = async ({ request, cookies }) => {
  if (
    !checkRateLimit(
      `${clientAddress(request)}:stream-tools-poll-write`,
      120,
      60_000,
    )
  ) {
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }

  const parsed = await readJsonBody(request, MAX_BODY_BYTES);
  if (!parsed.ok) return json({ error: parsed.error }, parsed.status);
  const body =
    parsed.value && typeof parsed.value === "object"
      ? (parsed.value as Record<string, unknown>)
      : null;
  if (!body) return json({ error: "Invalid body" }, 400);

  const action = body.action;
  if (typeof action !== "string") {
    return json({ error: "Invalid action" }, 400);
  }

  const ownerOnly =
    action === "claim" ||
    action === "ack" ||
    action === "sync" ||
    action === "reset";
  const access = await authorize(
    cookies,
    typeof body.channelKey === "string" ? body.channelKey : null,
    !ownerOnly,
  );
  if ("error" in access) return access.error;

  if (action === "create" || action === "end") {
    let config: PollConfig | undefined;
    if (action === "create") {
      const parsedConfig = readPollConfig(body.config);
      if (!parsedConfig.config) {
        return json(
          { error: parsedConfig.error ?? "Invalid poll config." },
          400,
        );
      }
      config = parsedConfig.config;
    }
    const requestedBy =
      typeof body.requestedBy === "string"
        ? body.requestedBy.trim().slice(0, MAX_REQUESTER_LENGTH)
        : undefined;
    try {
      const command = enqueuePollCommand(
        access.key,
        action,
        config,
        requestedBy,
      );
      return relayResponse(getPollRelay(access.key), { command });
    } catch (err) {
      return json(
        {
          error:
            err instanceof Error ? err.message : "Failed to queue poll request",
        },
        409,
      );
    }
  }

  if (action === "claim") {
    if (typeof body.commandId !== "string") {
      return json({ error: "Missing command id" }, 400);
    }
    const claimed = claimPollCommand(access.key, body.commandId);
    return relayResponse(getPollRelay(access.key), { claimed });
  }

  if (action === "ack") {
    if (typeof body.commandId !== "string") {
      return json({ error: "Missing command id" }, 400);
    }
    let poll: PollState | null | undefined;
    if ("poll" in body) {
      poll = sanitizePollState(body.poll);
      if (poll === undefined) {
        return json({ error: "Invalid poll state" }, 400);
      }
    }
    const error =
      typeof body.error === "string"
        ? body.error.slice(0, 500)
        : undefined;
    const ok = ackPollCommand(access.key, body.commandId, poll, error);
    if (!ok) return json({ error: "Unknown command" }, 409);
    return relayResponse(getPollRelay(access.key));
  }

  if (action === "sync") {
    const poll = sanitizePollState(body.poll);
    if (poll === undefined) return json({ error: "Invalid poll state" }, 400);
    syncPollState(access.key, poll);
    return relayResponse(getPollRelay(access.key));
  }

  if (action === "reset") {
    syncPollState(access.key, null);
    return relayResponse(getPollRelay(access.key));
  }

  return json({ error: "Invalid action" }, 400);
};
