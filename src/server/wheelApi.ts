/**
 * Shared helpers for Wheel Spin API routes.
 */
import { parseChannelKey } from "../lib/wheel/api";
import type { WheelChannel } from "./wheelAuth";

export function json(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
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

/**
 * Resolves the channel trust target from a request. Prefers explicit
 * `channelName` + `channelPlatform` query params, falling back to a
 * `channelKey` of the form `platform:name`. The result is a claim only —
 * callers must verify it with `authorizeChannel`.
 */
export function channelFromRequest(request: Request): WheelChannel | null {
  const url = new URL(request.url);
  const name = url.searchParams.get("channelName")?.trim();
  const platform = url.searchParams.get("channelPlatform")?.trim();
  if (name && platform) {
    return { channelName: name, channelPlatform: platform };
  }
  const parsed = parseChannelKey(url.searchParams.get("channelKey"));
  if (parsed) return parsed;
  return null;
}

export function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const ips = forwarded.split(",");
    const last = ips[ips.length - 1]?.trim();
    if (last) return last;
  }
  return request.headers.get("x-real-ip") || "unknown";
}
