import type { APIRoute } from "astro";
import { checkRateLimit } from "../../lib/rateLimit";

// Twitch's web Client-ID is subject to the integrity check once a comment
// cursor is involved. The Android Client-ID used by TwitchDownloader is not,
// which lets us page through the full replay.
const GQL_CLIENT_ID = "kd1unb4b3q4t58fwlpcbzcbnm76a8fp";
const GQL_URL = "https://gql.twitch.tv/gql";
const COMMENTS_HASH =
  "b70a3591ff0f4e0313d126c6a1502d79a1c02baebb288227c582044aa76adf6a";
const MAX_CURSOR_LENGTH = 2048;

interface GqlFragment {
  text?: string | null;
  emote?: { emoteID?: string; from?: number } | null;
}

interface GqlCommentNode {
  id?: string;
  commenter?: { id?: string; login?: string; displayName?: string } | null;
  contentOffsetSeconds?: number;
  createdAt?: string;
  message?: {
    fragments?: GqlFragment[] | null;
    userBadges?: Array<{
      id?: string;
      setID?: string;
      version?: string;
    }> | null;
    userColor?: string | null;
  } | null;
}

interface GqlEdge {
  cursor?: string;
  node?: GqlCommentNode;
}

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function normalizeComment(node: GqlCommentNode | undefined) {
  if (!node?.id || !node.commenter) return null;
  const fragments = (node.message?.fragments ?? [])
    .filter((fragment) => typeof fragment?.text === "string")
    .map((fragment) => ({
      text: fragment.text as string,
      emote: fragment.emote?.emoteID
        ? {
            id: fragment.emote.emoteID,
            from: fragment.emote.from ?? 0,
          }
        : null,
    }));

  return {
    id: node.id,
    offsetSeconds: node.contentOffsetSeconds ?? 0,
    createdAt: node.createdAt ?? "",
    authorId: node.commenter?.id ?? "",
    authorLogin: node.commenter?.login ?? "",
    author: node.commenter?.displayName || node.commenter?.login || "",
    color: node.message?.userColor ?? null,
    fragments,
    badges: (node.message?.userBadges ?? [])
      .filter((badge) => badge?.setID || badge?.id)
      .map((badge) => ({
        name: badge.setID || badge.id || "",
        version: badge.version ?? "",
      })),
  };
}

export const GET: APIRoute = async ({ url, request }) => {
  const clientAddress =
    request.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ||
    "unknown";
  if (!checkRateLimit(`${clientAddress}:twitch-vod-chat`, 120, 60_000)) {
    return json({ error: "Too many requests" }, { status: 429 });
  }

  const videoId = url.searchParams.get("video_id")?.trim();
  if (!videoId || !/^\d+$/.test(videoId)) {
    return json({ error: "Valid video_id parameter required" }, { status: 400 });
  }

  const cursor = url.searchParams.get("cursor")?.trim() || null;
  if (cursor && cursor.length > MAX_CURSOR_LENGTH) {
    return json({ error: "Invalid cursor" }, { status: 400 });
  }

  const rawOffset = Number(url.searchParams.get("offset") ?? "0");
  const offset =
    Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;

  const variables: Record<string, string | number> = { videoID: videoId };
  if (cursor) {
    variables.cursor = cursor;
  } else {
    variables.contentOffsetSeconds = offset;
  }

  const body = {
    operationName: "VideoCommentsByOffsetOrCursor",
    variables,
    extensions: {
      persistedQuery: { version: 1, sha256Hash: COMMENTS_HASH },
    },
  };

  try {
    const res = await fetch(GQL_URL, {
      method: "POST",
      headers: {
        "Client-ID": GQL_CLIENT_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return json(
        { error: `Twitch chat request failed (${res.status})` },
        { status: res.status === 429 ? 429 : 502 },
      );
    }

    const payload = await res.json();
    if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
      const message = payload.errors[0]?.message || "Twitch GQL error";
      return json({ error: message }, { status: 502 });
    }

    const video = payload?.data?.video;
    if (!video) {
      return json({ error: "VOD not found" }, { status: 404 });
    }

    const comments = video.comments;
    if (!comments || !Array.isArray(comments.edges)) {
      return json({ comments: [], cursor: null, hasNextPage: false });
    }

    const edges = comments.edges as GqlEdge[];
    const normalized = edges
      .map((edge) => normalizeComment(edge.node))
      .filter((comment): comment is NonNullable<typeof comment> =>
        Boolean(comment),
      );

    return json({
      comments: normalized,
      cursor: edges.length > 0 ? edges[edges.length - 1]?.cursor ?? null : null,
      hasNextPage: Boolean(comments.pageInfo?.hasNextPage),
    });
  } catch (error) {
    console.error("[twitch-vod-chat] failed:", error);
    return json({ error: "Failed to load VOD chat" }, { status: 502 });
  }
};
