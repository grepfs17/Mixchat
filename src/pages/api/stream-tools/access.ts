import type { APIRoute } from "astro";
import { parseChannelKey } from "../../../lib/wheel/api";
import { checkRateLimit } from "../../../lib/rateLimit";
import { authorizeChannel } from "../../../server/wheelAuth";
import { clientAddress, json } from "../../../server/wheelApi";

/**
 * Reports whether the caller is the broadcaster, an approved moderator, or
 * neither, for the claimed channel. The channel itself is only a claim; both
 * answers come from `authorizeChannel`.
 */
export const GET: APIRoute = async ({ request, cookies }) => {
  if (
    !checkRateLimit(
      `${clientAddress(request)}:stream-tools-access`,
      120,
      60_000,
    )
  ) {
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }
  const channel = parseChannelKey(
    new URL(request.url).searchParams.get("channelKey"),
  );
  if (!channel) return json({ error: "Missing channel" }, 400);

  const owner = await authorizeChannel(cookies, channel);
  if (owner === "ok") return json({ role: "owner" });
  if (owner === "unauthenticated") {
    return json({ error: "Not authenticated" }, 401);
  }

  const moderator = await authorizeChannel(cookies, channel, {
    allowModerators: true,
  });
  return json({ role: moderator === "ok" ? "moderator" : "none" });
};
