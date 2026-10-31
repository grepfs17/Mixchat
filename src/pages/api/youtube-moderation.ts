import type { APIRoute } from "astro";
import { checkRateLimit } from "../../lib/rateLimit";
import { googleFetch } from "../../lib/google";
import {
  resolveActiveLiveChatId,
  resolveLiveChatMessageId,
  invalidateLiveChatId,
} from "../../lib/youtubeLiveChat";
import { runAsModerationAction } from "../../lib/youtube";
import { getAutomodTarget } from "./youtube-stream-chat";
import { IS_TWITCH_ONLY, twitchOnlyResponse } from "../../lib/constants";
import {
  getYouTubeAuthIdentity,
  getYouTubeSessionKey,
} from "../../server/youtubeAuth";

interface ModerationBody {
  action?: "delete" | "ban" | "timeout" | "automod";
  videoId?: string;
  messageId?: string;
  channelId?: string;
  durationSeconds?: number;
  /** For delete: text of the message, used to resolve the official Data API id. */
  text?: string;
  /** For delete: render timestamp (ms) used to disambiguate matches. */
  publishedAtMs?: number;
  /** For automod: "approve" or "deny". */
  decision?: "approve" | "deny";
}

const MIN_TIMEOUT_SECONDS = 1;
const MAX_TIMEOUT_SECONDS = 86400;

function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

function mapGoogleError(err: unknown): {
  status: number;
  message: string;
  invalidateChat?: boolean;
} {
  const status = (err as any)?.status ?? 500;
  const apiMessage: string | undefined = (err as any)?.body?.error?.message;

  if (status === 401) {
    return { status, message: "Not authenticated" };
  }
  if (status === 403) {
    if (
      apiMessage &&
      (apiMessage.includes("modificationNotAllowed") ||
        apiMessage.toLowerCase().includes("moderator"))
    ) {
      return {
        status,
        message: "Can't remove a moderator or the owner's message",
      };
    }
    return { status, message: "No permission to perform this action" };
  }
  if (status === 404) {
    if (apiMessage && apiMessage.toLowerCase().includes("modificationnotallowed")) {
      return {
        status,
        message: "Can't remove a moderator or the owner's message",
      };
    }
    return { status, message: "Message or chat not found", invalidateChat: true };
  }
  if (status === 400) {
    if (apiMessage && apiMessage.toLowerCase().includes("invalidlivechatid")) {
      return {
        status,
        message: "Live chat is no longer active",
        invalidateChat: true,
      };
    }
    return { status, message: apiMessage || "Invalid request" };
  }
  return { status, message: apiMessage || `YouTube API error: ${status}` };
}

export const POST: APIRoute = async ({ request, cookies }) => {
  if (IS_TWITCH_ONLY) return twitchOnlyResponse();

  const clientAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  if (!checkRateLimit(`${clientAddress}:youtube-moderation`, 30, 60_000)) {
    return jsonResponse(
      { error: "Too many requests" },
      429,
      { "Retry-After": "60" },
    );
  }

  try {
    const body = (await request.json()) as ModerationBody;
    const {
      action,
      videoId,
      messageId,
      channelId,
      durationSeconds,
      text,
      publishedAtMs,
      decision,
    } = body;

    if (!action || !["delete", "ban", "timeout", "automod"].includes(action)) {
      return jsonResponse(
        { error: "action must be 'delete', 'ban', 'timeout' or 'automod'" },
        400,
      );
    }
    if (!videoId || typeof videoId !== "string") {
      return jsonResponse({ error: "videoId is required" }, 400);
    }

    if (action === "automod") {
      if (!messageId || typeof messageId !== "string") {
        return jsonResponse(
          { error: "messageId is required for automod" },
          400,
        );
      }
      if (!decision || !["approve", "deny"].includes(decision)) {
        return jsonResponse(
          { error: "decision must be 'approve' or 'deny'" },
          400,
        );
      }

      // Resolve the same viewer-scoped session that received the hold.
      const auth = getYouTubeAuthIdentity(cookies);
      const sessionKey = getYouTubeSessionKey(videoId, auth.authKey);
      const target = getAutomodTarget(sessionKey, messageId);
      if (!target) {
        return jsonResponse(
          {
            error:
              "Auto-mod message not found. It may have already been handled, or the chat session is not connected.",
          },
          404,
        );
      }

      const automodItem = target.item;

      const buttons: any[] = Array.isArray(automodItem.moderation_buttons)
        ? automodItem.moderation_buttons
        : [];
      const targetText = decision === "approve" ? "Approve" : "Deny";
      const button = buttons.find(
        (b: any) =>
          (typeof b.text === "string" &&
            b.text.toLowerCase().includes(targetText.toLowerCase())) ||
          (typeof b.label === "string" &&
            b.label.toLowerCase().includes(targetText.toLowerCase())),
      );
      if (!button || !button.endpoint) {
        return jsonResponse(
          { error: "Could not find moderation button on this message" },
          400,
        );
      }

      try {
        // NavigationEndpoint.call resolves the button's command and executes it
        // through the viewer's live-chat session. Passing the endpoint object
        // to actions.execute() would build an invalid request URL.
        await runAsModerationAction(() =>
          button.endpoint.call(target.yt.actions, { parse: true }),
        );
        return jsonResponse({ success: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[youtube-moderation] automod action failed:", msg);
        return jsonResponse(
          { error: `Failed to ${decision} message: ${msg}` },
          500,
        );
      }
    }

    if (action === "delete") {
      if (!messageId || typeof messageId !== "string") {
        return jsonResponse(
          { error: "messageId is required for delete" },
          400,
        );
      }
    } else {
      if (!channelId || typeof channelId !== "string") {
        return jsonResponse(
          { error: "channelId is required for ban/timeout" },
          400,
        );
      }
      if (action === "timeout") {
        if (
          typeof durationSeconds !== "number" ||
          !Number.isFinite(durationSeconds) ||
          durationSeconds < MIN_TIMEOUT_SECONDS ||
          durationSeconds > MAX_TIMEOUT_SECONDS
        ) {
          return jsonResponse(
            {
              error: `durationSeconds must be between ${MIN_TIMEOUT_SECONDS} and ${MAX_TIMEOUT_SECONDS}`,
            },
            400,
          );
        }
      }
    }

    const accessToken = cookies.get("youtube_token")?.value;
    if (!accessToken) {
      return jsonResponse({ error: "Not authenticated" }, 401);
    }

    if (action === "delete") {
      // The id rendered by youtubei.js (InnerTube) is NOT the same as the
      // official Data API liveChatMessage id, so we resolve the official id by
      // matching author channel + text before deleting. Fall back to the raw
      // id for streams where they happen to coincide.
      let idToDelete = messageId!;
      if (channelId || (text && text.length)) {
        try {
          const resolved = await resolveLiveChatMessageId(videoId, accessToken, {
            channelId,
            text,
            publishedAtMs,
          });
          if (resolved) idToDelete = resolved;
        } catch (err) {
          console.warn(
            "[youtube-moderation] Failed to resolve official message id:",
            err instanceof Error ? err.message : String(err),
          );
        }
      }

      try {
        await googleFetch(
          `https://www.googleapis.com/youtube/v3/liveChat/messages?id=${encodeURIComponent(idToDelete)}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
          },
          {
            action: "liveChatMessages.delete",
            videoId,
            messageId: idToDelete,
          },
        );
      } catch (err) {
        const mapped = mapGoogleError(err);
        if (mapped.invalidateChat) invalidateLiveChatId(videoId);
        return jsonResponse(
          { error: mapped.message },
          mapped.status,
        );
      }
      return jsonResponse({ success: true });
    }

    const liveChatId = await resolveActiveLiveChatId(videoId, accessToken);
    if (!liveChatId) {
      return jsonResponse(
        { error: "This video does not have an active live chat" },
        400,
      );
    }

    const snippet: Record<string, unknown> = {
      liveChatId,
      type: action === "timeout" ? "temporary" : "permanent",
      bannedUserDetails: { channelId },
    };
    if (action === "timeout") {
      snippet.banDurationSeconds = durationSeconds;
    }

    try {
      await googleFetch(
        "https://www.googleapis.com/youtube/v3/liveChat/bans?part=snippet",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ snippet }),
        },
        {
          action: "liveChatBans.insert",
          videoId,
          liveChatId,
          type: snippet.type,
        },
      );
    } catch (err) {
      const mapped = mapGoogleError(err);
      if (mapped.invalidateChat) invalidateLiveChatId(videoId);
      return jsonResponse({ error: mapped.message }, mapped.status);
    }

    return jsonResponse({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("youtube-moderation API error:", {
      message: errorMessage,
      stack: errorStack,
    });
    return jsonResponse(
      {
        error: errorMessage,
        details:
          import.meta.env.MODE === "development" ? errorStack : undefined,
      },
      500,
    );
  }
};
