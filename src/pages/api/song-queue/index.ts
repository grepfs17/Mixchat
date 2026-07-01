import type { APIRoute } from "astro";
import { createSession } from "../../../server/songQueueStore";
import { getSongQueueStoreOptions } from "../../../server/songQueueConfig";

interface CreateBody {
  title?: string;
  isPublic?: boolean;
  channelName?: string;
  channelPlatform?: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isCreateBody(value: unknown): value is CreateBody {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.title !== undefined && typeof v.title !== "string") return false;
  if (v.isPublic !== undefined && typeof v.isPublic !== "boolean") return false;
  if (v.channelName !== undefined && typeof v.channelName !== "string") return false;
  if (v.channelPlatform !== undefined && typeof v.channelPlatform !== "string") return false;
  return true;
}

export const POST: APIRoute = async ({ request }) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  if (!isCreateBody(body)) {
    return jsonResponse({ error: "Invalid body" }, 400);
  }
  const title = body.title?.trim() || "";
  if (title.length > 200) {
    return jsonResponse({ error: "Title too long" }, 400);
  }
  const bootstrap = await createSession(getSongQueueStoreOptions(), {
    title: title || undefined,
    isPublic: Boolean(body.isPublic),
    channelName: body.channelName?.trim() || undefined,
    channelPlatform: body.channelPlatform?.trim() || undefined,
  });
  return jsonResponse(bootstrap, 201);
};
