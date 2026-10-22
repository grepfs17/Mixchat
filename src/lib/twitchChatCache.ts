// Cache for user info - limit to 500 entries for memory efficiency
const userInfoCache = new Map<
  string,
  { displayName: string; profileImageUrl: string | null }
>();
const MAX_CACHE_SIZE = 500;

// Cache for source channel (shared chat) info keyed by channel ID
// Twitch IRC does NOT send source-room-login, so we fetch it from the API
const sourceChannelInfoCache = new Map<
  string,
  { login: string | null; avatar: string | null }
>();
const MAX_SOURCE_CACHE = 200;

function setSourceChannelInfoCache(
  channelId: string,
  info: { login: string | null; avatar: string | null },
) {
  if (sourceChannelInfoCache.size >= MAX_SOURCE_CACHE) {
    const firstKey = sourceChannelInfoCache.keys().next().value;
    if (firstKey !== undefined) sourceChannelInfoCache.delete(firstKey);
  }
  sourceChannelInfoCache.set(channelId, info);
}

function setUserInfoCache(
  userId: string,
  info: { displayName: string; profileImageUrl: string | null },
) {
  if (userInfoCache.size >= MAX_CACHE_SIZE) {
    const firstKey = userInfoCache.keys().next().value;
    if (firstKey !== undefined) {
      userInfoCache.delete(firstKey);
    }
  }
  userInfoCache.set(userId, info);
}

export async function getUserInfo(
  userId: string,
  accessToken: string,
): Promise<{ displayName: string; profileImageUrl: string | null } | null> {
  if (userInfoCache.has(userId)) {
    return userInfoCache.get(userId)!;
  }

  try {
    const response = await fetch(`/api/user-info?userId=${userId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (response.ok) {
      const data = await response.json();
      setUserInfoCache(userId, data);
      return data;
    }
  } catch (error) {
    console.error("Failed to fetch user info:", error);
  }

  return null;
}

// Async function to get a source channel's login + avatar (for shared chat)
// NOTE: Twitch IRC only sends source-room-id, never source-room-login, so we
// must look up the login name via the API.
export async function getSourceChannelInfo(
  channelId: string,
  accessToken: string,
): Promise<{ login: string | null; avatar: string | null }> {
  if (sourceChannelInfoCache.has(channelId)) {
    return sourceChannelInfoCache.get(channelId)!;
  }

  try {
    const response = await fetch(`/api/user-info?userId=${channelId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.ok) {
      const data = await response.json();
      const info = {
        login: (data.login as string | null) ?? null,
        avatar: (data.profileImageUrl as string | null) ?? null,
      };
      setSourceChannelInfoCache(channelId, info);
      return info;
    }
  } catch (error) {
    console.error("Failed to fetch source channel info:", error);
  }

  const fallback = { login: null, avatar: null };
  setSourceChannelInfoCache(channelId, fallback);
  return fallback;
}

// Twitch IRC does NOT send the reward title/cost in the message tags (only
// the reward ID is present). We fetch the info from the Helix API once and
// cache it so subsequent redemptions of the same reward are instant.
const rewardInfoCache = new Map<string, { title: string; cost: number }>();
const MAX_REWARD_CACHE = 200;

function cacheRewardInfo(rewardId: string, title: string, cost: number) {
  if (rewardInfoCache.size >= MAX_REWARD_CACHE) {
    const firstKey = rewardInfoCache.keys().next().value;
    if (firstKey !== undefined) rewardInfoCache.delete(firstKey);
  }
  rewardInfoCache.set(rewardId, { title, cost });
}

export async function getRewardInfo(
  rewardId: string,
  broadcasterId: string,
  accessToken: string,
): Promise<{ title: string | null; cost: number | null }> {
  const cached = rewardInfoCache.get(rewardId);
  if (cached) {
    return { title: cached.title, cost: cached.cost };
  }

  try {
    const response = await fetch(
      `/api/twitch-proxy?path=/helix/channel_points/custom_rewards&broadcaster_id=${broadcasterId}&id=${encodeURIComponent(rewardId)}`,
    );
    if (response.ok) {
      const data = await response.json();
      const item = data?.data?.[0];
      const title: string | undefined = item?.title;
      const cost: number | undefined = item?.cost;
      if (title && cost != null) {
        cacheRewardInfo(rewardId, title, cost);
        return { title, cost };
      } else if (title) {
        cacheRewardInfo(rewardId, title, cost ?? 0);
        return { title, cost: cost ?? 0 };
      } else {
        console.warn(
          "[getRewardInfo] API returned ok but no title found. Response:",
          data,
        );
      }
    } else {
      const body = await response.text().catch(() => "(unreadable)");
      console.warn(
        `[getRewardInfo] API returned ${response.status} for rewardId=${rewardId} broadcasterId=${broadcasterId}. Body:`,
        body,
      );
    }
  } catch (error) {
    console.error("Failed to fetch reward info:", error);
  }

  return { title: null, cost: null };
}

/** Pre-fetches all custom rewards so redemption messages find titles already cached. */
export async function preCacheRewards(
  broadcasterId: string,
  accessToken: string,
  channelName: string,
): Promise<void> {
  try {
    const rewardsRes = await fetch(
      `/api/twitch-proxy?path=/helix/channel_points/custom_rewards&broadcaster_id=${broadcasterId}`,
    );
    if (rewardsRes.ok) {
      const rewardsData = await rewardsRes.json();
      const rewards: { id: string; title: string; cost: number }[] =
        rewardsData?.data ?? [];
      rewards.forEach((r) => {
        if (r.id && r.title) cacheRewardInfo(r.id, r.title, r.cost ?? 0);
      });
      console.log(
        `[useTwitchChat] Pre-cached ${rewards.length} custom reward title(s) for channel "${channelName}"`,
      );
    } else {
      const body = await rewardsRes.text().catch(() => "(unreadable)");
      console.info(
        `[useTwitchChat] Could not pre-fetch custom rewards (${rewardsRes.status}). Reward titles will not be shown. This is expected when viewing another broadcaster's channel. Body:`,
        body,
      );
    }
  } catch {
    // Non-fatal: viewers will simply not see reward titles
  }
}

export function getCachedAvatar(userId?: string): string | undefined {
  return userId
    ? userInfoCache.get(userId)?.profileImageUrl || undefined
    : undefined;
}

export function getCachedRewardInfo(
  rewardId: string,
): { title: string; cost: number } | undefined {
  return rewardInfoCache.get(rewardId);
}

export function getCachedSourceChannelInfo(
  sourceRoomId: string,
): { login: string | null; avatar: string | null } | undefined {
  return sourceChannelInfoCache.get(sourceRoomId);
}

export function getCachedUserInfo(
  userId: string,
): { displayName: string; profileImageUrl: string | null } | undefined {
  return userInfoCache.get(userId);
}
