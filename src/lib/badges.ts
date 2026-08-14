// Badge catalog used to map IRC badge tags (name + version) to image URLs.
//
// The data is fetched through `/api/twitch-proxy` (server-side, using the
// httpOnly `twitch_token` cookie) instead of a browser twurple `ApiClient`,
// which can't work in the browser because id.twitch.tv/oauth2/validate is
// CORS-blocked for third-party origins.

export interface BadgeDetail {
  id: string;
  version: string;
  url: string;
  title: string;
  description: string;
}

interface BadgeSet {
  versions: Map<string, BadgeDetail>;
}

let badgesGlobal: Map<string, BadgeSet> = new Map();
let badgesChannel: Map<string, BadgeSet> = new Map();

// Wipe everything if we switch accounts or reset
export function clearBadgeCache(): void {
  badgesGlobal.clear();
  badgesChannel.clear();
}

interface HelixBadgeVersion {
  id: string;
  image_url_1x?: string;
  image_url_2x?: string;
  image_url_4x?: string;
  title?: string;
  description?: string;
}

interface HelixBadgeSet {
  set_id: string;
  versions?: HelixBadgeVersion[];
}

async function fetchBadgeSets(
  query: string,
): Promise<Map<string, BadgeSet>> {
  const map = new Map<string, BadgeSet>();
  try {
    const res = await fetch(`/api/twitch-proxy?${query}`);
    if (!res.ok) {
      console.warn(`Twitch badges not loaded (${res.status}) for ${query}`);
      return map;
    }
    const data = await res.json();
    for (const set of (data?.data ?? []) as HelixBadgeSet[]) {
      const versions = new Map<string, BadgeDetail>();
      for (const version of set.versions ?? []) {
        versions.set(version.id, {
          id: set.set_id,
          version: version.id,
          url: version.image_url_2x || version.image_url_1x || "",
          title: version.title || "",
          description: version.description || "",
        });
      }
      map.set(set.set_id, { versions });
    }
  } catch (error) {
    console.warn(`Twitch badges not loaded for ${query}:`, error);
  }
  return map;
}

/** Resolve a broadcaster login name to a numeric ID when necessary. */
async function resolveChannelId(channelId: string): Promise<string | null> {
  if (/^\d+$/.test(channelId)) return channelId;
  try {
    const res = await fetch(
      `/api/twitch-proxy?path=/helix/users&login=${encodeURIComponent(channelId)}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

/** Pull down global and channel-specific badges. */
export async function initializeBadges(
  channelId: string,
  _accessToken?: string,
  _clientId?: string,
): Promise<void> {
  const resolvedId = await resolveChannelId(channelId);

  const [global, channel] = await Promise.all([
    fetchBadgeSets("path=/helix/chat/badges/global"),
    resolvedId
      ? fetchBadgeSets(
          `path=/helix/chat/badges&broadcaster_id=${encodeURIComponent(resolvedId)}`,
        )
      : Promise.resolve(new Map<string, BadgeSet>()),
  ]);

  badgesGlobal = global;
  badgesChannel = channel;
}

// Get the raw image URL for a specific badge/version
export function getBadge(name: string, version: string): string | undefined {
  return getBadgeDetail(name, version)?.url;
}

// Find the full badge info, checking the channel first (custom badges) then global
export function getBadgeDetail(
  name: string,
  version: string,
): BadgeDetail | undefined {
  const set = badgesChannel.get(name) || badgesGlobal.get(name);
  if (!set) return undefined;

  return set.versions.get(version);
}
