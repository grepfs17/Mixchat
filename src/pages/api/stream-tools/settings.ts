import type { APIRoute } from "astro";
import { parseChannelKey } from "../../../lib/wheel/api";
import { checkRateLimit } from "../../../lib/rateLimit";
import { authorizeChannel } from "../../../server/wheelAuth";
import { clientAddress, json } from "../../../server/wheelApi";
import { getStreamToolsStoreOptions } from "../../../server/streamToolsConfig";
import {
  getStreamToolsSettings,
  updateStreamToolsSettings,
} from "../../../server/streamToolsSettings";

interface SettingsBody {
  channelKey?: string;
  enabled?: boolean;
  allowMods?: boolean;
}

function parseBody(value: unknown): SettingsBody | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (body.channelKey !== undefined && typeof body.channelKey !== "string")
    return null;
  if (body.enabled !== undefined && typeof body.enabled !== "boolean")
    return null;
  if (body.allowMods !== undefined && typeof body.allowMods !== "boolean")
    return null;
  return body as SettingsBody;
}

export const GET: APIRoute = async ({ request }) => {
  if (
    !checkRateLimit(
      `${clientAddress(request)}:stream-tools-settings-read`,
      120,
      60_000,
    )
  ) {
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }
  const channelKey = new URL(request.url).searchParams.get("channelKey");
  const channel = parseChannelKey(channelKey);
  if (!channel) return json({ error: "Missing channel" }, 400);
  const settings = await getStreamToolsSettings(
    getStreamToolsStoreOptions(),
    `${channel.channelPlatform}:${channel.channelName.toLowerCase()}`,
  );
  return json(settings);
};

export const PUT: APIRoute = async ({ request, cookies }) => {
  if (
    !checkRateLimit(
      `${clientAddress(request)}:stream-tools-settings-write`,
      30,
      60_000,
    )
  ) {
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const body = parseBody(raw);
  if (!body) return json({ error: "Invalid body" }, 400);
  const channelKey =
    body.channelKey ?? new URL(request.url).searchParams.get("channelKey");
  const channel = parseChannelKey(channelKey);
  if (!channel) return json({ error: "Missing channel" }, 400);
  if (body.enabled === undefined && body.allowMods === undefined) {
    return json({ error: "Nothing to update" }, 400);
  }

  const auth = await authorizeChannel(cookies, channel);
  if (auth === "unauthenticated")
    return json({ error: "Not authenticated" }, 401);
  if (auth !== "ok") return json({ error: "Forbidden" }, 403);

  const settings = await updateStreamToolsSettings(
    getStreamToolsStoreOptions(),
    `${channel.channelPlatform}:${channel.channelName.toLowerCase()}`,
    { enabled: body.enabled, allowMods: body.allowMods },
  );
  return json(settings);
};
