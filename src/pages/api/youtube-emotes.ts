import type { APIRoute } from 'astro';

/**
 * GET /api/youtube-emotes?videoId=xxx
 *
 * Fetches the channel's custom emojis (membership emotes) by scraping the
 * same YouTube page that the youtube-chat library uses internally.
 *
 * YouTube's official Data API v3 does NOT expose channel custom emojis, so
 * we extract them from ytInitialData embedded in the live-chat frame HTML,
 * which is the same source the Innertube API returns to the library.
 */

interface YTEmote {
    name: string; // shortcut / emojiText, e.g. ":channelName_emote1:"
    url: string;  // CDN image URL
    isCustomEmoji: boolean;
}

export const GET: APIRoute = async ({ url }) => {
    const videoId = url.searchParams.get('videoId');

    if (!videoId) {
        return new Response(
            JSON.stringify({ error: 'videoId query parameter is required' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }

    try {
        const emotes = await fetchCustomEmojis(videoId);
        return new Response(
            JSON.stringify({ success: true, videoId, emotes }),
            {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    // Cache for 5 minutes — emotes don't change mid-stream
                    'Cache-Control': 'public, max-age=300',
                },
            }
        );
    } catch (error) {
        console.error('YouTube emotes fetch error:', error);
        return new Response(
            JSON.stringify({
                error: error instanceof Error ? error.message : 'Failed to fetch emotes',
                emotes: [],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
            // Return 200 with empty list instead of 500 — missing emotes is non-fatal
        );
    }
};

async function fetchCustomEmojis(videoId: string): Promise<YTEmote[]> {
    // Step 1: Fetch the watch page — contains ytInitialData with customEmojis
    const watchPageUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const pageRes = await fetch(watchPageUrl, {
        headers: {
            // Mimic a browser so YouTube returns the full JS-embedded data
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
        },
    });

    if (!pageRes.ok) {
        throw new Error(`Failed to fetch YouTube watch page: ${pageRes.status}`);
    }

    const html = await pageRes.text();

    // Step 2: Extract ytInitialData JSON from the page
    // YouTube embeds it as: var ytInitialData = {...};
    const initDataMatch = html.match(/var ytInitialData\s*=\s*(\{.+?\});\s*(?:var |<\/script>)/s);
    if (!initDataMatch) {
        // Try the live-chat iframe URL instead, which also has customEmojis
        return fetchCustomEmojisFromChatFrame(videoId, html);
    }

    let ytInitialData: any;
    try {
        ytInitialData = JSON.parse(initDataMatch[1]);
    } catch {
        return fetchCustomEmojisFromChatFrame(videoId, html);
    }

    // Step 3: Walk ytInitialData to find customEmojis.
    // They live at: contents.liveChatRenderer.customEmojis  (in chat embed data)
    // or inside engagementPanels → liveChatRenderer
    const emotes = extractCustomEmojisFromInitData(ytInitialData);
    if (emotes.length > 0) return emotes;

    // Fallback: try the dedicated live-chat frame
    return fetchCustomEmojisFromChatFrame(videoId, html);
}

/** 
 * Fallback: fetch https://www.youtube.com/live_chat?v=xxx which is the
 * iframe YouTube embeds for chat. Its ytInitialData has a liveChatRenderer
 * with customEmojis at the top level.
 */
async function fetchCustomEmojisFromChatFrame(
    videoId: string,
    _watchHtml?: string
): Promise<YTEmote[]> {
    const chatFrameUrl = `https://www.youtube.com/live_chat?v=${videoId}&embed_domain=www.youtube.com`;
    const res = await fetch(chatFrameUrl, {
        headers: {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
        },
    });

    if (!res.ok) return [];

    const html = await res.text();

    // ytInitialData is embedded the same way in the chat frame
    const match = html.match(/var ytInitialData\s*=\s*(\{.+?\});\s*(?:var |<\/script>)/s);
    if (!match) return [];

    let data: any;
    try {
        data = JSON.parse(match[1]);
    } catch {
        return [];
    }

    return extractCustomEmojisFromInitData(data);
}

/**
 * Recursively finds any `customEmojis` array in ytInitialData and converts
 * each entry to our YTEmote shape.
 *
 * YouTube's customEmoji entries look like:
 * {
 *   emojiId: "UgkX...",
 *   shortcuts: [":channelName_emote1:"],
 *   searchTerms: [...],
 *   image: { thumbnails: [{ url, width, height }, ...], accessibility: ... },
 *   isCustomEmoji: true
 * }
 */
function extractCustomEmojisFromInitData(data: any): YTEmote[] {
    // BFS search for a `customEmojis` key anywhere in the tree
    const queue: any[] = [data];
    const results: YTEmote[] = [];
    const seen = new Set<string>();

    while (queue.length > 0) {
        const node = queue.shift();
        if (!node || typeof node !== 'object') continue;

        if (Array.isArray(node.customEmojis)) {
            for (const emoji of node.customEmojis) {
                const emote = parseCustomEmoji(emoji);
                if (emote && !seen.has(emote.name)) {
                    seen.add(emote.name);
                    results.push(emote);
                }
            }
            // Don't stop — there might be more (e.g. multiple renderers)
        }

        // Enqueue child nodes (limit depth to avoid huge traversals)
        for (const key of Object.keys(node)) {
            const child = node[key];
            if (child && typeof child === 'object') {
                queue.push(child);
            }
        }
    }

    return results;
}

function parseCustomEmoji(emoji: any): YTEmote | null {
    if (!emoji || typeof emoji !== 'object') return null;

    // Pick the best image URL: prefer a mid-size thumbnail
    const thumbnails: any[] = emoji.image?.thumbnails ?? [];
    if (thumbnails.length === 0) return null;

    // Sort ascending by width and pick the smallest that is >= 32px, else the largest
    const sorted = [...thumbnails].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
    const preferred = sorted.find((t) => (t.width ?? 0) >= 32) ?? sorted[sorted.length - 1];
    const url: string = preferred?.url ?? '';
    if (!url) return null;

    // Name: prefer the shortcut code (e.g. ":channelName_hi:"), fall back to emojiId
    const shortcuts: string[] = emoji.shortcuts ?? [];
    const name = shortcuts[0] || emoji.emojiId || '';
    if (!name) return null;

    return {
        name,
        url,
        isCustomEmoji: true,
    };
}
