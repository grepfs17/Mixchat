import type { APIRoute } from "astro";
import {
  deleteWheel,
  deleteWheelByChannel,
  mutateWheel,
  mutateWheelByChannel,
  publicWheelView,
  readReadableWheel,
  readWheelByChannel,
  type WheelStoreOptions,
} from "../../../server/wheelStore";
import { getWheelStoreOptions } from "../../../server/wheelConfig";
import {
  channelFromRequest,
  clientAddress,
  json,
  ownerTokenFromRequest,
} from "../../../server/wheelApi";
import { checkRateLimit } from "../../../lib/rateLimit";
import { authorizeChannel } from "../../../server/wheelAuth";
import {
  MAX_WHEEL_NAME_LENGTH,
  MAX_WHEEL_OPTIONS,
  MAX_WHEEL_OPTION_LENGTH,
  sanitizeWheelOptions,
  type WheelPublicView,
  type WheelRecord,
} from "../../../lib/wheel/types";

interface WheelPatch {
  name?: string;
  options?: string[];
  isPublic?: boolean;
}

function parsePatch(value: unknown): WheelPatch | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const patch: WheelPatch = {};
  if (v.name !== undefined) {
    if (typeof v.name !== "string" || v.name.length > MAX_WHEEL_NAME_LENGTH)
      return null;
    patch.name = v.name.trim();
  }
  if (v.options !== undefined) {
    if (!Array.isArray(v.options) || v.options.length > MAX_WHEEL_OPTIONS)
      return null;
    if (
      v.options.some(
        (o) => typeof o !== "string" || o.length > MAX_WHEEL_OPTION_LENGTH,
      )
    ) {
      return null;
    }
    patch.options = sanitizeWheelOptions(v.options);
  }
  if (v.isPublic !== undefined) {
    if (typeof v.isPublic !== "boolean") return null;
    patch.isPublic = v.isPublic;
  }
  if (Object.keys(patch).length === 0) return null;
  return patch;
}

function applyPatch(wheel: WheelRecord, patch: WheelPatch): WheelRecord {
  const next: WheelRecord = { ...wheel };
  if (patch.name !== undefined) next.name = patch.name || "Untitled wheel";
  if (patch.options !== undefined) next.options = patch.options;
  if (patch.isPublic !== undefined) next.isPublic = patch.isPublic;
  return next;
}

export const GET: APIRoute = async ({ request, params, cookies }) => {
  if (!checkRateLimit(`${clientAddress(request)}:wheel-read`, 120, 60_000)) {
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }
  const wheelId = params.wheelId || "";
  const token = ownerTokenFromRequest(request);
  const channel = channelFromRequest(request);
  const opts: WheelStoreOptions = getWheelStoreOptions();

  // Public wheels and token-authorized owners are readable directly.
  const direct = await readReadableWheel(opts, wheelId, token);
  if (direct) return json({ wheel: direct });

  // Channel trust requires a server-verified identity that matches the channel.
  if (channel) {
    const auth = await authorizeChannel(cookies, channel);
    if (auth === "ok") {
      const byChannel = await readWheelByChannel(opts, wheelId, channel);
      if (byChannel) return json({ wheel: byChannel });
    }
  }
  return json({ error: "Not found" }, 404);
};

export const PATCH: APIRoute = async ({ request, params, cookies }) => {
  if (!checkRateLimit(`${clientAddress(request)}:wheel-update`, 60, 60_000)) {
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }
  const wheelId = params.wheelId || "";
  const token = ownerTokenFromRequest(request);
  const channel = channelFromRequest(request);
  if (!token && !channel) return json({ error: "Missing credentials" }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const patch = parsePatch(body);
  if (!patch) return json({ error: "Invalid body" }, 400);

  const opts: WheelStoreOptions = getWheelStoreOptions();
  const mutator = (wheel: WheelRecord) => {
    const updated = applyPatch(wheel, patch);
    return { wheel: updated, result: publicWheelView(updated) as WheelPublicView };
  };

  // Owner token first; if it doesn't authorize, fall back to channel trust.
  if (token) {
    const res = await mutateWheel(opts, wheelId, token, mutator);
    if (res.ok) return json({ wheel: publicWheelView(res.wheel) });
    if (!channel) {
      return res.reason === "auth"
        ? json({ error: "Forbidden" }, 403)
        : json({ error: "Not found" }, 404);
    }
  }

  const auth = await authorizeChannel(cookies, channel!);
  if (auth === "unauthenticated")
    return json({ error: "Not authenticated" }, 401);
  if (auth !== "ok") return json({ error: "Forbidden" }, 403);
  const res = await mutateWheelByChannel(opts, wheelId, channel!, mutator);
  if (res.ok) return json({ wheel: publicWheelView(res.wheel) });
  if (res.reason === "auth") return json({ error: "Forbidden" }, 403);
  return json({ error: "Not found" }, 404);
};

const deleteHandler: APIRoute = async ({ request, params, cookies }) => {
  if (!checkRateLimit(`${clientAddress(request)}:wheel-delete`, 30, 60_000)) {
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }
  const wheelId = params.wheelId || "";
  const token = ownerTokenFromRequest(request);
  const channel = channelFromRequest(request);
  if (!token && !channel) return json({ error: "Missing credentials" }, 401);

  const opts: WheelStoreOptions = getWheelStoreOptions();

  if (token) {
    const result = await deleteWheel(opts, wheelId, token);
    if (result === "ok") return json({ ok: true });
    if (!channel) {
      return result === "auth"
        ? json({ error: "Forbidden" }, 403)
        : json({ error: "Not found" }, 404);
    }
  }

  const auth = await authorizeChannel(cookies, channel!);
  if (auth === "unauthenticated")
    return json({ error: "Not authenticated" }, 401);
  if (auth !== "ok") return json({ error: "Forbidden" }, 403);
  const result = await deleteWheelByChannel(opts, wheelId, channel!);
  if (result === "ok") return json({ ok: true });
  if (result === "auth") return json({ error: "Forbidden" }, 403);
  return json({ error: "Not found" }, 404);
};

export const DELETE: APIRoute = deleteHandler;

/** POST fallback — accepts X-HTTP-Method-Override: DELETE for proxies that
 *  block the DELETE verb. */
export const POST: APIRoute = async (ctx) => {
  if (
    ctx.request.headers.get("x-http-method-override")?.toUpperCase() !== "DELETE"
  ) {
    return json({ error: "Use X-HTTP-Method-Override: DELETE" }, 400);
  }
  return deleteHandler(ctx);
};
