import type { APIRoute } from "astro";
import { spawn } from "node:child_process";
import { IS_DESKTOP } from "../../../lib/constants";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Open a URL in the user's system browser from the desktop shell.
 *
 * The Tauri webview loads the local Mixchat server, so the page can use this
 * same-origin endpoint instead of navigating. That keeps OAuth out of the
 * webview and avoids the reload caused by window.location on WebView2.
 */
export const POST: APIRoute = async ({ request }) => {
  if (!IS_DESKTOP) return json({ error: "Not found" }, 404);

  const body = (await request.json().catch(() => ({}))) as {
    url?: unknown;
  };
  if (typeof body.url !== "string" || body.url.length > 4096) {
    return json({ error: "Invalid URL" }, 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(body.url);
  } catch {
    return json({ error: "Invalid URL" }, 400);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return json({ error: "Only http(s) URLs are allowed" }, 400);
  }

  const command =
    process.platform === "win32"
      ? { file: "rundll32", args: ["url.dll,FileProtocolHandler", body.url] }
      : process.platform === "darwin"
        ? { file: "open", args: [body.url] }
        : { file: "xdg-open", args: [body.url] };

  try {
    const child = spawn(command.file, command.args, {
      detached: true,
      stdio: "ignore",
    });
    child.on("error", (error) => {
      console.error("[desktop/open] failed to launch browser", error);
    });
    child.unref();
  } catch (error) {
    console.error("[desktop/open] failed to spawn browser", error);
    return json({ error: "Could not open the system browser" }, 500);
  }

  return json({ ok: true });
};
