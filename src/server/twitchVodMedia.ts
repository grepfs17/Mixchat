const GQL_URL = "https://gql.twitch.tv/gql";
const GQL_CLIENT_ID = "kd1unb4b3q4t58fwlpcbzcbnm76a8fp";
const PLAYBACK_HASH =
  "ed230aa1e33e07eebb8928504583da78a5173989fadfb1ac94be06a04f3cdbe9";
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const ALLOWED_CDN_HOST_RE =
  /(^|\.)(ttvnw\.net|twitchsvc\.net|cloudfront\.net|twitch\.tv|akamaized\.net|llnwd\.net)$/i;

export class VodMediaError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "VodMediaError";
    this.status = status;
  }
}

interface VodVariant {
  name: string;
  bandwidth: number;
  url: string;
}

function assertAllowedCdn(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new VodMediaError("Invalid VOD media URL");
  }
  if (parsed.protocol !== "https:" || !ALLOWED_CDN_HOST_RE.test(parsed.hostname)) {
    throw new VodMediaError("Unsupported VOD media host");
  }
  return parsed;
}

async function fetchTwitch(url: string): Promise<Response> {
  return fetch(url, {
    headers: { "User-Agent": USER_AGENT, Referer: "https://www.twitch.tv/" },
  });
}

async function fetchVodPlaybackToken(
  videoId: string,
  oauthToken?: string,
): Promise<{ value: string; signature: string }> {
  const requestToken = (token?: string) =>
    fetch(GQL_URL, {
      method: "POST",
      headers: {
        "Client-ID": GQL_CLIENT_ID,
        "Content-Type": "application/json",
        ...(token ? { Authorization: `OAuth ${token}` } : {}),
      },
      body: JSON.stringify({
        operationName: "PlaybackAccessToken",
        extensions: {
          persistedQuery: { version: 1, sha256Hash: PLAYBACK_HASH },
        },
        variables: {
          isLive: false,
          login: "",
          isVod: true,
          vodID: videoId,
          playerType: "embed",
          platform: "site",
        },
      }),
    });

  const res = await requestToken(oauthToken);

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new VodMediaError(
        "Twitch authentication expired. Please re-login.",
        401,
      );
    }
    throw new VodMediaError(
      `Twitch playback token request failed (${res.status})`,
      res.status === 429 ? 429 : 502,
    );
  }

  const payload = await res.json();
  const token = payload?.data?.videoPlaybackAccessToken;
  if (!token?.value || !token?.signature) {
    throw new VodMediaError("VOD not found or unavailable", 404);
  }

  try {
    const decoded = JSON.parse(token.value);
    if (decoded?.authorization?.forbidden) {
      const reason = decoded.authorization.reason || "This VOD is restricted";
      throw new VodMediaError(reason, 403);
    }
  } catch (error) {
    if (error instanceof VodMediaError) throw error;
  }

  return { value: token.value, signature: token.signature };
}

function parseVariants(masterText: string, baseUrl: string): VodVariant[] {
  const lines = masterText.split("\n");
  const nameByGroup = new Map<string, string>();
  for (const line of lines) {
    if (!line.startsWith("#EXT-X-MEDIA:TYPE=VIDEO")) continue;
    const groupId = line.match(/GROUP-ID="([^"]+)"/)?.[1];
    const name = line.match(/NAME="([^"]+)"/)?.[1];
    if (groupId && name) nameByGroup.set(groupId, name);
  }

  const variants: VodVariant[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("#EXT-X-STREAM-INF:")) continue;
    const bandwidth = Number(
      lines[i].match(/BANDWIDTH=(\d+)/)?.[1] ?? "0",
    );
    const videoGroup = lines[i].match(/VIDEO="([^"]+)"/)?.[1];
    const uri = lines[i + 1]?.trim();
    if (!uri || uri.startsWith("#")) continue;
    let url: string;
    try {
      url = new URL(uri, baseUrl).toString();
    } catch {
      continue;
    }
    variants.push({
      name: (videoGroup && nameByGroup.get(videoGroup)) || videoGroup || "unknown",
      bandwidth,
      url,
    });
  }

  return variants;
}

function parseSegments(
  playlistText: string,
  baseUrl: string,
): { segments: string[]; isFmp4: boolean } {
  const segments: string[] = [];
  let isFmp4 = false;

  for (const rawLine of playlistText.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("#EXT-X-MAP:")) {
      const uri = line.match(/URI="([^"]+)"/)?.[1];
      if (uri) {
        segments.push(assertAllowedCdn(new URL(uri, baseUrl).toString()).toString());
        isFmp4 = true;
      }
      continue;
    }

    if (line.startsWith("#")) continue;

    const url = assertAllowedCdn(new URL(line, baseUrl).toString()).toString();
    segments.push(url);
    if (/\.(m4s|mp4)(?:\?|$)/i.test(url)) isFmp4 = true;
  }

  return { segments, isFmp4 };
}

export interface VodMedia {
  quality: string;
  segmentUrls: string[];
  isFmp4: boolean;
}

export async function getVodMedia(
  videoId: string,
  oauthToken?: string,
): Promise<VodMedia> {
  const token = await fetchVodPlaybackToken(videoId, oauthToken);
  const params = new URLSearchParams({
    nauth: token.value,
    nauthsig: token.signature,
    allow_source: "true",
    allow_audio_only: "true",
    allow_spectre: "false",
    fast_bread: "true",
    player: "twitchweb",
    p: String(Math.floor(Math.random() * 999999)),
  });
  const masterUrl = `https://usher.ttvnw.net/vod/${encodeURIComponent(videoId)}.m3u8?${params}`;

  const masterRes = await fetchTwitch(masterUrl);
  if (!masterRes.ok) {
    throw new VodMediaError(
      `Unable to load VOD playlist (${masterRes.status})`,
      masterRes.status === 429 ? 429 : 502,
    );
  }

  const variants = parseVariants(await masterRes.text(), masterUrl);
  if (variants.length === 0) {
    throw new VodMediaError("No downloadable qualities found", 404);
  }

  const variant = variants.sort((a, b) => b.bandwidth - a.bandwidth)[0];
  const variantUrl = assertAllowedCdn(variant.url).toString();
  const variantRes = await fetchTwitch(variantUrl);
  if (!variantRes.ok) {
    throw new VodMediaError(
      `Unable to load VOD quality (${variantRes.status})`,
      variantRes.status === 429 ? 429 : 502,
    );
  }

  const { segments, isFmp4 } = parseSegments(
    await variantRes.text(),
    variantUrl,
  );
  if (segments.length === 0) {
    throw new VodMediaError("This VOD has no downloadable segments", 404);
  }

  return { quality: variant.name, segmentUrls: segments, isFmp4 };
}

export const VOD_USER_AGENT = USER_AGENT;
