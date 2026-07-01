/**
 * Shared helpers for Song Queue API routes.
 */
import { readSessionWithToken } from "./songQueueStore";
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

export function clientAddress(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
