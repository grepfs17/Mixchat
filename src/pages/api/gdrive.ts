import type { APIRoute } from "astro";
import { refreshYoutubeToken } from "../../lib/youtube";
import { checkRateLimit } from "../../lib/rateLimit";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

async function getAccessToken(cookies: any, request: any): Promise<string> {
  // Try the httpOnly cookie first (set during OAuth callback)
  const cookieToken = cookies.get("youtube_token")?.value;
  if (cookieToken) {
    // Verify the token is still valid by making a lightweight API call
    const checkRes = await fetch(`${DRIVE_API}/about?fields=user`, {
      headers: { Authorization: `Bearer ${cookieToken}` },
    });
    if (checkRes.ok) return cookieToken;
    // Token expired — fall through to refresh
  }

  // Try to refresh using the refresh token cookie
  const refreshToken = cookies.get("youtube_refresh_token")?.value;
  if (!refreshToken) {
    throw new Error(
      "No Google authentication found. Please sign in with Google first.",
    );
  }

  const clientId = import.meta.env.PUBLIC_YOUTUBE_CLIENT_ID;
  const clientSecret = import.meta.env.YOUTUBE_CLIENT_SECRET;
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
    throw new Error("Failed to refresh Google access token.");
  }

  // Update the cookie
  const isDev = import.meta.env.MODE === "development";
  const isSecure = !isDev;
  cookies.set("youtube_token", accessToken, {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    maxAge: tokenData.expires_in || 3600,
    path: "/",
  });

  return accessToken;
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
        "Google Drive permission not granted. Please sign in again to grant Drive access.",
      );
      (err as any).status = 403;
      (err as any).needsReauth = true;
      throw err;
    }
  }

  return res;
}

export const POST: APIRoute = async ({ request, cookies }) => {
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

    // Check action: verify the user has valid Google auth with Drive scope
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

    // All other actions require an access token
    const accessToken = await getAccessToken(cookies, request);

    // Find: look for existing settings file in Drive
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

    // Create: upload a new settings file to Drive
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

    // Update: update an existing file's content
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

    // Get: download a file's content
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
