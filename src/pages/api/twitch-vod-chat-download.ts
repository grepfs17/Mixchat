import type { APIRoute } from "astro";
import { checkRateLimit } from "../../lib/rateLimit";
import {
  fetchVodChatPage,
  VodChatUpstreamError,
  type VodChatComment,
} from "../../server/twitchVodChat";

const PAGE_DELAY_MS = 150;
const MAX_META_LENGTH = 200;
const SAFE_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeColor(color: string | null | undefined): string {
  return color && SAFE_COLOR_RE.test(color) ? color : "#9146ff";
}

function formatOffset(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function formatTwitchTime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (hours > 0 || minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${rest}s`);
  return parts.join("");
}

function buildJsonComment(comment: VodChatComment) {
  return {
    ...comment,
    content: comment.fragments.map((fragment) => fragment.text).join(""),
  };
}

function buildHtmlMessage(
  comment: VodChatComment,
  videoId: string,
): string {
  const content = comment.fragments
    .map((fragment) => {
      if (!fragment.emote) return escapeHtml(fragment.text);
      const url = `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(
        fragment.emote.id,
      )}/default/dark/1.0`;
      return `<img class="emote" src="${url}" alt="${escapeHtml(
        fragment.text,
      )}" title="${escapeHtml(fragment.text)}" loading="lazy">`;
    })
    .join("");

  const twitchUrl = `https://www.twitch.tv/videos/${videoId}?t=${formatTwitchTime(
    comment.offsetSeconds,
  )}`;

  return `<div class="msg"><a class="time" href="${twitchUrl}" target="_blank" rel="noopener noreferrer" title="Open on Twitch at this time">${formatOffset(
    comment.offsetSeconds,
  )}</a><span class="author" style="color:${safeColor(
    comment.color,
  )}">${escapeHtml(comment.author)}</span><span class="text">${content}</span></div>\n`;
}

function buildHtmlHeader(title: string, channel: string, videoId: string): string {
  const safeTitle = escapeHtml(title || `Twitch VOD ${videoId}`);
  const safeChannel = escapeHtml(channel);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle} - Chat</title>
<style>
:root { color-scheme: dark; }
body { margin: 0; background: #0e0e10; color: #efeff1; font: 14px/1.45 Inter, system-ui, sans-serif; }
header { position: sticky; top: 0; background: #18181b; border-bottom: 1px solid #2f2f35; padding: 16px 20px; }
h1 { margin: 0 0 4px; font-size: 18px; }
.meta { color: #adadb8; font-size: 12px; }
main { padding: 8px 0 24px; }
.msg { display: flex; gap: 8px; align-items: baseline; padding: 3px 20px; }
.msg:nth-child(odd) { background: rgba(255, 255, 255, 0.025); }
.msg .time { flex: 0 0 auto; color: #adadb8; font-variant-numeric: tabular-nums; font-size: 12px; text-decoration: none; }
.msg .time:hover { color: #efeff1; text-decoration: underline; }
.author { flex: 0 0 auto; font-weight: 600; }
.text { min-width: 0; overflow-wrap: anywhere; }
.emote { height: 28px; vertical-align: middle; }
</style>
</head>
<body>
<header>
<h1>${safeTitle}</h1>
<div class="meta">${safeChannel ? `${safeChannel} · ` : ""}Twitch VOD ${escapeHtml(
    videoId,
  )}</div>
</header>
<main>
`;
}

const HTML_FOOTER = "</main>\n</body>\n</html>\n";

function buildJsonHeader(
  title: string,
  channel: string,
  videoId: string,
): string {
  return `{"video":{"id":${JSON.stringify(videoId)},"title":${JSON.stringify(
    title,
  )},"channel":${JSON.stringify(channel)}},"generatedAt":${JSON.stringify(
    new Date().toISOString(),
  )},"comments":[`;
}

export const GET: APIRoute = async ({ url, request }) => {
  const clientAddress =
    request.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ||
    "unknown";
  if (
    !checkRateLimit(
      `${clientAddress}:twitch-vod-chat-download`,
      10,
      10 * 60_000,
    )
  ) {
    return json({ error: "Too many requests" }, { status: 429 });
  }

  const videoId = url.searchParams.get("video_id")?.trim();
  if (!videoId || !/^\d+$/.test(videoId)) {
    return json({ error: "Valid video_id parameter required" }, { status: 400 });
  }

  const format = url.searchParams.get("format") === "html" ? "html" : "json";
  const title = (url.searchParams.get("title") ?? "").slice(0, MAX_META_LENGTH);
  const channel = (url.searchParams.get("channel") ?? "").slice(
    0,
    MAX_META_LENGTH,
  );

  let firstPage;
  try {
    firstPage = await fetchVodChatPage(videoId, { offset: 0 });
  } catch (error) {
    if (error instanceof VodChatUpstreamError) {
      return json({ error: error.message }, { status: error.status });
    }
    console.error("[twitch-vod-chat-download] failed:", error);
    return json({ error: "Failed to load VOD chat" }, { status: 502 });
  }

  const encoder = new TextEncoder();
  const extension = format === "html" ? "html" : "json";
  const filename = `vod-${videoId}-chat.${extension}`;
  const contentType =
    format === "html"
      ? "text/html; charset=utf-8"
      : "application/json; charset=utf-8";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (chunk: string) => controller.enqueue(encoder.encode(chunk));
      let firstComment = true;

      const writeComments = (comments: VodChatComment[]) => {
        for (const comment of comments) {
          if (format === "json") {
            write(`${firstComment ? "" : ","}${JSON.stringify(buildJsonComment(comment))}`);
          } else {
            write(buildHtmlMessage(comment, videoId));
          }
          firstComment = false;
        }
      };

      try {
        write(
          format === "json"
            ? buildJsonHeader(title, channel, videoId)
            : buildHtmlHeader(title, channel, videoId),
        );

        writeComments(firstPage.comments);
        let cursor = firstPage.cursor;
        let hasNext = firstPage.hasNextPage;

        while (hasNext && cursor) {
          await new Promise((resolve) => setTimeout(resolve, PAGE_DELAY_MS));
          const page = await fetchVodChatPage(videoId, { cursor });
          writeComments(page.comments);
          cursor = page.cursor;
          hasNext = page.hasNextPage;
        }

        write(format === "json" ? "\n]}\n" : HTML_FOOTER);
        controller.close();
      } catch (error) {
        console.error("[twitch-vod-chat-download] stream failed:", error);
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
};
