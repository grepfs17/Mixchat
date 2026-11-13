import type { APIRoute } from "astro";
import { refreshTwitchAccessToken } from "../../lib/twitch";
import { refreshYoutubeToken } from "../../lib/youtube";
import { checkRateLimit } from "../../lib/rateLimit";
import { isSecureRequest } from "../../lib/secureRequest";
import {
  IS_DESKTOP,
  IS_TWITCH_ONLY,
  twitchOnlyResponse,
} from "../../lib/constants";

export const POST: APIRoute = async ({ request, cookies }) => {
  const clientAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  if (!checkRateLimit(`${clientAddress}:refresh-token`, 10, 60_000)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "60" },
    });
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const isSecure = isSecureRequest(request);

    const body = await request.json().catch(() => ({}));
    const { platform } = body as { platform?: string };

    if (!platform) {
      return new Response(JSON.stringify({ error: "Platform required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let accessToken: string | undefined;
    let refreshTokenOut: string | undefined;
    let expiresIn: number | undefined;

    if (platform === "twitch") {
      const refreshToken = cookies.get("twitch_refresh_token")?.value;
      if (!refreshToken) {
        return new Response(
          JSON.stringify({ error: "No refresh token available" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }

      const clientId = import.meta.env.PUBLIC_TWITCH_CLIENT_ID;
      // Desktop public clients refresh without a secret.
      const clientSecret = IS_DESKTOP
        ? undefined
        : import.meta.env.TWITCH_CLIENT_SECRET;

      if (!clientId || (!IS_DESKTOP && !clientSecret)) {
        console.error("Missing Twitch credentials in environment");
        return new Response(
          JSON.stringify({ error: "Server configuration error" }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const tokenData = await refreshTwitchAccessToken(
        refreshToken,
        clientId,
        clientSecret,
      );
      accessToken = tokenData.accessToken;
      refreshTokenOut = tokenData.refreshToken;
      expiresIn = tokenData.expiresIn;

      if (accessToken) {
        cookies.set("twitch_token", accessToken, {
          httpOnly: true,
          secure: isSecure,
          sameSite: "lax",
          maxAge: expiresIn || 3600,
          path: "/",
        });
      }

      if (refreshTokenOut) {
        cookies.set("twitch_refresh_token", refreshTokenOut, {
          httpOnly: true,
          secure: isSecure,
          sameSite: "strict",
          maxAge: 365 * 24 * 60 * 60,
          path: "/",
        });
      }
    } else if (platform === "youtube") {
      if (IS_TWITCH_ONLY) return twitchOnlyResponse();

      const refreshToken = cookies.get("youtube_refresh_token")?.value;
      if (!refreshToken) {
        // 401 is expected when user hasn't logged in with YouTube yet
        return new Response(
          JSON.stringify({ error: "No refresh token available" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }

      const clientId = import.meta.env.PUBLIC_YOUTUBE_CLIENT_ID;
      // Google requires the client secret for desktop clients too.
      const clientSecret = import.meta.env.YOUTUBE_CLIENT_SECRET || undefined;

      if (!clientId || !clientSecret) {
        console.error("Missing YouTube credentials in environment");
        return new Response(
          JSON.stringify({ error: "Server configuration error" }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const tokenData = await refreshYoutubeToken(
        refreshToken,
        clientId,
        clientSecret,
      );
      accessToken = tokenData.access_token;
      refreshTokenOut = tokenData.refresh_token;
      expiresIn = tokenData.expires_in;

      if (accessToken) {
        cookies.set("youtube_token", accessToken, {
          httpOnly: true,
          secure: isSecure,
          sameSite: "lax",
          maxAge: expiresIn || 3600,
          path: "/",
        });
      }

      if (refreshTokenOut) {
        cookies.set("youtube_refresh_token", refreshTokenOut, {
          httpOnly: true,
          secure: isSecure,
          sameSite: "strict",
          maxAge: 365 * 24 * 60 * 60,
          path: "/",
        });
      }
    } else {
      return new Response(JSON.stringify({ error: "Unsupported platform" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log("Token refreshed successfully", {
      platform,
      expiresIn,
      timestamp: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({
        accessToken,
        // refreshToken is intentionally omitted. It lives only in the
        // httpOnly cookie and must not be exposed to JavaScript.
        expiresIn,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    let statusCode = 500;
    if (
      errorMessage.includes("401") ||
      errorMessage.includes("Invalid refresh token")
    ) {
      statusCode = 401;
    }

    // Log full details server-side. Return only a generic message to the client.
    console.error("Token refresh failed:", {
      error: errorMessage,
      timestamp: new Date().toISOString(),
      status: statusCode,
    });

    return new Response(
      JSON.stringify({
        error:
          statusCode === 401
            ? "Session expired. Please log in again."
            : "Token refresh failed. Please try again.",
      }),
      {
        status: statusCode,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
