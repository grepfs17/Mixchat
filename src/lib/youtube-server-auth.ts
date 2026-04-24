/**
 * youtube-server-auth.ts
 *
 * Manages a single, long-lived YouTube OAuth credential for the server itself.
 * This credential is used exclusively for reading live chat (youtubei.js Innertube
 * polling) — NOT for acting as individual users.
 *
 * Flow:
 *   1. Call `startDeviceFlow()` once to get a URL + user_code to display.
 *   2. The operator visits the URL, enters the code, and authenticates.
 *   3. Call `pollDeviceFlow(deviceCode)` until it resolves — credentials are saved.
 *   4. Thereafter, `loadServerCredentials()` returns them and auto-refreshes as needed.
 *
 * Credentials are stored at YT_CREDENTIALS_PATH (default: ./yt-credentials.json
 * relative to cwd). Keep this file out of git (it is in .gitignore).
 */

import fs from 'node:fs/promises';
import path from 'node:path';


export interface ServerCredentials {
    access_token: string;
    refresh_token: string;
    expires_at: number; // Unix ms
    token_type: string;
    scope?: string;
}

export interface DeviceFlowStart {
    device_code: string;
    user_code: string;
    verification_url: string;
    expires_in: number;   // seconds
    interval: number;     // polling interval seconds
}

/** Path to the persisted credentials file. Override with YT_CREDENTIALS_PATH. */
function getCredentialsPath(): string {
    return process.env.YT_CREDENTIALS_PATH
        ? path.resolve(process.env.YT_CREDENTIALS_PATH)
        : path.resolve(process.cwd(), 'yt-credentials.json');
}

/**
 * Google OAuth2 client ID to use for the device flow.
 *
 * For the device flow we use Google's public TV/device client ID.
 * This is a well-known public value that Google publishes for device-flow
 * applications and is used by many open-source YouTube clients.
 *
 * You can override with YT_DEVICE_CLIENT_ID / YT_DEVICE_CLIENT_SECRET if you
 * have your own OAuth2 app configured for the TV & Limited Input Devices flow.
 */
const DEVICE_CLIENT_ID =
    process.env.YT_DEVICE_CLIENT_ID ||
    '861556708454-d6dlm3lh05idd8npek18k6be8ba3oc68.apps.googleusercontent.com';

const DEVICE_CLIENT_SECRET =
    process.env.YT_DEVICE_CLIENT_SECRET || 'SboVhoG9s0rNafixCSGGKXAT';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DEVICE_AUTH_URL = 'https://oauth2.googleapis.com/device/code';
const SCOPE = 'https://www.googleapis.com/auth/youtube';


let _cached: ServerCredentials | null = null;
let _refreshPromise: Promise<ServerCredentials> | null = null;


/**
 * Load server credentials from disk (or memory cache).
 * Returns null if no credentials file exists yet (setup not done).
 * Automatically refreshes the access token when near expiry.
 */
export async function loadServerCredentials(): Promise<ServerCredentials | null> {
    // Return in-memory copy if fresh (more than 2 min from expiry)
    if (_cached && _cached.expires_at - Date.now() > 120_000) {
        return _cached;
    }

    // Try loading from disk
    let creds: ServerCredentials | null = null;
    try {
        const raw = await fs.readFile(getCredentialsPath(), 'utf-8');
        creds = JSON.parse(raw) as ServerCredentials;
    } catch {
        return null; // File doesn't exist yet
    }

    // Refresh if within 5 minutes of expiry
    if (creds.expires_at - Date.now() < 300_000) {
        try {
            creds = await refreshServerCredentials(creds.refresh_token);
        } catch (err) {
            console.error('[YT Server Auth] Failed to refresh server credentials:', err);
            // Return the stale creds — Innertube may still work for a bit
        }
    }

    _cached = creds;
    return creds;
}

/**
 * Start a device-code authorization flow.
 * Returns the data the operator needs to complete auth (URL + code).
 */
export async function startDeviceFlow(): Promise<DeviceFlowStart> {
    const res = await fetch(DEVICE_AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: DEVICE_CLIENT_ID,
            scope: SCOPE,
        }),
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Device flow start failed (${res.status}): ${body}`);
    }

    return res.json() as Promise<DeviceFlowStart>;
}

/**
 * Poll for the result of a device-code flow.
 * Returns `null` if still pending (authorization_pending / slow_down).
 * Returns credentials on success.
 * Throws on hard errors (access_denied, expired_token, etc.).
 */
export async function pollDeviceFlow(
    deviceCode: string,
): Promise<ServerCredentials | null> {
    const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: DEVICE_CLIENT_ID,
            client_secret: DEVICE_CLIENT_SECRET,
            device_code: deviceCode,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
    });

    const data = await res.json() as any;

    if (data.error === 'authorization_pending' || data.error === 'slow_down') {
        return null; // Still waiting
    }

    if (data.error) {
        throw new Error(`Device flow poll error: ${data.error} — ${data.error_description ?? ''}`);
    }

    if (!data.access_token || !data.refresh_token) {
        throw new Error('Device flow poll: missing tokens in response');
    }

    const creds: ServerCredentials = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
        token_type: data.token_type ?? 'Bearer',
        scope: data.scope,
    };

    await saveServerCredentials(creds);
    return creds;
}

/**
 * Force-refresh server credentials using the stored refresh token.
 * Saves the new credentials to disk and updates the in-memory cache.
 */
export async function refreshServerCredentials(
    refreshToken: string,
): Promise<ServerCredentials> {
    // Deduplicate concurrent refresh calls
    if (_refreshPromise) return _refreshPromise;

    _refreshPromise = (async () => {
        const res = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: DEVICE_CLIENT_ID,
                client_secret: DEVICE_CLIENT_SECRET,
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
            }),
        });

        const data = await res.json() as any;
        if (!res.ok || !data.access_token) {
            throw new Error(`Refresh failed (${res.status}): ${data.error ?? JSON.stringify(data)}`);
        }

        const creds: ServerCredentials = {
            access_token: data.access_token,
            // Google may not return a new refresh_token on refresh — keep the old one
            refresh_token: data.refresh_token ?? refreshToken,
            expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
            token_type: data.token_type ?? 'Bearer',
            scope: data.scope,
        };

        await saveServerCredentials(creds);
        _cached = creds;
        console.log('[YT Server Auth] Server credentials refreshed successfully');
        return creds;
    })().finally(() => {
        _refreshPromise = null;
    });

    return _refreshPromise;
}

/** Check whether server credentials exist on disk. */
export async function hasServerCredentials(): Promise<boolean> {
    try {
        await fs.access(getCredentialsPath());
        return true;
    } catch {
        return false;
    }
}

/** Delete server credentials from disk and memory (e.g. for re-auth). */
export async function revokeServerCredentials(): Promise<void> {
    _cached = null;
    try {
        await fs.unlink(getCredentialsPath());
    } catch { /* already gone */ }
}

// Internal helpers

async function saveServerCredentials(creds: ServerCredentials): Promise<void> {
    const p = getCredentialsPath();
    // Ensure the directory exists
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, JSON.stringify(creds, null, 2), 'utf-8');
    _cached = creds;
    console.log('[YT Server Auth] Credentials saved to', p);
}
