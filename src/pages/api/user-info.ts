import type { APIRoute } from "astro";
import { getTwitchUserById } from "../../lib/twitch";
import { checkRateLimit } from "../../lib/rateLimit";

export const GET: APIRoute = async ({ request, url, cookies }) => {
  const clientAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  if (!checkRateLimit(`${clientAddress}:user-info`, 300, 60_000)) {
    return new Response(
      JSON.stringify({ error: "Too many requests" }),
      { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "60" } },
    );
  }

  const userId = url.searchParams.get("userId");

  if (!userId || !userId.trim()) {
    return new Response(
      JSON.stringify({ error: "User ID is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Read the access token from the httpOnly cookie — never from client input.
  const accessToken = cookies.get("twitch_token")?.value;
  if (!accessToken) {
    return new Response(
      JSON.stringify({ error: "Not authenticated" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const clientId = import.meta.env.PUBLIC_TWITCH_CLIENT_ID;
  if (!clientId) {
    console.error("[user-info] PUBLIC_TWITCH_CLIENT_ID is not set");
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const user = await getTwitchUserById(accessToken, clientId, userId);

    if (!user) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify(user), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Failed to fetch user info:", error);
    return new Response(
      JSON.stringify({ error: "Internal Server Error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
