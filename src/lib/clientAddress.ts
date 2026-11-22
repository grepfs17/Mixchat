/**
 * Resolve the client IP used as a rate-limit key.
 *
 * The rightmost X-Forwarded-For entry is the address appended by the proxy
 * closest to this server. Earlier entries are client-controlled unless the
 * edge strips incoming X-Forwarded-For, so they must not be trusted. Falls
 * back to X-Real-IP when no forwarded chain is present.
 */
export function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const ips = forwarded.split(",");
    const last = ips[ips.length - 1]?.trim();
    if (last) return last;
  }
  return request.headers.get("x-real-ip") || "unknown";
}
