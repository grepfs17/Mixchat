const GQL_CLIENT_ID = "kd1unb4b3q4t58fwlpcbzcbnm76a8fp";
const GQL_URL = "https://gql.twitch.tv/gql";
const COMMENTS_HASH =
  "b70a3591ff0f4e0313d126c6a1502d79a1c02baebb288227c582044aa76adf6a";

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

export interface VodChatComment {
  id: string;
  offsetSeconds: number;
  createdAt: string;
  authorId: string;
  authorLogin: string;
  author: string;
  color: string | null;
  fragments: Array<{
    text: string;
    emote: { id: string; from: number } | null;
  }>;
  badges: Array<{ name: string; version: string }>;
}

export interface VodChatPage {
  comments: VodChatComment[];
  cursor: string | null;
  hasNextPage: boolean;
}

export class VodChatUpstreamError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "VodChatUpstreamError";
    this.status = status;
  }
}

function normalizeComment(node: GqlCommentNode | undefined): VodChatComment | null {
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

export async function fetchVodChatPage(
  videoId: string,
  options: { cursor?: string | null; offset?: number } = {},
): Promise<VodChatPage> {
  const cursor = options.cursor ?? null;
  const offset = Math.max(0, Math.floor(options.offset ?? 0));

  const variables: Record<string, string | number> = { videoID: videoId };
  if (cursor) {
    variables.cursor = cursor;
  } else {
    variables.contentOffsetSeconds = offset;
  }

  const res = await fetch(GQL_URL, {
    method: "POST",
    headers: {
      "Client-ID": GQL_CLIENT_ID,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      operationName: "VideoCommentsByOffsetOrCursor",
      variables,
      extensions: {
        persistedQuery: { version: 1, sha256Hash: COMMENTS_HASH },
      },
    }),
  });

  if (!res.ok) {
    throw new VodChatUpstreamError(
      `Twitch chat request failed (${res.status})`,
      res.status === 429 ? 429 : 502,
    );
  }

  const payload = await res.json();
  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    throw new VodChatUpstreamError(
      payload.errors[0]?.message || "Twitch GQL error",
    );
  }

  const video = payload?.data?.video;
  if (!video) {
    throw new VodChatUpstreamError("VOD not found", 404);
  }

  const comments = video.comments;
  if (!comments || !Array.isArray(comments.edges)) {
    return { comments: [], cursor: null, hasNextPage: false };
  }

  const edges = comments.edges as GqlEdge[];
  const normalized = edges
    .map((edge) => normalizeComment(edge.node))
    .filter((comment): comment is VodChatComment => Boolean(comment));

  return {
    comments: normalized,
    cursor: edges.length > 0 ? edges[edges.length - 1]?.cursor ?? null : null,
    hasNextPage: Boolean(comments.pageInfo?.hasNextPage),
  };
}
