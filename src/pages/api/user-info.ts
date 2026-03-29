import type { APIRoute } from "astro";
import { getTwitchUserById } from "../../lib/twitch";

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  const authHeader = request.headers.get("Authorization");

  if (!userId) {
    return new Response("User ID is required", { status: 400 });
  }

  if (!authHeader) {
    return new Response("Authorization header is required", { status: 401 });
  }

  const accessToken = authHeader.replace("Bearer ", "");
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
