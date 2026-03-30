import type { APIRoute } from "astro";
import { getTwitchUserById } from "../../lib/twitch";

export const GET: APIRoute = async ({ url, cookies }) => {
  const userId = url.searchParams.get("userId");

  if (!userId) {
    return new Response("User ID is required", { status: 400 });
  }

  // Read the access token from the httpOnly cookie — never from client input.
  const accessToken = cookies.get("twitch_token")?.value;
  if (!accessToken) {
    return new Response("Not authenticated", { status: 401 });
  }

  const clientId = import.meta.env.PUBLIC_TWITCH_CLIENT_ID;

  try {
    const user = await getTwitchUserById(accessToken, clientId, userId);

    if (!user) {
      return new Response("User not found", { status: 404 });
    }

    return new Response(JSON.stringify(user), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Failed to fetch user info:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};
