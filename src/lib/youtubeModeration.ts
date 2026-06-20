/**
 * Client-side helpers for YouTube live chat moderation.
 *
 * All requests are routed through `/api/youtube-moderation`, which holds the
 * actual OAuth token in the `youtube_token` httpOnly cookie. Errors are
 * surfaced by throwing with a normalized message coming from the server.
 */

export interface YouTubeModError extends Error {
  status?: number;
}

async function callModeration(
  body: Record<string, unknown>,
): Promise<void> {
  const res = await fetch("/api/youtube-moderation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let errorText: string | undefined;
    let payload: any;
    try {
      payload = await res.json();
      errorText = payload?.error;
    } catch {
      try {
        errorText = await res.text();
      } catch {}
    }
    const err = new Error(
      errorText || `Moderation request failed (${res.status})`,
    ) as YouTubeModError;
    err.status = res.status;
    throw err;
  }
}

export async function deleteYouTubeMessage(
  videoId: string,
  messageId: string,
): Promise<void> {
  await callModeration({ action: "delete", videoId, messageId });
}

export async function banYouTubeUser(
  videoId: string,
  channelId: string,
  _displayName?: string,
): Promise<void> {
  await callModeration({ action: "ban", videoId, channelId });
}

export async function timeoutYouTubeUser(
  videoId: string,
  channelId: string,
  durationSeconds: number,
  _displayName?: string,
): Promise<void> {
  await callModeration({
    action: "timeout",
    videoId,
    channelId,
    durationSeconds,
  });
}
