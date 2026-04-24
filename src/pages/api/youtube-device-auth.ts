/**
 * /api/youtube-device-auth
 *
 * One-time setup endpoint for the server's YouTube OAuth credential.
 * All routes are ADMIN-ONLY — protected by the YT_ADMIN_SECRET env var.
 *
 * Usage:
 *
 *   # 1. Start the device flow (get a URL + code to visit)
 *   POST /api/youtube-device-auth
 *   { "action": "start" }
 *   → { "verification_url", "user_code", "device_code", "expires_in", "interval" }
 *
 *   # 2. Poll until authorized (call repeatedly every `interval` seconds)
 *   POST /api/youtube-device-auth
 *   { "action": "poll", "device_code": "<from step 1>" }
 *   → { "status": "pending" }          (keep polling)
 *   → { "status": "authorized" }       (done! credentials saved)
 *
 *   # 3. Check current status
 *   GET /api/youtube-device-auth
 *   → { "hasCredentials": true|false }
 *
 *   # 4. Revoke (force re-auth)
 *   POST /api/youtube-device-auth
 *   { "action": "revoke" }
 *   → { "status": "revoked" }
 *
 * Security: Set YT_ADMIN_SECRET in your environment. All requests must include
 *   Authorization: Bearer <YT_ADMIN_SECRET>
 * If YT_ADMIN_SECRET is not set, the endpoint is disabled.
 */

import type { APIRoute } from 'astro';
import {
    startDeviceFlow,
    pollDeviceFlow,
    hasServerCredentials,
    revokeServerCredentials,
} from '../../lib/youtube-server-auth';


function checkAdminAuth(request: Request): boolean {
    const secret = process.env.YT_ADMIN_SECRET;
    if (!secret) return false; // Endpoint disabled if no secret configured
    const auth = request.headers.get('Authorization') ?? '';
    return auth === `Bearer ${secret}`;
}

function unauthorizedResponse(noSecret = false): Response {
    const msg = noSecret
        ? 'This endpoint is disabled. Set YT_ADMIN_SECRET to enable it.'
        : 'Unauthorized. Provide Authorization: Bearer <YT_ADMIN_SECRET>';
    return new Response(JSON.stringify({ error: msg }), {
        status: noSecret ? 403 : 401,
        headers: { 'Content-Type': 'application/json' },
    });
}



export const GET: APIRoute = async ({ request }) => {
    if (!process.env.YT_ADMIN_SECRET) return unauthorizedResponse(true);
    if (!checkAdminAuth(request)) return unauthorizedResponse();

    const credentialsExist = await hasServerCredentials();
    return new Response(
        JSON.stringify({ hasCredentials: credentialsExist }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
};


export const POST: APIRoute = async ({ request }) => {
    if (!process.env.YT_ADMIN_SECRET) return unauthorizedResponse(true);
    if (!checkAdminAuth(request)) return unauthorizedResponse();

    let body: any;
    try {
        body = await request.json();
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const action = body?.action as string | undefined;


    if (action === 'start') {
        try {
            const flow = await startDeviceFlow();
            console.log(
                `[YT Device Auth] Device flow started.\n` +
                `  → Visit: ${flow.verification_url}\n` +
                `  → Code:  ${flow.user_code}\n` +
                `  → Expires in ${flow.expires_in}s`,
            );
            return new Response(
                JSON.stringify({
                    verification_url: flow.verification_url,
                    user_code: flow.user_code,
                    device_code: flow.device_code,
                    expires_in: flow.expires_in,
                    interval: flow.interval,
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } },
            );
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[YT Device Auth] Failed to start device flow:', msg);
            return new Response(JSON.stringify({ error: msg }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }
    }

    if (action === 'poll') {
        const deviceCode = body?.device_code as string | undefined;
        if (!deviceCode) {
            return new Response(JSON.stringify({ error: 'device_code is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        try {
            const creds = await pollDeviceFlow(deviceCode);
            if (creds === null) {
                // Still waiting for user to authorize
                return new Response(JSON.stringify({ status: 'pending' }), {
                    status: 202,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            console.log('[YT Device Auth] Authorization completed! Server credentials saved.');
            return new Response(JSON.stringify({ status: 'authorized' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[YT Device Auth] Poll failed:', msg);
            return new Response(JSON.stringify({ error: msg }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }
    }


    if (action === 'revoke') {
        await revokeServerCredentials();
        console.log('[YT Device Auth] Server credentials revoked.');
        return new Response(JSON.stringify({ status: 'revoked' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    return new Response(
        JSON.stringify({ error: `Unknown action: ${action}. Use "start", "poll", or "revoke".` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
};
