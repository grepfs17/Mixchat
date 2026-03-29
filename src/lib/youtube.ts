/**
 * YouTube OAuth and API Client
 */

export interface YouTubeTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export interface YouTubeUser {
  userId: string;
  displayName: string;
  profileImageUrl: string;
}

/**
 * Exchange authorization code for access token
 */
export async function getYoutubeAccessToken(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<YouTubeTokenResponse> {
  const params = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: params,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to get YouTube access token: ${response.statusText}`,
    );
  }

  return response.json();
}

/**
 * Get YouTube user information
 */
export async function getYoutubeUser(
  accessToken: string,
): Promise<YouTubeUser> {
  const response = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to get YouTube user: ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.items || data.items.length === 0) {
    throw new Error("No YouTube channel found");
  }

  const channel = data.items[0];

  return {
    userId: channel.id,
    displayName: channel.snippet.title,
    profileImageUrl: channel.snippet.thumbnails?.default?.url || "",
  };
}

/**
 * Refresh YouTube access token
 */
export async function refreshYoutubeToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<YouTubeTokenResponse> {
  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: params,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh YouTube token: ${response.statusText}`);
  }

  return response.json();
}
