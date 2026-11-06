import type { AstroCookies } from "astro";
import {
  getSession,
  mutateSession,
  mutateSessionByChannel,
  readSessionWithToken,
} from "./songQueueStore";
import { authorizeChannel } from "./wheelAuth";
import { getSongQueueStoreOptions } from "./songQueueConfig";
import type { SongQueueSession } from "../lib/songQueue/types";

export function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

export function ownerTokenFromRequest(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

export async function loadSessionForOwner(
  request: Request,
  sessionId: string,
): Promise<
  | { kind: "ok"; session: SongQueueSession }
  | { kind: "missing" }
  | { kind: "ended"; session: SongQueueSession }
  | { kind: "no-auth" }
> {
  const token = ownerTokenFromRequest(request);
  if (!token) return { kind: "no-auth" };
  const res = await readSessionWithToken(getSongQueueStoreOptions(), sessionId, token);
  if (res.kind === "ok") return { kind: "ok", session: res.session };
  if (res.kind === "ended") return { kind: "ended", session: res.session };
  return { kind: "missing" };
}

export type SongQueueChannelAuth =
  | { kind: "ok"; session: SongQueueSession }
  | { kind: "missing" }
  | { kind: "unauthenticated" }
  | { kind: "forbidden" };

/**
 * Authorize a streamer or verified Twitch moderator against the session's
 * own channel. Used when the caller does not hold the per-session ownerToken.
 */
export async function loadSessionForChannel(
  cookies: AstroCookies,
  sessionId: string,
): Promise<SongQueueChannelAuth> {
  const session = await getSession(getSongQueueStoreOptions(), sessionId);
  if (!session) return { kind: "missing" };
  const hasCredentials = Boolean(
    cookies.get("twitch_token")?.value ||
      cookies.get("twitch_refresh_token")?.value ||
      cookies.get("youtube_token")?.value ||
      cookies.get("youtube_refresh_token")?.value,
  );
  if (!hasCredentials) return { kind: "unauthenticated" };
  const auth = await authorizeChannel(
    cookies,
    {
      channelName: session.channelName,
      channelPlatform: session.channelPlatform,
    },
    { allowModerators: true },
  );
  if (auth === "unauthenticated") return { kind: "unauthenticated" };
  if (auth !== "ok") return { kind: "forbidden" };
  return { kind: "ok", session };
}

export type SongQueueMutationAccess<T> =
  | { ok: true; result: T; session: SongQueueSession }
  | {
      ok: false;
      reason: "missing" | "ended" | "auth" | "unauthenticated" | "forbidden";
    };

/**
 * Mutate a song queue with either the owner token or channel trust.
 * Channel trust allows the broadcaster and, when enabled, Twitch moderators.
 */
export async function mutateSessionWithAccess<T>(
  request: Request,
  cookies: AstroCookies,
  sessionId: string,
  fn: (
    session: SongQueueSession,
  ) =>
    | { session: SongQueueSession; result: T }
    | Promise<{ session: SongQueueSession; result: T }>,
): Promise<SongQueueMutationAccess<T>> {
  const token = ownerTokenFromRequest(request);
  if (token) {
    const res = await mutateSession(
      getSongQueueStoreOptions(),
      sessionId,
      token,
      fn,
    );
    if (res.ok) return res;
    return { ok: false, reason: res.reason };
  }

  const auth = await loadSessionForChannel(cookies, sessionId);
  if (auth.kind !== "ok") {
    return {
      ok: false,
      reason:
        auth.kind === "missing"
          ? "missing"
          : auth.kind === "unauthenticated"
            ? "unauthenticated"
            : "forbidden",
    };
  }
  return mutateSessionByChannel(
    getSongQueueStoreOptions(),
    sessionId,
    {
      channelName: auth.session.channelName,
      channelPlatform: auth.session.channelPlatform,
    },
    fn,
  );
}

export type SongQueueReadAccess =
  | { kind: "ok"; session: SongQueueSession }
  | { kind: "ended"; session: SongQueueSession }
  | { kind: "missing" }
  | { kind: "unauthenticated" }
  | { kind: "forbidden" };

/** Read a song queue with either the owner token or channel trust. */
export async function readSessionWithAccess(
  request: Request,
  cookies: AstroCookies,
  sessionId: string,
): Promise<SongQueueReadAccess> {
  const token = ownerTokenFromRequest(request);
  if (token) {
    const res = await readSessionWithToken(
      getSongQueueStoreOptions(),
      sessionId,
      token,
    );
    if (res.kind === "ok" || res.kind === "ended") {
      return { kind: res.kind, session: res.session };
    }
    return { kind: "missing" };
  }
  const auth = await loadSessionForChannel(cookies, sessionId);
  if (auth.kind !== "ok") {
    return {
      kind:
        auth.kind === "missing"
          ? "missing"
          : auth.kind === "unauthenticated"
            ? "unauthenticated"
            : "forbidden",
    };
  }
  return {
    kind: auth.session.ended ? "ended" : "ok",
    session: auth.session,
  };
}

export function clientAddress(request: Request): string {
  // Use the rightmost X-Forwarded-For IP: the proxy closest to the origin.
  // The leftmost is client-controlled unless the edge strips incoming XFF.
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const ips = forwarded.split(",");
    const last = ips[ips.length - 1]?.trim();
    if (last) return last;
  }
  return request.headers.get("x-real-ip") || "unknown";
}
