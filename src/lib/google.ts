export async function googleFetch(url: string, init?: RequestInit, context?: { action?: string;[k: string]: any }) {
  const start = Date.now();

  // Ensure we have a Referer header to avoid 403 errors with restricted API keys
  const referrer = process.env.ORIGIN || 'https://www.youtube.com/';
  const headers = new Headers(init?.headers);
  if (!headers.has('Referer')) {
    headers.set('Referer', referrer.endsWith('/') ? referrer : referrer + '/');
  }

  const res = await fetch(url, { ...init, headers });
  const duration = Date.now() - start;

  if (!res.ok) {
    let bodyText = "";
    try {
      bodyText = await res.text();
    } catch (e) {
      bodyText = `<unreadable: ${String(e)}>`;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(bodyText);
    } catch (e) {
      parsed = undefined;
    }

    console.error('[Google API] Request failed', {
      url,
      status: res.status,
      statusText: res.statusText,
      durationMs: duration,
      body: parsed ?? bodyText,
      ...context,
    });

    const message = parsed?.error?.message ?? bodyText ?? `${res.status} ${res.statusText}`;
    const err = new Error(`Google API error: ${message}`);
    (err as any).status = res.status;
    (err as any).body = parsed ?? bodyText;
    throw err;
  }

  try {
    return await res.json();
  } catch (e) {
    console.error('[Google API] Failed to parse JSON response', { url, err: e });
    throw e;
  }
}

export default googleFetch;
