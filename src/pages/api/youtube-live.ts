import type { APIRoute } from "astro";

// Simple in-memory cache and in-flight dedupe to avoid excessive YouTube API calls.

const CHANNEL_CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours
const LIVE_CACHE_TTL = 1000 * 60 * 10; // 10 minutes

const channelResolveCache = new Map<
  string,
  { channelId: string; expires: number }
>();
const liveVideoCache = new Map<
  string,
  { videoId: string | null; expires: number }
>();

const inFlightChannelResolves = new Map<string, Promise<string | null>>();
const inFlightLiveFinds = new Map<string, Promise<string | null>>();

// Resolve a YouTube channel URL to its active live stream video ID.
// We use the Data API v3 and some local caching to save on quota.
export const GET: APIRoute = async ({ url, request }) => {
  const headers = {

    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=60, s-maxage=600",
  };

  try {
    const channelUrl = url.searchParams.get("channelUrl");

    // Check Authorization header for accessToken
    const authHeader = url.searchParams.get("accessToken") || (typeof request !== 'undefined' ? (request as any).headers.get("Authorization") : null);
    const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : authHeader;

    if (!channelUrl) {
      return new Response(
        JSON.stringify({ error: "channelUrl parameter is required" }),
        { status: 400, headers },
      );
    }

    const apiKey = import.meta.env.PUBLIC_YOUTUBE_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "YouTube API key not configured on the server",
        }),
        { status: 500, headers },
      );
    }

    // 1. Resolve the channel URL to a channel ID
    const channelId = await resolveChannelId(channelUrl, apiKey);
    if (!channelId) {
      return new Response(
        JSON.stringify({
          error: "Could not resolve YouTube channel from the given URL",
        }),
        { status: 404, headers },
      );
    }

    // 2. If we have an access token, check if it belongs to this channel
    // This allows finding unlisted or private streams for the logged-in user.
    if (accessToken) {
      try {
        const myChannelId = await getMyChannelId(accessToken);
        if (myChannelId === channelId) {
          const liveId = await findMyLiveVideoId(accessToken);
          if (liveId) {
            return new Response(JSON.stringify({ videoId: liveId, channelId }), {
              status: 200,
              headers,
            });
          }
        }
      } catch (e) {
        console.warn("Auth-based live check failed:", e);
      }
    }

    // 3. Search for an active live stream on that channel (public)
    const videoId = await findLiveVideoId(channelId, apiKey);
    if (!videoId) {
      // Return 200 with null videoId instead of 404 to avoid console errors.
      // 404 is still technically correct (the live stream resource isn't there),
      // but it causes noise in browser developer tools for periodic polling.
      return new Response(
        JSON.stringify({
          videoId: null,
          error: "No active live stream found for this channel",
          channelId,
        }),
        { status: 200, headers },
      );
    }

    return new Response(JSON.stringify({ videoId, channelId }), {
      status: 200,
      headers,
    });

  } catch (error) {
    console.error("youtube-live API error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      { status: 500, headers },
    );
  }
};

/**
 * Uses a YouTube access token to find the authorized user's channel ID.
 */
async function getMyChannelId(accessToken: string): Promise<string | null> {
  const res = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=id&mine=true",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!res.ok) return null;
  const data = await res.json();
  if (data.items && data.items.length > 0) {
    return data.items[0].id;
  }
  return null;
}


/**
 * Uses a YouTube access token to find the currently active live broadcast for the authorized user.
 */
async function findMyLiveVideoId(accessToken: string): Promise<string | null> {
  const res = await fetch(
    "https://www.googleapis.com/youtube/v3/liveBroadcasts?part=id&broadcastStatus=active&mine=true",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!res.ok) {
    if (res.status === 401) throw new Error("Unauthorized");
    return null;
  }

  const data = await res.json();
  if (data.items && data.items.length > 0) {
    // Return the video ID (the broadcast ID is identical to the video ID)
    return data.items[0].id;
  }
  return null;
}




// Helper to resolve different styles of YouTube URLs (handles, channel IDs, etc) 
// and return the core channel ID.
async function resolveChannelId(
  channelUrl: string,
  apiKey: string,
): Promise<string | null> {
  const now = Date.now();

  // Return cached mapping if available
  const cached = channelResolveCache.get(channelUrl);
  if (cached && cached.expires > now) {
    return cached.channelId;
  }

  // Deduplicate concurrent resolves for the same URL
  if (inFlightChannelResolves.has(channelUrl)) {
    return await inFlightChannelResolves.get(channelUrl)!;
  }

  const promise = (async () => {
    let parsed: URL;
    try {
      parsed = new URL(channelUrl);
    } catch {
      return null;
    }

    const pathname = parsed.pathname; // e.g. /@lunateac or /channel/UCxyz

    // Direct channel ID
    if (pathname.startsWith("/channel/")) {
      const id = pathname.replace("/channel/", "").split("/")[0];
      channelResolveCache.set(channelUrl, {
        channelId: id,
        expires: now + CHANNEL_CACHE_TTL,
      });
      return id;
    }

    // Handle-based URL (@handle)
    if (pathname.startsWith("/@")) {
      const handle = pathname.replace("/@", "").split("/")[0];
      const id = await resolveHandleViaApi(handle, apiKey);
      if (id)
        channelResolveCache.set(channelUrl, {
          channelId: id,
          expires: now + CHANNEL_CACHE_TTL,
        });
      return id;
    }

    // /c/CustomName or /user/Username – try forUsername first, then search
    if (pathname.startsWith("/c/") || pathname.startsWith("/user/")) {
      const name = pathname.split("/")[2];
      const id = await resolveByUsernameOrSearch(name, apiKey);
      if (id)
        channelResolveCache.set(channelUrl, {
          channelId: id,
          expires: now + CHANNEL_CACHE_TTL,
        });
      return id;
    }

    // Fallback: treat last segment as possible handle
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      const id = await resolveHandleViaApi(
        segments[segments.length - 1],
        apiKey,
      );
      if (id)
        channelResolveCache.set(channelUrl, {
          channelId: id,
          expires: now + CHANNEL_CACHE_TTL,
        });
      return id;
    }

    return null;
  })();

  inFlightChannelResolves.set(channelUrl, promise);
  try {
    return await promise;
  } finally {
    inFlightChannelResolves.delete(channelUrl);
  }
}

async function resolveHandleViaApi(
  handle: string,
  apiKey: string,
): Promise<string | null> {
  // YouTube Data API v3 – channels.list with forHandle
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(handle)}&key=${apiKey}`,
  );
  if (!res.ok) {
    console.warn(`YouTube API channels.list forHandle failed: ${res.status}`);
    // Fallback to search
    return resolveByUsernameOrSearch(handle, apiKey);
  }
  const data = await res.json();
  if (data.items && data.items.length > 0) {
    return data.items[0].id;
  }
  // Fallback to search
  return resolveByUsernameOrSearch(handle, apiKey);
}

async function resolveByUsernameOrSearch(
  name: string,
  apiKey: string,
): Promise<string | null> {
  // Try forUsername
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=id&forUsername=${encodeURIComponent(name)}&key=${apiKey}`,
  );
  if (res.ok) {
    const data = await res.json();
    if (data.items && data.items.length > 0) {
      return data.items[0].id;
    }
  }

  // Last resort: search for the channel name
  const searchRes = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(name)}&type=channel&maxResults=1&key=${apiKey}`,
  );
  if (searchRes.ok) {
    const searchData = await searchRes.json();
    if (searchData.items && searchData.items.length > 0) {
      return searchData.items[0].snippet.channelId;
    }
  }

  return null;
}

// Check if a channel actually has a live stream running right now
async function findLiveVideoId(
  channelId: string,
  apiKey: string,
): Promise<string | null> {
  const now = Date.now();

  // Check cache first
  const cached = liveVideoCache.get(channelId);
  if (cached && cached.expires > now) {
    return cached.videoId;
  }

  // Dedupe concurrent lookups
  if (inFlightLiveFinds.has(channelId)) {
    return await inFlightLiveFinds.get(channelId)!;
  }

  const promise = (async () => {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=id&channelId=${channelId}&eventType=live&type=video&maxResults=1&key=${apiKey}`,
    );
    if (!res.ok) {
      console.warn(`YouTube search for live video failed: ${res.status}`);
      // Cache negative result for a short period to avoid thundering retry
      liveVideoCache.set(channelId, {
        videoId: null,
        expires: now + LIVE_CACHE_TTL,
      });
      return null;
    }
    const data = await res.json();
    if (data.items && data.items.length > 0) {
      const vid = data.items[0].id.videoId;
      liveVideoCache.set(channelId, {
        videoId: vid,
        expires: now + LIVE_CACHE_TTL,
      });
      return vid;
    }
    // No live video found — cache null for a short period
    liveVideoCache.set(channelId, {
      videoId: null,
      expires: now + LIVE_CACHE_TTL,
    });
    return null;
  })();

  inFlightLiveFinds.set(channelId, promise);
  try {
    return await promise;
  } finally {
    inFlightLiveFinds.delete(channelId);
  }
}
