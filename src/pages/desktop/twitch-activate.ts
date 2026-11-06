import type { APIRoute } from "astro";
import { IS_DESKTOP } from "../../lib/constants";

const ALLOWED_HOST_RE = /(^|\.)twitch\.tv$/;

/**
 * Local hop in front of Twitch's device activation page.
 *
 * The app opens `/desktop/twitch-activate?url=...` instead of twitch.tv so the
 * desktop shell can promote the navigation to a child webview that shares the
 * WebView2 profile. That login then also stores the Twitch cookies the embedded
 * player needs. When the shell does not intercept it, this handler redirects,
 * so the flow still works.
 *
 * Only Twitch activation URLs are accepted, so it cannot be used as a general
 * redirector.
 */
export const GET: APIRoute = async ({ url, request }) => {
  if (!IS_DESKTOP) {
    return new Response("Not Found", { status: 404 });
  }

  const raw = url.searchParams.get("url");
  if (!raw) {
    return new Response("Missing url parameter", { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw, request.url);
  } catch {
    return new Response("Invalid url parameter", { status: 400 });
  }

  if (target.protocol !== "https:" || !ALLOWED_HOST_RE.test(target.hostname)) {
    return new Response("Only https://twitch.tv URLs are allowed", {
      status: 403,
    });
  }

  return new Response(null, {
    status: 302,
    headers: { Location: target.toString() },
  });
};
