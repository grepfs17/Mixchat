import type { APIRoute } from "astro";
import { parseChannelKey } from "../../../lib/wheel/api";
import { checkRateLimit } from "../../../lib/rateLimit";
import {
  normalizeKeyword,
  pickWinner,
  type GiveawayEligibility,
  type GiveawayEntry,
  type GiveawayScope,
} from "../../../lib/streamerTools/giveaway";
import { clientAddress, json } from "../../../server/wheelApi";
import { authorizeChannel } from "../../../server/wheelAuth";
import { getStreamToolsStoreOptions } from "../../../server/streamToolsConfig";
import {
  entryKey,
  getStreamToolsState,
  mutateStreamToolsState,
  recordGiveawayWinner,
} from "../../../server/streamToolsState";
import { readJsonBody } from "../../../server/jsonBody";

const MIN_DURATION = 5;
const MAX_DURATION = 2 * 60 * 60;
const MAX_ENTRIES = 5000;
const MAX_GIVEAWAY_BODY_BYTES = 64 * 1024;
const MAX_ENTRY_USER_ID_LENGTH = 128;
const MAX_ENTRY_AUTHOR_LENGTH = 100;
const MAX_ENTRY_AVATAR_LENGTH = 500;

interface GiveawayBody {
  channelKey?: string;
  action?: string;
  keyword?: string;
  duration?: number;
  scope?: GiveawayScope;
  eligibility?: GiveawayEligibility;
  entry?: GiveawayEntry;
}

function parseBody(value: unknown): GiveawayBody | null {
  if (!value || typeof value !== "object") return null;
  return value as GiveawayBody;
}

function validConfig(body: GiveawayBody): string | null {
  const keyword = body.keyword?.trim() ?? "";
  if (!keyword) return "Please enter a keyword.";
  if (keyword.length > 32) return "Keyword must be 32 characters or fewer.";
  if (!normalizeKeyword(keyword)) {
    return "Keyword must contain at least one letter or number.";
  }
  if (typeof body.duration !== "number" || !Number.isFinite(body.duration)) {
    return "Invalid duration.";
  }
  if (
    body.duration !== 0 &&
    (body.duration < MIN_DURATION || body.duration > MAX_DURATION)
  ) {
    return "Duration must be 0 or between 5 seconds and 2 hours.";
  }
  if (
    body.scope !== "twitch" &&
    body.scope !== "youtube" &&
    body.scope !== "both"
  ) {
    return "Invalid scope.";
  }
  if (
    body.eligibility !== "everyone" &&
    body.eligibility !== "subscribers"
  ) {
    return "Invalid eligibility.";
  }
  return null;
}

function validEntry(value: unknown): GiveawayEntry | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<GiveawayEntry>;
  if (entry.platform !== "twitch" && entry.platform !== "youtube") return null;
  if (typeof entry.userId !== "string" || !entry.userId.trim()) return null;
  if (typeof entry.author !== "string" || !entry.author.trim()) return null;
  if (entry.userId.trim().length > MAX_ENTRY_USER_ID_LENGTH) return null;
  if (entry.author.trim().length > MAX_ENTRY_AUTHOR_LENGTH) return null;
  if (
    entry.authorAvatar !== undefined &&
    (typeof entry.authorAvatar !== "string" ||
      entry.authorAvatar.length > MAX_ENTRY_AVATAR_LENGTH)
  ) {
    return null;
  }
  // Rebuild the entry from validated fields so unknown properties cannot be
  // persisted alongside it.
  return {
    platform: entry.platform,
    userId: entry.userId.trim(),
    author: entry.author.trim(),
    ...(entry.authorAvatar !== undefined
      ? { authorAvatar: entry.authorAvatar }
      : {}),
  };
}

type AccessResult = { error: Response } | { key: string };

async function authorize(
  request: Request,
  cookies: Parameters<typeof authorizeChannel>[0],
  channelKey: string | null | undefined,
): Promise<AccessResult> {
  const channel = parseChannelKey(channelKey ?? null);
  if (!channel) return { error: json({ error: "Missing channel" }, 400) };
  const auth = await authorizeChannel(cookies, channel, {
    allowModerators: true,
  });
  if (auth === "unauthenticated") {
    return { error: json({ error: "Not authenticated" }, 401) };
  }
  if (auth !== "ok") return { error: json({ error: "Forbidden" }, 403) };
  return { key: `${channel.channelPlatform}:${channel.channelName.toLowerCase()}` };
}

export const GET: APIRoute = async ({ request, cookies }) => {
  if (
    !checkRateLimit(
      `${clientAddress(request)}:stream-tools-giveaway-read`,
      180,
      60_000,
    )
  ) {
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }
  const channelKey = new URL(request.url).searchParams.get("channelKey");
  const access = await authorize(request, cookies, channelKey);
  if ("error" in access) return access.error;
  const state = await getStreamToolsState(getStreamToolsStoreOptions(), access.key);
  return json({
    version: state.version,
    giveaway: state.giveaway,
    history: state.giveawayHistory,
  });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  if (
    !checkRateLimit(
      `${clientAddress(request)}:stream-tools-giveaway-write`,
      120,
      60_000,
    )
  ) {
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }
  const parsed = await readJsonBody(request, MAX_GIVEAWAY_BODY_BYTES);
  if (!parsed.ok) {
    return json({ error: parsed.error }, parsed.status);
  }
  const body = parseBody(parsed.value);
  if (!body || typeof body.action !== "string") {
    return json({ error: "Invalid body" }, 400);
  }
  const access = await authorize(request, cookies, body.channelKey);
  if ("error" in access) return access.error;
  const opts = getStreamToolsStoreOptions();
  const action = body.action;

  if (action === "start" || action === "startNew") {
    const configError = validConfig(body);
    if (configError) return json({ error: configError }, 400);
    const startMs = Date.now();
    const duration = body.duration as number;
    await mutateStreamToolsState(opts, access.key, (state) => {
      state.giveaway = {
        phase: "running",
        keyword: (body.keyword as string).trim(),
        duration,
        scope: body.scope as GiveawayScope,
        eligibility: body.eligibility as GiveawayEligibility,
        startedAt: startMs,
        endsAt:
          duration === 0 ? Number.POSITIVE_INFINITY : startMs + duration * 1000,
        winner: null,
        entries: [],
        announcedAt: null,
      };
    });
  } else if (action === "ingest") {
    const entry = validEntry(body.entry);
    if (!entry) return json({ error: "Invalid entry" }, 400);
    await mutateStreamToolsState(opts, access.key, (state) => {
      const giveaway = state.giveaway;
      if (giveaway.phase !== "running") return;
      // Re-validate against the authoritative config: a client with a stale
      // local copy must not be able to inject entries.
      const keywordNorm = normalizeKeyword(giveaway.keyword);
      if (!keywordNorm) return;
      if (giveaway.scope !== "both" && giveaway.scope !== entry.platform) {
        return;
      }
      if (giveaway.entries.length >= MAX_ENTRIES) return;
      const key = entryKey(entry);
      if (giveaway.entries.some((existing) => entryKey(existing) === key)) {
        return;
      }
      state.giveaway.entries = [...giveaway.entries, entry];
    });
  } else if (action === "cancel") {
    await mutateStreamToolsState(opts, access.key, (state) => {
      state.giveaway = {
        ...state.giveaway,
        phase: "config",
        startedAt: null,
        endsAt: null,
        winner: null,
        entries: [],
        announcedAt: null,
      };
    });
  } else if (action === "reveal") {
    await mutateStreamToolsState(opts, access.key, (state) => {
      if (state.giveaway.phase !== "running") return;
      state.giveaway = {
        ...state.giveaway,
        phase: "revealed",
        winner: pickWinner(state.giveaway.entries),
      };
      recordGiveawayWinner(state);
    });
  } else if (action === "clearHistory") {
    await mutateStreamToolsState(opts, access.key, (state) => {
      state.giveawayHistory = [];
    });
  } else if (action === "claimAnnounce") {
    const claimed = await mutateStreamToolsState(opts, access.key, (state) => {
      if (
        state.giveaway.phase !== "revealed" ||
        !state.giveaway.winner ||
        state.giveaway.announcedAt
      ) {
        return null;
      }
      state.giveaway.announcedAt = new Date().toISOString();
      return state.giveaway.winner;
    });
    const state = await getStreamToolsState(opts, access.key);
    return json({
      version: state.version,
      giveaway: state.giveaway,
      history: state.giveawayHistory,
      claimedWinner: claimed,
    });
  } else {
    return json({ error: "Unknown action" }, 400);
  }

  const state = await getStreamToolsState(opts, access.key);
  return json({
    version: state.version,
    giveaway: state.giveaway,
    history: state.giveawayHistory,
  });
};
