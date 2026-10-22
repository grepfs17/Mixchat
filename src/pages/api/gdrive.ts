import type { APIRoute } from "astro";
import { refreshYoutubeToken } from "../../lib/youtube";
import { checkRateLimit } from "../../lib/rateLimit";
import { IS_TWITCH_ONLY, twitchOnlyResponse } from "../../lib/constants";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

function driveTokenCookieOptions(expiresIn: number | undefined) {
  const isSecure = import.meta.env.MODE !== "development";
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax" as const,
    maxAge: expiresIn || 3600,
    path: "/",
  };
}

/**
 * One-time migration for pre-split users: reuse the old combined-scope
 * `youtube_token` with Drive scope and copy it to `drive_token`.
 */
async function migrateFromYoutubeToken(
  cookies: any,
  clientId: string,
  clientSecret: string | undefined,
): Promise<string | null> {
  const ytToken = cookies.get("youtube_token")?.value;
  if (ytToken) {
    const checkRes = await fetch(`${DRIVE_API}/about?fields=user`, {
      headers: { Authorization: `Bearer ${ytToken}` },
    });
    if (checkRes.ok) {
      cookies.set("drive_token", ytToken, driveTokenCookieOptions(3600));
      // Copy the refresh token so future refreshes hit the fast path.
      const ytRefresh = cookies.get("youtube_refresh_token")?.value;
      if (ytRefresh) {
        cookies.set("drive_refresh_token", ytRefresh, {
          httpOnly: true,
          secure: import.meta.env.MODE !== "development",
          sameSite: "strict",
          maxAge: 365 * 24 * 60 * 60,
          path: "/",
        });
      }
      return ytToken;
    }
  }

  // The combined-scope YouTube refresh token also carries Drive access.
  const ytRefresh = cookies.get("youtube_refresh_token")?.value;
  if (!ytRefresh) return null;

  const tokenData = await refreshYoutubeToken(
    ytRefresh,
    clientId,
    clientSecret,
  );
  const accessToken = tokenData.access_token;
  if (!accessToken) return null;

  cookies.set(
    "drive_token",
    accessToken,
    driveTokenCookieOptions(tokenData.expires_in),
  );
  // Persist rotated refresh tokens so future refreshes skip the fallback.
  if (tokenData.refresh_token) {
    cookies.set("drive_refresh_token", tokenData.refresh_token, {
      httpOnly: true,
      secure: import.meta.env.MODE !== "development",
      sameSite: "strict",
      maxAge: 365 * 24 * 60 * 60,
      path: "/",
    });
  }

  return accessToken;
}

async function getAccessToken(cookies: any, request: any): Promise<string> {
  // Drive uses its own separate OAuth token (stored in drive_token cookie).
  // YouTube and Drive scopes cannot be combined in a single token.
  const cookieToken = cookies.get("drive_token")?.value;
  if (cookieToken) {
    const checkRes = await fetch(`${DRIVE_API}/about?fields=user`, {
      headers: { Authorization: `Bearer ${cookieToken}` },
    });
    if (checkRes.ok) return cookieToken;
  }

  const refreshToken = cookies.get("drive_refresh_token")?.value;
  if (refreshToken) {
    const clientId = import.meta.env.PUBLIC_YOUTUBE_CLIENT_ID;
    // Google requires the client secret for desktop (PKCE) clients too.
    const clientSecret = import.meta.env.YOUTUBE_CLIENT_SECRET || undefined;
    if (!clientId || !clientSecret) {
      throw new Error("Server configuration error: missing Google credentials.");
    }

    const tokenData = await refreshYoutubeToken(
      refreshToken,
      clientId,
      clientSecret,
    );
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      throw new Error("Failed to refresh Drive access token.");
    }

    cookies.set(
      "drive_token",
      accessToken,
      driveTokenCookieOptions(tokenData.expires_in),
    );

    return accessToken;
  }

  // Fall back to the pre-split youtube_token (combined scope).
  const clientId = import.meta.env.PUBLIC_YOUTUBE_CLIENT_ID;
  const clientSecret = import.meta.env.YOUTUBE_CLIENT_SECRET || undefined;
  if (clientId && clientSecret) {
    const migrated = await migrateFromYoutubeToken(
      cookies,
      clientId,
      clientSecret,
    );
    if (migrated) return migrated;
  }

  throw new Error(
    "No Drive access granted. Please click 'Grant Drive Access' in settings.",
  );
}

async function driveFetch(
  url: string,
  options: RequestInit,
  accessToken: string,
) {
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    const err = new Error(
      "Google authentication expired. Please sign in with Google again.",
    );
    (err as any).status = 401;
    throw err;
  }

  if (res.status === 403) {
    let body = "";
    try {
      body = await res.text();
    } catch {
      /* ignore */
    }
    if (
      body.includes("insufficient authentication scopes") ||
      body.includes("Request had insufficient authentication scopes")
    ) {
      const err = new Error(
        "Google Drive permission not granted. Please click 'Grant Drive Access' in settings.",
      );
      (err as any).status = 403;
      (err as any).needsReauth = true;
      throw err;
    }
  }

  return res;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  if (IS_TWITCH_ONLY) return twitchOnlyResponse();

  const clientAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const rateLimitKey = `${clientAddress}:gdrive`;

  // More generous rate limit for Drive operations (they're infrequent)
  if (!checkRateLimit(rateLimitKey, 20, 60_000)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { action } = body as { action?: string };

    if (action === "check") {
      try {
        const accessToken = await getAccessToken(cookies, request);
        const res = await driveFetch(
          `${DRIVE_API}/about?fields=user`,
          {},
          accessToken,
        );
        if (!res.ok) {
          return new Response(
            JSON.stringify({ error: "Drive access not available" }),
            {
              status: 403,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: err.status || 403,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    const accessToken = await getAccessToken(cookies, request);

    if (action === "find") {
      const { name } = body as { name: string };
      const query = `name='${name}' and trashed=false`;
      const res = await driveFetch(
        `${DRIVE_API}/files?q=${encodeURIComponent(query)}&spaces=drive&fields=files(id,name)`,
        {},
        accessToken,
      );

      if (!res.ok) {
        const errData = await res
          .json()
          .catch(() => ({ error: { message: "Search failed" } }));
        return new Response(
          JSON.stringify({ error: errData?.error?.message || "Search failed" }),
          {
            status: res.status,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const data = await res.json();
      const file = data.files?.[0];
      return new Response(JSON.stringify({ fileId: file?.id || null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (action === "create") {
      const { content, name } = body as { content: string; name: string };

      const metadata = {
        name,
        mimeType: "application/json",
      };

      // Use multipart upload to send both metadata and content
      const boundary = "-------314159265358979323846";
      const multipartBody = [
        `--${boundary}`,
        "Content-Type: application/json; charset=UTF-8",
        "",
        JSON.stringify(metadata),
        `--${boundary}`,
        "Content-Type: application/json; charset=UTF-8",
        "",
        content,
        `--${boundary}--`,
      ].join("\r\n");

      const res = await driveFetch(
        `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,webViewLink,webContentLink`,
        {
          method: "POST",
          headers: {
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body: multipartBody,
        },
        accessToken,
      );

      if (!res.ok) {
        const errData = await res
          .json()
          .catch(() => ({ error: { message: "Upload failed" } }));
        return new Response(
          JSON.stringify({ error: errData?.error?.message || "Upload failed" }),
          {
            status: res.status,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const data = await res.json();
      return new Response(
        JSON.stringify({
          fileId: data.id,
          webViewLink: data.webViewLink,
          webContentLink: data.webContentLink,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (action === "update") {
      const { fileId, content } = body as { fileId: string; content: string };

      const res = await driveFetch(
        `${DRIVE_UPLOAD_API}/files/${fileId}?uploadType=media&fields=id,webViewLink,webContentLink`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json; charset=UTF-8",
          },
          body: content,
        },
        accessToken,
      );

      if (!res.ok) {
        const errData = await res
          .json()
          .catch(() => ({ error: { message: "Update failed" } }));
        return new Response(
          JSON.stringify({ error: errData?.error?.message || "Update failed" }),
          {
            status: res.status,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const data = await res.json();
      return new Response(
        JSON.stringify({
          fileId: data.id,
          webViewLink: data.webViewLink,
          webContentLink: data.webContentLink,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (action === "get") {
      const { fileId: getFileId } = body as { fileId: string };

      const res = await driveFetch(
        `${DRIVE_API}/files/${getFileId}?alt=media`,
        {},
        accessToken,
      );

      if (!res.ok) {
        const errData = await res
          .json()
          .catch(() => ({ error: { message: "Download failed" } }));
        return new Response(
          JSON.stringify({
            error: errData?.error?.message || "Download failed",
          }),
          {
            status: res.status,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const fileContent = await res.text();
      return new Response(JSON.stringify({ content: fileContent }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const isAuthError = err.status === 401 || err.status === 403;
    const status = isAuthError ? err.status : 500;
    const message = err.needsReauth
      ? err.message
      : isAuthError
        ? err.message
        : "An unexpected error occurred.";

    console.error("[Google Drive API] Error:", err.message || String(err));

    return new Response(
      JSON.stringify({
        error: message,
        needsReauth: err.needsReauth || false,
      }),
      {
        status,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
