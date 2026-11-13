/**
 * Whether auth cookies for this request should carry the Secure flag.
 * Keyed on the real scheme (honoring x-forwarded-proto) instead of the build
 * mode: WebKitGTK rejects Secure cookies on plain http://localhost, which
 * otherwise breaks the desktop device-code login on Linux.
 */
export function isSecureRequest(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0].trim() === "https";
  return new URL(request.url).protocol === "https:";
}
