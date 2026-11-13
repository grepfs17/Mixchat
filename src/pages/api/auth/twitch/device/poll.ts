import type { APIRoute } from "astro";
import { pollTwitchDeviceToken, getTwitchUser } from "../../../../../lib/twitch";
import {
  IS_DESKTOP,
  TWITCH_SCOPES,
} from "../../../../../lib/constants";
import { isSecureRequest } from "../../../../../lib/secureRequest";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

/** Poll the Twitch Device Code Grant flow (desktop/public-client only). */
export const GET: APIRoute = async ({ request, cookies }) => {
  if (!IS_DESKTOP) return json({ error: "Not found" }, 404);

  const clientId = import.meta.env.PUBLIC_TWITCH_CLIENT_ID;
  if (!clientId) return json({ error: "Server configuration error" }, 500);

  const deviceCode = cookies.get("twitch_device_code")?.value;
  if (!deviceCode) return json({ status: "expired" }, 400);

  const result = await pollTwitchDeviceToken(
    clientId,
    deviceCode,
    TWITCH_SCOPES,
  );

  if (result.status === "success") {
    try {
      const user = await getTwitchUser(result.accessToken, clientId);
      const isSecure = isSecureRequest(request);
      cookies.delete("twitch_device_code", { path: "/" });
      cookies.set("twitch_token", result.accessToken, {
        httpOnly: true,
        secure: isSecure,
        sameSite: "lax",
        maxAge: result.expiresIn || 3600,
        path: "/",
      });
      if (result.refreshToken) {
        cookies.set("twitch_refresh_token", result.refreshToken, {
          httpOnly: true,
          secure: isSecure,
          sameSite: "strict",
          maxAge: 60 * 60 * 24 * 30,
          path: "/",
        });
      }
      return json({
        status: "success",
        session: {
          platform: "twitch",
          userId: user.userId,
          displayName: user.displayName,
          username: user.login,
          profileImageUrl: user.profileImageUrl,
          broadcasterType: user.broadcasterType,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken ?? "",
          expiresAt: Date.now() + (result.expiresIn ?? 3600) * 1000,
          timestamp: Date.now(),
        },
      });
    } catch (err) {
      console.error("Twitch device user fetch failed:", err);
      cookies.delete("twitch_device_code", { path: "/" });
      return json({ status: "error", message: "Failed to fetch user" }, 502);
    }
  }

  if (result.status === "pending" || result.status === "slow_down") {
    return json({ status: result.status });
  }

  // expired | denied | error. Consume the code so it can't be retried.
  cookies.delete("twitch_device_code", { path: "/" });
  return json(
    {
      status: result.status,
      message: result.status === "error" ? result.message : result.status,
    },
    400,
  );
};
