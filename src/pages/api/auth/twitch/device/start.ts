import type { APIRoute } from "astro";
import { startTwitchDeviceAuth } from "../../../../../lib/twitch";
import {
  IS_DESKTOP,
  TWITCH_SCOPES,
} from "../../../../../lib/constants";
import { checkRateLimit } from "../../../../../lib/rateLimit";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

/**
 * Start the Twitch Device Code Grant flow (desktop/public-client only).
 * The device_code is kept server-side in an httpOnly cookie; only the
 * user-facing code and verification URL are returned to the client.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!IS_DESKTOP) return json({ error: "Not found" }, 404);

  const clientAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  if (!checkRateLimit(`${clientAddress}:twitch-device-start`, 10, 60_000)) {
    return json({ error: "Too many requests" }, 429);
  }

  const clientId = import.meta.env.PUBLIC_TWITCH_CLIENT_ID;
  if (!clientId) return json({ error: "Server configuration error" }, 500);

  try {
    const auth = await startTwitchDeviceAuth(clientId, TWITCH_SCOPES);
    const isSecure = import.meta.env.MODE !== "development";
    cookies.set("twitch_device_code", auth.deviceCode, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      maxAge: auth.expiresIn,
      path: "/",
    });
    return json({
      userCode: auth.userCode,
      verificationUri: auth.verificationUri,
      expiresIn: auth.expiresIn,
      interval: auth.interval,
    });
  } catch (err) {
    console.error("Twitch device start failed:", err);
    return json({ error: "Failed to start device authorization" }, 502);
  }
};
