/**
 * Google Drive integration for Mixchat settings backup/restore.
 * Uses the Google Drive API v3 via a server-side proxy to avoid CORS
 * and keep access tokens off the client.
 */

const DRIVE_FILE_NAME = "mixchat-settings.json";
const MIME_TYPE = "application/json";

interface DriveSaveResult {
  fileId: string;
  webViewLink?: string;
  webContentLink?: string;
}

interface DriveLoadResult {
  settings: Record<string, string>;
  exportedAt: string;
  version: number;
}

/**
 * Save settings JSON to Google Drive.
 * If a mixchat-settings.json file already exists (by appProperties), update it.
 * Otherwise, create a new one.
 */
export async function saveSettingsToDrive(
  settingsJson: string,
): Promise<DriveSaveResult> {
  // Check if we already have a file
  const existing = await findSettingsFile();

  if (existing) {
    // Update existing file
    const res = await fetch("/api/gdrive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        fileId: existing,
        content: settingsJson,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Upload failed" }));
      throw new Error(err.error || `Failed to update file (${res.status})`);
    }

    const data = await res.json();
    return {
      fileId: data.fileId,
      webViewLink: data.webViewLink,
      webContentLink: data.webContentLink,
    };
  }

  // Create new file
  const res = await fetch("/api/gdrive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "create",
      content: settingsJson,
      name: DRIVE_FILE_NAME,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Upload failed" }));
    throw new Error(err.error || `Failed to create file (${res.status})`);
  }

  const data = await res.json();
  return {
    fileId: data.fileId,
    webViewLink: data.webViewLink,
    webContentLink: data.webContentLink,
  };
}

/**
 * Load settings JSON from Google Drive.
 * Looks for the mixchat-settings.json file and returns its contents.
 */
export async function loadSettingsFromDrive(): Promise<DriveLoadResult> {
  const fileId = await findSettingsFile();

  if (!fileId) {
    throw new Error(
      "No Mixchat settings file found in your Google Drive. Save settings first.",
    );
  }

  const res = await fetch("/api/gdrive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "get", fileId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Download failed" }));
    throw new Error(err.error || `Failed to download file (${res.status})`);
  }

  const data = await res.json();
  const parsed = JSON.parse(data.content);

  if (parsed._app !== "mixchat") {
    throw new Error("This file is not a Mixchat settings backup.");
  }

  return {
    settings: parsed.settings,
    exportedAt: parsed._exportedAt,
    version: parsed._version,
  };
}

/**
 * Find the ID of the existing mixchat-settings.json file in Drive.
 * Returns null if no file found.
 */
async function findSettingsFile(): Promise<string | null> {
  const res = await fetch("/api/gdrive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "find", name: DRIVE_FILE_NAME }),
  });

  if (!res.ok) {
    return null;
  }

  const data = await res.json();
  return data.fileId || null;
}

/**
 * Check if the user has Google Drive access (i.e., has a YouTube/Google session
 * with the drive.file scope).
 */
async function checkDriveAccess(): Promise<boolean> {
  try {
    const res = await fetch("/api/gdrive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "check" }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
