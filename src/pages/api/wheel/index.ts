import type { APIRoute } from "astro";
import {
  createWheel,
  listWheelsForChannel,
} from "../../../server/wheelStore";
import { getWheelStoreOptions } from "../../../server/wheelConfig";
import {
  channelFromRequest,
  clientAddress,
  json,
} from "../../../server/wheelApi";
import { checkRateLimit } from "../../../lib/rateLimit";
import { parseChannelKey } from "../../../lib/wheel/api";
import { authorizeChannel } from "../../../server/wheelAuth";
import {
  MAX_WHEEL_OPTIONS,
  MAX_WHEEL_OPTION_LENGTH,
} from "../../../lib/wheel/types";

interface CreateBody {
  name?: string;
  options?: string[];
  channelKey?: string;
  channelName?: string;
  channelPlatform?: string;
  allowDuplicates?: boolean;
}

function isCreateBody(value: unknown): value is CreateBody {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.name !== undefined && typeof v.name !== "string") return false;
  if (v.options !== undefined && !Array.isArray(v.options)) return false;
  if (v.channelKey !== undefined && typeof v.channelKey !== "string") return false;
  if (v.channelName !== undefined && typeof v.channelName !== "string") return false;
  if (v.channelPlatform !== undefined && typeof v.channelPlatform !== "string")
    return false;
  if (v.allowDuplicates !== undefined && typeof v.allowDuplicates !== "boolean")
    return false;
  return true;
}

/** List the wheels owned by a channel (requires verified channel ownership). */
export const GET: APIRoute = async ({ request, cookies }) => {
  if (!checkRateLimit(`${clientAddress(request)}:wheel-list`, 120, 60_000)) {
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }
  const channel = channelFromRequest(request);
  if (!channel) return json({ error: "Missing channel" }, 400);
  const auth = await authorizeChannel(cookies, channel, { allowModerators: true });
  if (auth !== "ok") {
    return json(
      { error: auth === "unauthenticated" ? "Not authenticated" : "Forbidden" },
      auth === "unauthenticated" ? 401 : 403,
    );
  }
  const wheels = await listWheelsForChannel(
    getWheelStoreOptions(),
    channel.channelName,
    channel.channelPlatform,
  );
  return json({ wheels });
};

/** Create a wheel for a channel (requires verified channel ownership). */
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!checkRateLimit(`${clientAddress(request)}:wheel-create`, 10, 60_000)) {
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!isCreateBody(body)) return json({ error: "Invalid body" }, 400);
  if (
    Array.isArray(body.options) &&
    body.options.length > MAX_WHEEL_OPTIONS
  ) {
    return json({ error: "Too many options" }, 400);
  }
  if (
    Array.isArray(body.options) &&
    body.options.some(
      (o) => typeof o === "string" && o.length > MAX_WHEEL_OPTION_LENGTH,
    )
  ) {
    return json({ error: "Option too long" }, 400);
  }

  const channel =
    body.channelName && body.channelPlatform
      ? {
          channelName: body.channelName,
          channelPlatform: body.channelPlatform,
        }
      : (parseChannelKey(body.channelKey ?? null) ?? channelFromRequest(request));
  if (!channel) return json({ error: "Missing channel" }, 400);
  const auth = await authorizeChannel(cookies, channel, { allowModerators: true });
  if (auth !== "ok") {
    return json(
      { error: auth === "unauthenticated" ? "Not authenticated" : "Forbidden" },
      auth === "unauthenticated" ? 401 : 403,
    );
  }

  const bootstrap = await createWheel(getWheelStoreOptions(), {
    name: body.name,
    options: body.options,
    allowDuplicates: Boolean(body.allowDuplicates),
    channelName: channel.channelName,
    channelPlatform: channel.channelPlatform,
  });
  return json(bootstrap, 201);
};
