import type { PlatformSession, ChatMessage } from "./types.js";
import { getBadge, getBadgeDetail } from "./badges.js";

const TWITCH_API_BASE = "https://api.twitch.tv/helix";
const TWITCH_AUTH_BASE = "https://id.twitch.tv/oauth2";
const BATCH_SIZE = 100;

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
      Array.from({ length: Math.ceil(followedChannels.length / BATCH_SIZE) }, (_, idx) => {
        const batch = followedChannels.slice(idx * BATCH_SIZE, (idx + 1) * BATCH_SIZE);

        const profilePromise = fetch(
          `${TWITCH_API_BASE}/users?${batch.map((ch: any) => `id=${ch.id}`).join("&")}`,
          { headers: { Authorization: `Bearer ${accessToken}`, "Client-ID": clientId } },
        ).then(async (res) => {
          if (res.ok) {
            const usersData = await res.json();
            const userProfiles = new Map(
              (usersData.data || []).map((user: any) => [user.id, user.profile_image_url]),
            );
            batch.forEach((ch: any) => { ch.profileImageUrl = userProfiles.get(ch.id); });
          }
        });

        const streamPromise = fetch(
          `${TWITCH_API_BASE}/streams?${batch.map((ch: any) => `user_id=${ch.id}`).join("&")}&first=100`,
          { headers: { Authorization: `Bearer ${accessToken}`, "Client-ID": clientId } },
        ).then(async (res) => {
          if (res.ok) {
            const streamsData = await res.json();
            (streamsData.data || []).forEach((s: any) => { streamDataMap.set(s.user_id, s); });
          }
        });

        return Promise.all([profilePromise, streamPromise]);
      }),
    );

    followedChannels.forEach((ch: any) => {
      if (streamDataMap.has(ch.id)) {
        ch.viewerCount = streamDataMap.get(ch.id).viewer_count;
      } else {
        ch.viewerCount = 0;
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
    const response = await fetch(
      `${TWITCH_API_BASE}/streams?user_id=${userId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Client-ID": clientId,
        },
      },
    );

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
            console.warn("Failed to parse message:", rawMsg.substring(0, 100));
            return null;
          }

          const author = userMatch[1];
          const content = contentMatch[1];

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

          // Use the actual Twitch message ID if available, otherwise fall back to a composite ID
          const messageId = tags["id"] || `${tags["user-id"] || "unknown"}_${tags["tmi-sent-ts"] || Date.now()}`;

          const message: ChatMessage = {
            id: messageId,
            platform: "twitch",
            author,
            content,
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
