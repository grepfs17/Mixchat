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
