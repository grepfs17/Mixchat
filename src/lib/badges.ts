import { ApiClient } from '@twurple/api';
import { StaticAuthProvider } from '@twurple/auth';
import type { HelixChatBadgeSet } from '@twurple/api';

// Shorthand for badge data we actually care about in the UI
export interface BadgeDetail {
  id: string;
  version: string;
  url: string;
  title: string;
  description: string;
}

// Store the full HelixChatBadgeSet objects for better metadata
let badgesGlobal: Map<string, HelixChatBadgeSet> = new Map();
let badgesChannel: Map<string, HelixChatBadgeSet> = new Map();

// Wipe everything if we switch accounts or reset
export function clearBadgeCache(): void {
  badgesGlobal.clear();
  badgesChannel.clear();
}

// Grab badge sets from Twitch. If channelId is null, gets global ones.
async function fetchBadges(apiClient: ApiClient, channelId?: string): Promise<Map<string, HelixChatBadgeSet>> {
  try {
    let resolvedId = channelId;

    // The Twitch badge API requires a numeric broadcaster_id. If we received a
    // login name (non-numeric), resolve it to the numeric user ID first.
    if (resolvedId && !/^\d+$/.test(resolvedId)) {
      const user = await apiClient.users.getUserByName(resolvedId);
      if (user) {
        resolvedId = user.id;
      } else {
        console.warn(`Could not resolve Twitch username "${resolvedId}" to a user ID — skipping channel badges.`);
        return new Map();
      }
    }

    const badgeSets = resolvedId
      ? await apiClient.chat.getChannelBadges(resolvedId)
      : await apiClient.chat.getGlobalBadges();

    const map = new Map<string, HelixChatBadgeSet>();
    badgeSets.forEach(set => map.set(set.id, set));
    return map;
  } catch (error) {
    console.warn(`Twitch ${channelId ? 'channel' : 'global'} badges not loaded:`, error);
    return new Map();
  }
}

// Pull down both global and channel-specific badges so we can show them in chat
export async function initializeBadges(channelId: string, accessToken: string, clientId: string): Promise<void> {
  const authProvider = new StaticAuthProvider(clientId, accessToken);
  const apiClient = new ApiClient({ authProvider });

  const [global, channel] = await Promise.all([
    fetchBadges(apiClient),
    fetchBadges(apiClient, channelId),
  ]);

  badgesGlobal = global;
  badgesChannel = channel;
}

// Get the raw image URL for a specific badge/version
export function getBadge(name: string, version: string): string | undefined {
  const detail = getBadgeDetail(name, version);
  return detail?.url;
}

// Find the full badge info, checking the channel first (custom badges) then global ones
export function getBadgeDetail(name: string, version: string): BadgeDetail | undefined {
  // Look in channel badges first, then global
  const set = badgesChannel.get(name) || badgesGlobal.get(name);
  if (!set) return undefined;

  const v = set.getVersion(version);
  if (!v) return undefined;

  return {
    id: name,
    version: version,
    url: v.getImageUrl(2) || v.getImageUrl(1), // Default to 2x for better appearance
    title: v.title,
    description: v.description
  };
}
