import type { APIRoute } from "astro";
import { randomBytes, createHash } from "node:crypto";
import { IS_DESKTOP } from "../../../../lib/constants";

function base64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Issue a PKCE challenge for the desktop Google/YouTube flow. The verifier is
 * stored in an httpOnly cookie and is echoed back on the OAuth callback.
 * Desktop builds use a public "Desktop app" OAuth client (no secret).
 */
export const POST: APIRoute = async ({ cookies }) => {
  if (!IS_DESKTOP) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const verifier = base64url(randomBytes(32));
  const codeChallenge = base64url(
    createHash("sha256").update(verifier).digest(),
  );
  const isSecure = import.meta.env.MODE !== "development";
  cookies.set("google_code_verifier", verifier, {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    maxAge: 10 * 60,
    path: "/",
  });

  return new Response(JSON.stringify({ codeChallenge }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
};
