import type { ChatMessage } from "./types.js";
import { getBadgeDetail } from "./badges.js";

const TWITCH_API_BASE = "https://api.twitch.tv/helix";
const TWITCH_AUTH_BASE = "https://id.twitch.tv/oauth2";
const BATCH_SIZE = 100;

/** Resolve a broadcaster login name to a numeric ID when necessary.
 * If the input is already numeric, it is returned unchanged.
 * Returns the resolved numeric ID or the original input if resolution fails.
 */
export const resolveBroadcasterId = async (broadcasterIdOrLogin: string) => {
  if (/^\d+$/.test(broadcasterIdOrLogin)) return broadcasterIdOrLogin;

  try {
    const r = await fetch(
      `/api/twitch-proxy?path=/helix/users&login=${encodeURIComponent(broadcasterIdOrLogin)}`,
    );
    if (!r.ok) return broadcasterIdOrLogin;
    const d = await r.json();
    const id = d?.data?.[0]?.id;
    return id || broadcasterIdOrLogin;
  } catch (e) {
    return broadcasterIdOrLogin;
  }
};

export const getTwitchAccessToken = async (
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
) => {
  try {
    const response = await fetch(`${TWITCH_AUTH_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      throw new Error(`Twitch token exchange failed: ${response.status}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  } catch (error) {
    console.error("Twitch token exchange failed:", error);
    throw error;
  }
};

/**
 * Send a chat message via Helix and return the message ID.
 * Requires user:write:chat scope.
 */
export const sendHelixMessage = async (
  broadcasterId: string,
  senderId: string,
  message: string,
  replyParentMessageId?: string,
) => {
  try {
    const resolvedBroadcasterId = await resolveBroadcasterId(broadcasterId);
    const body: any = {
      broadcaster_id: resolvedBroadcasterId,
      sender_id: senderId,
      message,
    };
    if (replyParentMessageId) {
      body.reply_parent_message_id = replyParentMessageId;
    }

    const res = await fetch(`/api/twitch-proxy?path=/helix/chat/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "(unreadable)");
      throw new Error(`Failed to send Helix message: ${res.status} ${text}`);
    }

    const data = await res.json();
    return data?.data?.[0]?.message_id as string | undefined;
  } catch (error) {
    console.error("sendHelixMessage failed:", error);
    throw error;
  }
};

/**
 * Moderation helper: delete a single chat message by message ID.
 * Requires the server-side twitch token to belong to a moderator for the
 * specified broadcaster (the httpOnly cookie is used by the proxy).
 */
export const deleteChatMessage = async (
  broadcasterId: string,
  moderatorId: string,
  messageId: string,
) => {
  console.log("deleteChatMessage", messageId);
  try {
    if (messageId.startsWith("optimistic_")) {
      messageId = messageId.split("optimistic_")[1];
    }
    const resolvedBroadcasterId = await resolveBroadcasterId(broadcasterId);
    const res = await fetch(
      `/api/twitch-proxy?path=/helix/moderation/chat&broadcaster_id=${encodeURIComponent(
        resolvedBroadcasterId,
      )}&moderator_id=${encodeURIComponent(moderatorId)}&message_id=${encodeURIComponent(messageId)}`,
      { method: "DELETE" },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "(unreadable)");
      throw new Error(`Failed to delete message: ${res.status} ${body}`);
    }

    return true;
  } catch (error) {
    console.error("deleteChatMessage failed:", error);
    throw error;
  }
};

/**
 * Moderation helper: ban (or timeout if duration provided) a user.
 * If `durationSeconds` is provided the action will be a temporary timeout.
 */
export const createBan = async (
  broadcasterId: string,
  moderatorId: string,
  userId: string,
  durationSeconds?: number | null,
  reason?: string | null,
) => {
  try {
    const resolvedBroadcasterId = await resolveBroadcasterId(broadcasterId);

    const body: any = { data: { user_id: userId } };
    if (durationSeconds) body.data.duration = durationSeconds;
    if (reason) body.data.reason = reason;

    const res = await fetch(
      `/api/twitch-proxy?path=/helix/moderation/bans&broadcaster_id=${encodeURIComponent(
        resolvedBroadcasterId,
      )}&moderator_id=${encodeURIComponent(moderatorId)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "(unreadable)");
      throw new Error(`Failed to create ban/timeout: ${res.status} ${text}`);
    }

    return true;
  } catch (error) {
    console.error("createBan failed:", error);
    throw error;
  }
};

/**
 * Moderation helper: unban (or untimeout) a user.
 */
export const removeBan = async (
  broadcasterId: string,
  moderatorId: string,
  userId: string,
) => {
  try {
    const resolvedBroadcasterId = await resolveBroadcasterId(broadcasterId);
    const res = await fetch(
      `/api/twitch-proxy?path=/helix/moderation/bans&broadcaster_id=${encodeURIComponent(
        resolvedBroadcasterId,
      )}&moderator_id=${encodeURIComponent(moderatorId)}&user_id=${encodeURIComponent(userId)}`,
      { method: "DELETE" },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "(unreadable)");
      throw new Error(`Failed to remove ban: ${res.status} ${text}`);
    }

    return true;
  } catch (error) {
    console.error("removeBan failed:", error);
    throw error;
  }
};

/**
 * Moderation helper: Clear all messages from the chat.
 */
export const clearChat = async (broadcasterId: string, moderatorId: string) => {
  try {
    const resolvedBroadcasterId = await resolveBroadcasterId(broadcasterId);
    const res = await fetch(
      `/api/twitch-proxy?path=/helix/moderation/chat&broadcaster_id=${encodeURIComponent(
        resolvedBroadcasterId,
      )}&moderator_id=${encodeURIComponent(moderatorId)}`,
      { method: "DELETE" },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "(unreadable)");
      throw new Error(`Failed to clear chat: ${res.status} ${text}`);
    }

    return true;
  } catch (error) {
    console.error("clearChat failed:", error);
    throw error;
  }
};

export const refreshTwitchAccessToken = async (
  refreshToken: string,
  clientId: string,
  clientSecret: string,
) => {
  try {
    const response = await fetch(`${TWITCH_AUTH_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      if (response.status === 400 || response.status === 401) {
        throw new Error(
          `Invalid refresh token (Twitch returned ${response.status})`,
        );
      }
      throw new Error(`Failed to refresh token: ${response.status}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresIn: data.expires_in,
    };
  } catch (error) {
    console.error("Twitch token refresh failed:", error);
    throw error;
  }
};

export const getTwitchUser = async (accessToken: string, clientId: string) => {
  try {
    const response = await fetch(`${TWITCH_API_BASE}/users`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Client-ID": clientId,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Twitch API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();

    if (!data.data || !data.data[0]) {
      throw new Error("No user data returned from Twitch API");
    }

    const user = data.data[0];
    return {
      userId: user.id,
      displayName: user.display_name,
      login: user.login,
      profileImageUrl: user.profile_image_url,
    };
  } catch (error) {
    console.error("Failed to get Twitch user:", error);
    throw error;
  }
};

export const getTwitchUserById = async (
  accessToken: string,
  clientId: string,
  userId: string,
) => {
  try {
    const response = await fetch(`${TWITCH_API_BASE}/users?id=${userId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Client-ID": clientId,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Twitch API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();

    if (!data.data || !data.data[0]) {
      return null;
    }

    const user = data.data[0];
    return {
      userId: user.id,
      displayName: user.display_name,
      login: user.login,
      profileImageUrl: user.profile_image_url,
    };
  } catch (error) {
    console.error("Failed to get Twitch user by ID:", error);
    return null;
  }
};

export const getAllFollowedChannels = async (
  accessToken: string,
  clientId: string,
  userId: string,
) => {
  try {
    let followedChannels: any[] = [];
    let cursor: string | undefined = undefined;

    while (true) {
      const url = new URL(`${TWITCH_API_BASE}/channels/followed`);
      url.searchParams.set("user_id", userId);
      url.searchParams.set("first", "100");
      if (cursor) {
        url.searchParams.set("after", cursor);
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Client-ID": clientId,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error(
            `Twitch API error: 401 - Unauthorized. Token may be expired or invalid.`,
          );
        }
        throw new Error(`Twitch API error: ${response.status}`);
      }

      const data = await response.json();
      const pageChannels = (data.data || []).map((channel: any) => ({
        id: channel.broadcaster_id,
        name: channel.broadcaster_login,
        displayName:
          channel.broadcaster_name ||
          channel.display_name ||
          channel.broadcaster_login,
        title: channel.game_name || "",
        thumbnail: channel.thumbnail_url,
      }));

      followedChannels.push(...pageChannels);

      if (data.pagination?.cursor) {
        cursor = data.pagination.cursor;
      } else {
        break;
      }
    }

    // Enrich with profile images and fetch stream data (batched, parallelized)
    const streamDataMap = new Map<string, any>();

    await Promise.all(
      Array.from(
        { length: Math.ceil(followedChannels.length / BATCH_SIZE) },
        (_, idx) => {
          const batch = followedChannels.slice(
            idx * BATCH_SIZE,
            (idx + 1) * BATCH_SIZE,
          );

          const profilePromise = fetch(
            `${TWITCH_API_BASE}/users?${batch.map((ch: any) => `id=${ch.id}`).join("&")}`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Client-ID": clientId,
              },
            },
          ).then(async (res) => {
            if (res.ok) {
              const usersData = await res.json();
              const userProfiles = new Map(
                (usersData.data || []).map((user: any) => [
                  user.id,
                  user.profile_image_url,
                ]),
              );
              batch.forEach((ch: any) => {
                ch.profileImageUrl = userProfiles.get(ch.id);
              });
            }
          });

          const streamPromise = fetch(
            `${TWITCH_API_BASE}/streams?${batch.map((ch: any) => `user_id=${ch.id}`).join("&")}&first=100`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Client-ID": clientId,
              },
            },
          ).then(async (res) => {
            if (res.ok) {
              const streamsData = await res.json();
              (streamsData.data || []).forEach((s: any) => {
                streamDataMap.set(s.user_id, s);
              });
            }
          });

          return Promise.all([profilePromise, streamPromise]);
        },
      ),
    );

    followedChannels.forEach((ch: any) => {
      if (streamDataMap.has(ch.id)) {
        const s = streamDataMap.get(ch.id);
        ch.viewerCount = s.viewer_count;
        ch.gameName = s.game_name || "";
        ch.thumbnailUrl = s.thumbnail_url || "";
      } else {
        ch.viewerCount = 0;
        ch.gameName = "";
        ch.thumbnailUrl = "";
      }
    });

    // Return all followed channels, sorted with online first
    const sorted = followedChannels.sort((a, b) => {
      const aIsOnline = streamDataMap.has(a.id) ? 1 : 0;
      const bIsOnline = streamDataMap.has(b.id) ? 1 : 0;

      if (aIsOnline !== bIsOnline) {
        return bIsOnline - aIsOnline; // Online channels first
      }

      const nameA = (a?.displayName || a?.name || "").toLowerCase();
      const nameB = (b?.displayName || b?.name || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });

    return sorted;
  } catch (error) {
    console.error("Failed to get all followed channels:", error);
    throw error;
  }
};

/**
 * Convenience wrapper: returns only the online followed channels.
 * Internally delegates to getAllFollowedChannels to avoid duplicate API calls.
 */
export const getFollowedChannels = async (
  accessToken: string,
  clientId: string,
  userId: string,
) => {
  const all = await getAllFollowedChannels(accessToken, clientId, userId);
  return all.filter((ch: any) => ch.viewerCount > 0);
};

/**
 * Check whether a user is following a broadcaster.
 * Returns true if `fromUserId` follows `toBroadcasterIdOrLogin`.
 */
export const isFollowingChannel = async (
  accessToken: string,
  clientId: string,
  fromUserId: string,
  toBroadcasterIdOrLogin: string,
) => {
  try {
    const toId = await resolveBroadcasterId(toBroadcasterIdOrLogin);
    const url = new URL(`${TWITCH_API_BASE}/users/follows`);
    url.searchParams.set("from_id", fromUserId);
    url.searchParams.set("to_id", toId);

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Client-ID": clientId,
      },
    });
    // Helix may return 410 (Gone) for some follow checks (deleted account / unavailable)
    // Treat 410 as "not following" instead of failing the flow.
    if (res.status === 410) {
      console.info(
        "[isFollowingChannel] Twitch API returned 410 (Gone) for follow check; treating as not following.",
      );
      return false;
    }
    if (!res.ok) return false;
    const data = await res.json();
    return (data.total || 0) > 0;
  } catch (err) {
    console.error("isFollowingChannel failed:", err);
    return false;
  }
};

export const getStreamStatus = async (
  accessToken: string,
  clientId: string,
  userId: string,
): Promise<{
  isLive: boolean;
  title?: string;
  viewerCount?: number;
  startedAt?: Date;
} | null> => {
  try {
    // Support both numeric user IDs and login names (e.g. manually joined channels)
    const isNumericId = /^\d+$/.test(userId);
    const queryParam = isNumericId
      ? `user_id=${userId}`
      : `user_login=${encodeURIComponent(userId)}`;
    const response = await fetch(`${TWITCH_API_BASE}/streams?${queryParam}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Client-ID": clientId,
      },
    });

    if (!response.ok) {
      throw new Error(`Twitch API error: ${response.status}`);
    }

    const data = await response.json();
    const stream = data.data?.[0];

    if (!stream) {
      return { isLive: false };
    }

    return {
      isLive: true,
      title: stream.title,
      viewerCount: stream.viewer_count,
      startedAt: new Date(stream.started_at),
    };
  } catch (error) {
    console.error("Failed to get stream status:", error);
    return null;
  }
};

/**
 * Batch query stream status for multiple users (optimized for rate limiting)
 * Instead of making N individual requests, batches into groups of up to 100
 * user_ids per request (Twitch API maximum).
 */
export const checkUserModStatus = async (
  accessToken: string,
  clientId: string,
  broadcasterId: string,
  userId: string,
) => {
  try {
    const resolvedBroadcasterId = await resolveBroadcasterId(broadcasterId);
    // Broadcaster is always a 'moderator' in their own channel
    if (resolvedBroadcasterId === userId) return true;

    const response = await fetch(
      `${TWITCH_API_BASE}/moderation/channels?user_id=${userId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Client-ID": clientId,
        },
      },
    );

    if (response.ok) {
      const data = await response.json();
      const channels = data.data || [];
      return channels.some(
        (ch: any) => ch.broadcaster_id === resolvedBroadcasterId,
      );
    } else if (response.status === 403) {
      // Scope missing or not a moderator.
      // We'll fall back to badge-based check in the component if this returns false.
      return false;
    }
  } catch (error) {
    console.error("Failed to check user mod status:", error);
  }
  return false;
};

export const getStreamStatuses = async (
  accessToken: string,
  clientId: string,
  userIds: string[],
): Promise<
  Record<
    string,
    { isLive: boolean; title?: string; viewerCount?: number; startedAt?: Date }
  >
> => {
  try {
    if (!userIds.length) {
      return {};
    }

    const result: Record<
      string,
      {
        isLive: boolean;
        title?: string;
        viewerCount?: number;
        startedAt?: Date;
      }
    > = {};

    // Initialize all user IDs as offline
    userIds.forEach((id) => {
      result[id] = { isLive: false };
    });

    // Batch into groups of BATCH_SIZE (100) to respect Twitch API limits, run in parallel
    await Promise.all(
      Array.from({ length: Math.ceil(userIds.length / BATCH_SIZE) }, (_, i) => {
        const batch = userIds.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
        const params = batch.map((id) => `user_id=${id}`).join("&");
        return fetch(`${TWITCH_API_BASE}/streams?${params}&first=100`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Client-ID": clientId,
          },
        }).then(async (response) => {
          if (!response.ok) {
            throw new Error(`Twitch API error: ${response.status}`);
          }
          const data = await response.json();
          // Update with actual live streams
          data.data?.forEach((stream: any) => {
            result[stream.user_id] = {
              isLive: true,
              title: stream.title,
              viewerCount: stream.viewer_count,
              startedAt: new Date(stream.started_at),
            };
          });
        });
      }),
    );

    const batchCount = Math.ceil(userIds.length / BATCH_SIZE);
    console.debug(
      `Batch stream check: ${userIds.length} streamers checked in ${batchCount} request(s)`,
    );
    return result;
  } catch (error) {
    console.error("Failed to get batch stream status:", error);
    throw error;
  }
};

export const getRecentMessages = async (
  channelName: string,
): Promise<ChatMessage[]> => {
  try {
    const response = await fetch(
      `https://recent-messages.robotty.de/api/v2/recent-messages/${channelName}`,
    );

    if (!response.ok) {
      console.warn(
        `Failed to fetch recent messages for ${channelName}:`,
        response.status,
      );
      return [];
    }

    const data = await response.json();

    const messages: ChatMessage[] = (data.messages || [])
      .map((rawMsg: string) => {
        try {
          const tagsMatch = rawMsg.match(/^@(.+?)\s+:/);
          const userMatch = rawMsg.match(/\s:([^!]+)!/);
          const contentMatch = rawMsg.match(/PRIVMSG #[^\s]+ :(.+)$/);

          if (!userMatch || !contentMatch) {
            return null;
          }

          const loginName = userMatch[1];
          const rawContent = contentMatch[1];

          // Parse tags
          let tags: Record<string, string> = {};
          if (tagsMatch && tagsMatch[1]) {
            const tagPairs = tagsMatch[1].split(";");
            tags = Object.fromEntries(
              tagPairs.map((pair) => {
                const eqIdx = pair.indexOf("=");
                return [pair.slice(0, eqIdx), pair.slice(eqIdx + 1) || ""];
              }),
            );
          }

          // Use display-name tag when available so names render with proper casing
          const author = tags["display-name"] || loginName;

          let badges: Record<string, string> = {};
          let badgeDetails: Record<string, { url: string; title: string }> = {};
          if (tags["badges"]) {
            tags["badges"].split(",").forEach((badge: string) => {
              const [name, version] = badge.split("/");
              const detail = getBadgeDetail(name, version);
              if (detail) {
                badges[name] = detail.url;
                badgeDetails[name] = { url: detail.url, title: detail.title };
              }
            });
          }

          let emotes: Record<string, string[]> = {};
          if (tags["emotes"] && tags["emotes"] !== "") {
            emotes = Object.fromEntries(
              tags["emotes"].split("/").map((emote: string) => {
                const [id, positions] = emote.split(":");
                return [id, positions.split(",")];
              }),
            );
          }

          // Parse reply-parent tags (present when this message is itself a reply)
          let replyTo:
            | { id: string; author: string; content: string }
            | undefined = undefined;
          if (tags["reply-parent-msg-id"]) {
            // IRC tag values escape spaces as \s
            const parentBody = (tags["reply-parent-msg-body"] || "")
              .replace(/\\s/g, " ")
              .replace(/\\:/g, ";")
              .replace(/\\\\/g, "\\");
            replyTo = {
              id: tags["reply-parent-msg-id"],
              author:
                tags["reply-parent-display-name"] ||
                tags["reply-parent-user-login"] ||
                "",
              content: parentBody,
            };
          }

          // When a message is a reply, Twitch prepends "@login " to the content
          // in the IRC line. Strip it so the content matches what Twurple returns
          // for live messages.
          let content = rawContent;
          if (replyTo && content.startsWith("@")) {
            const spaceIdx = content.indexOf(" ");
            if (spaceIdx !== -1) {
              const emoteOffset = spaceIdx + 1;
              content = content.substring(emoteOffset);

              // Adjust emote character offsets, they point into the original
              // rawContent which still has the "@login " prefix.  After stripping
              // that prefix every position must be shifted left by emoteOffset.
              if (Object.keys(emotes).length > 0) {
                const adjusted: Record<string, string[]> = {};
                for (const [id, positions] of Object.entries(emotes)) {
                  const shiftedPositions = positions
                    .map((pos) => {
                      const [s, e] = pos.split("-").map(Number);
                      return `${s - emoteOffset}-${e - emoteOffset}`;
                    })
                    .filter((pos) => Number(pos.split("-")[0]) >= 0);
                  if (shiftedPositions.length > 0)
                    adjusted[id] = shiftedPositions;
                }
                emotes = adjusted;
              }
            }
          }

          // Use the actual Twitch message ID if available, otherwise fall back to a composite ID
          const messageId =
            tags["id"] ||
            `${tags["user-id"] || "unknown"}_${tags["tmi-sent-ts"] || Date.now()}`;

          const message: ChatMessage = {
            id: messageId,
            platform: "twitch",
            author,
            content,
            replyTo,
            timestamp: new Date(parseInt(tags["tmi-sent-ts"]) || Date.now()),
            userId: tags["user-id"] || "",
            authorColor: tags["color"] || "#FFFFFF",
            badges,
            badgeDetails,
            emotes,
            isBot: tags["bot"] === "1",
            mentionsUser: false,
            isPreloaded: true, // Mark as preloaded historical message
          };

          return message;
        } catch (error) {
          console.error(
            "Error parsing message:",
            rawMsg.substring(0, 100),
            error,
          );
          return null;
        }
      })
      .filter((msg: ChatMessage | null): msg is ChatMessage => msg !== null);

    return messages;
  } catch (error) {
    console.error("Failed to fetch recent messages:", error);
    return [];
  }
};
