// Shared helper for fetching the Twitch "Pinned Chat Highlight" for the
// currently-live broadcast of a given channel login. Used by both:
//   - src/pages/api/stream-playlist.ts (server-side diagnostic log)
//   - src/pages/api/pinned-highlight.ts  (chat banner data source)

const GQL_CLIENT_ID =
  import.meta.env.TWITCH_GQL_CLIENT_ID ?? "kimne78kx3ncx6brgo4mv6wki5h1ko";

const BASE_GQL_HEADERS = {
  "Client-ID": GQL_CLIENT_ID,
  "Content-Type": "application/json",
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (compatible; mixchat/0.1)",
};

/**
 * Subset of a Twitch GQL `PinnedChatMessageConnection.edges[0].node` payload.
 * The actual chat message lives under `.pinnedMessage`, the moderator who
 * pinned it under `.pinnedBy`, and the sender's chat color under
 * `.pinnedMessage.sender.chatColor`. `type` is "MOD" for moderator-pinned
 * messages, "CHANNEL_POINTS" or "USER_POINTS" for Hype-train / channel-points
 * pinned messages.
 */
export interface TwitchPinnedHighlightRaw {
  id: string;
  type: string;
  pinnedMessage: {
    id: string;
    sentAt: string;
    content: { text: string };
    sender: {
      id: string;
      login: string;
      displayName: string;
      chatColor: string | null;
    };
  };
  startsAt: string;
  updatedAt: string;
  endsAt: string | null;
  pinnedBy: {
    id: string;
    login: string;
    displayName: string;
  } | null;
}

/**
 * Issue a `GetPinnedChat` query against `gql.twitch.tv/gql` for the given
 * channel login. Returns `null` rather than throwing when the channel is
 * offline, no message is pinned, or Twitch rejects the query, the caller
 * treats "not pinned" identically to a soft failure.
 */
export async function fetchPinnedChatHighlight(
  channel: string,
): Promise<TwitchPinnedHighlightRaw | null> {
  const gqlBody = {
    operationName: "GetPinnedChat",
    variables: { channelLogin: channel },
    query: `query GetPinnedChat($channelLogin: String!) {
      channel(name: $channelLogin) {
        id
        pinnedChatMessages {
          edges {
            node {
              id
              type
              pinnedMessage {
                id
                sentAt
                content { text }
                sender {
                  id
                  login
                  chatColor
                  displayName
                }
              }
              startsAt
              updatedAt
              endsAt
              pinnedBy {
                id
                login
                displayName
              }
            }
            cursor
          }
          pageInfo { hasNextPage }
        }
      }
    }`,
  };

  const gqlRes = await fetch("https://gql.twitch.tv/gql", {
    method: "POST",
    headers: BASE_GQL_HEADERS,
    body: JSON.stringify(gqlBody),
  });

  if (!gqlRes.ok) {
    throw new Error(`Twitch GQL pinned error: ${gqlRes.status}`);
  }

  type GqlResponse = {
    errors?: unknown;
    data?: {
      channel?: {
        pinnedChatMessages?: {
          edges?: Array<{ node?: TwitchPinnedHighlightRaw | null }>;
        };
      };
    };
  };

  const gqlData = (await gqlRes.json()) as GqlResponse;

  if (Array.isArray(gqlData?.errors) && gqlData.errors.length > 0) {
    console.warn(
      "[twitchPinnedHighlight] GQL returned errors:",
      gqlData.errors,
    );
  }

  const edges = gqlData?.data?.channel?.pinnedChatMessages?.edges ?? [];
  return edges[0]?.node ?? null;
}
