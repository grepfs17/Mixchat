import type { APIRoute } from "astro";
import {
  makeItem,
  mutateSession,
  newItemId,
} from "../../../../../server/songQueueStore";
import { getSongQueueStoreOptions } from "../../../../../server/songQueueConfig";
import {
  clientAddress,
  json,
  ownerTokenFromRequest,
} from "../../../../../server/songQueueApi";
import { checkRateLimit } from "../../../../../lib/rateLimit";
import {
  fetchVideoMeta,
  VideoValidationError,
} from "../../../../../lib/songQueue/oembed";
import {
  MAX_QUEUE_LENGTH_CEILING,
  type SongQueueItem,
  type SongQueueSubmitter,
} from "../../../../../lib/songQueue/types";

interface AppendBody {
  videoId: string;
  submitter: SongQueueSubmitter;
  /** Optional hard cap for this session. Defaults to MAX_QUEUE_LENGTH_CEILING. */
  maxQueueLength?: number;
}

function isAppendBody(value: unknown): value is AppendBody {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.videoId !== "string") return false;
  const s = v.submitter;
  if (!s || typeof s !== "object") return false;
  const sub = s as Record<string, unknown>;
  if (typeof sub.userId !== "string" || typeof sub.author !== "string") return false;
  if (sub.platform !== "twitch" && sub.platform !== "youtube") return false;
  return true;
}

type AppendResult =
  | { kind: "created"; item: SongQueueItem }
  | { kind: "queue-full" }
  | { kind: "duplicate" };

export const POST: APIRoute = async ({ request, params }) => {
  const sessionId = params.sessionId || "";
  const token = ownerTokenFromRequest(request);
  if (!token) return json({ error: "Missing owner token" }, 401);
  if (!checkRateLimit(`${clientAddress(request)}:song-queue-append`, 60, 60_000)) {
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!isAppendBody(body)) return json({ error: "Invalid body" }, 400);
  const maxLen = body.maxQueueLength ?? MAX_QUEUE_LENGTH_CEILING;

  // Server-side re-validation via oembed. Defence in depth: even if the
  // client skipped this, the server does not let private/removed/age-
  // restricted videos into the queue.
  let meta;
  try {
    meta = await fetchVideoMeta(body.videoId);
  } catch (err) {
    if (err instanceof VideoValidationError) {
      return json({ error: err.message, code: err.code }, 400);
    }
    return json({ error: "Failed to validate video" }, 502);
  }

  const item = makeItem({
    id: newItemId(),
    videoId: meta.videoId,
    title: meta.title,
    channelTitle: meta.channelTitle,
    thumbnail: meta.thumbnail,
    submitter: body.submitter,
    submittedAt: new Date().toISOString(),
  });

  const res = await mutateSession<AppendResult>(
    getSongQueueStoreOptions(),
    sessionId,
    token,
    (s) => {
      if (s.items.length >= maxLen) {
        return { session: s, result: { kind: "queue-full" } };
      }
      const dedupeKey = `${item.submitter.platform}:${item.submitter.userId}:${item.videoId}`;
      if (
        s.items.some(
          (it) => `${it.submitter.platform}:${it.submitter.userId}:${it.videoId}` === dedupeKey,
        )
      ) {
        return { session: s, result: { kind: "duplicate" } };
      }
      return {
        session: { ...s, items: [...s.items, item] },
        result: { kind: "created", item },
      };
    },
  );
  if (!res.ok) {
    if (res.reason === "missing") return json({ error: "Not found" }, 404);
    if (res.reason === "auth") return json({ error: "Forbidden" }, 403);
    return json({ error: "Session already ended" }, 410);
  }
  if (res.result.kind === "queue-full") return json({ error: "Queue is full" }, 409);
  if (res.result.kind === "duplicate") return json({ error: "Already in queue" }, 409);
  return json(res.result.item, 201);
};
