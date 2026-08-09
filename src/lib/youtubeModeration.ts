/**
 * Client-side helpers for YouTube live chat moderation.
 *
 * All requests are routed through `/api/youtube-moderation`, which holds the
 * actual OAuth token in the `youtube_token` httpOnly cookie. Errors are
 * surfaced by throwing with a normalized message coming from the server.
 */

interface YouTubeModError extends Error {
  status?: number;
}

async function callModeration(body: Record<string, unknown>): Promise<void> {
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

export interface DeleteMessageContext {
  /** Author channel id (UC...), used to resolve the official Data API id. */
  channelId?: string;
  /** Plain text of the message, used to resolve the official Data API id. */
  text?: string;
  /** Render timestamp (ms) used to disambiguate matches. */
  publishedAtMs?: number;
}

export async function deleteYouTubeMessage(
  videoId: string,
  messageId: string,
  context?: DeleteMessageContext,
): Promise<void> {
  await callModeration({
    action: "delete",
    videoId,
    messageId,
    channelId: context?.channelId,
    text: context?.text,
    publishedAtMs: context?.publishedAtMs,
  });
}

export async function banYouTubeUser(
  videoId: string,
  channelId: string,
  _displayName?: string,
): Promise<void> {
  await callModeration({ action: "ban", videoId, channelId });
}

export async function approveYouTubeMessage(
  videoId: string,
  messageId: string,
): Promise<void> {
  await callModeration({
    action: "automod",
    videoId,
    messageId,
    decision: "approve",
  });
}

export async function denyYouTubeMessage(
  videoId: string,
  messageId: string,
): Promise<void> {
  await callModeration({
    action: "automod",
    videoId,
    messageId,
    decision: "deny",
  });
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
