import { parseYouTubeId } from "./types";

export interface OEmbedMetadata {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
}

export class VideoValidationError extends Error {
  constructor(
    public readonly code:
      | "invalid-id"
      | "unembeddable"
      | "private-or-removed"
      | "age-restricted"
      | "network",
    message: string,
  ) {
    super(message);
    this.name = "VideoValidationError";
  }
}

/**
 * Fetch public video metadata via the YouTube oEmbed endpoint.
 *
 * oEmbed requires no authentication and is rate-limited only loosely by
 * YouTube. We deliberately use it (not the Data API) because the user has
 * chosen to avoid any new OAuth scope. The endpoint returns:
 * - 200 + JSON for public, embeddable videos
 * - 401 for non-embeddable (e.g. owner disabled embed)
 * - 404 for private/removed
 * - 200 with no `thumbnail_url` for age-restricted (we treat that as
 *   effectively unembeddable)
 */
export async function fetchVideoMeta(
  videoId: string,
  fetcher: typeof fetch = fetch,
): Promise<OEmbedMetadata> {
  if (!parseYouTubeId(videoId)) {
    throw new VideoValidationError("invalid-id", "Not a valid YouTube video id");
  }
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&format=json`;
  let res: Response;
  try {
    res = await fetcher(url);
  } catch (err) {
    throw new VideoValidationError(
      "network",
      err instanceof Error ? err.message : "Network error",
    );
  }
  if (res.status === 401) {
    throw new VideoValidationError(
      "unembeddable",
      "This video cannot be embedded.",
    );
  }
  if (res.status === 404) {
    throw new VideoValidationError(
      "private-or-removed",
      "This video is private or has been removed.",
    );
  }
  if (!res.ok) {
    throw new VideoValidationError(
      "network",
      `oembed returned ${res.status}`,
    );
  }
  const body = (await res.json()) as {
    title?: string;
    author_name?: string;
    thumbnail_url?: string;
  };
  if (!body.thumbnail_url) {
    throw new VideoValidationError(
      "age-restricted",
      "This video is age-restricted.",
    );
  }
  return {
    videoId,
    title: body.title || "Untitled",
    channelTitle: body.author_name || "Unknown",
    thumbnail: body.thumbnail_url,
  };
}
