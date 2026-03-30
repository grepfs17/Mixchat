/**
 * Simple in-memory sliding-window rate limiter.
 *
 * Keyed by any string (typically `${clientAddress}:${endpointName}`). Counters
 * live in a module-level Map and persist for the lifetime of the server process.
 * For multi-process or serverless deployments replace this with a Redis-backed
 * implementation.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

/**
 * Returns `true` if the request is within the allowed rate, `false` if it
 * should be blocked with HTTP 429.
 *
 * @param key      - Unique key (e.g. `"1.2.3.4:refresh-token"`)
 * @param limit    - Maximum number of requests allowed per window
 * @param windowMs - Window duration in milliseconds
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= limit) {
    return false;
  }

  entry.count += 1;
  return true;
}

/** Purge expired entries every 60 s to prevent unbounded memory growth. */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 60_000);
