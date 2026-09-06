/**
 * Twitch GIF (Giphy) chat helpers, shared by the Twitch chat renderers.
 *
 * Twitch delivers GIF chat messages (the Giphy-powered GIF Keyboard) over
 * IRC through a `gifs` PRIVMSG tag. Each entry has the form
 *
 *   <start position>-<end position>|<gifID>|<gifURL>
 *
 * and entries are comma-separated. Position indices are zero-based within
 * the message text, which holds the GIF's caption/alt text (e.g.
 * `[Y A Y Yes GIF by Djemilah Birnie]`). Applications rendering the GIF
 * must use the full URL provided; it must not be modified.
 *
 * EventSub exposes the same data as a `gif` message fragment with `gif_id`
 * and `url` fields; the `TwitchGif` shape mirrors those two plus the
 * character range so the renderer can splice the image into the text.
 *
 * Pure functions (no React / DOM dependencies) so they're trivial to
 * unit-test in Node.
 */

export interface TwitchGif {
  /** Giphy GIF id. */
  id: string;
  /** Full Giphy media URL. Must be used as-is, never modified. */
  url: string;
  /** Start offset (inclusive) of the GIF range within the message text. */
  start: number;
  /** End offset (exclusive) of the GIF range within the message text. */
  end: number;
}

/** Parse the IRC `gifs` tag into structured GIF entries. */
export function parseGifsTag(tag: string | undefined | null): TwitchGif[] {
  if (!tag) return [];
  const gifs: TwitchGif[] = [];
  for (const entry of tag.split(",")) {
    if (!entry) continue;
    const [range, id, url] = entry.split("|");
    if (!range || !id || !url) continue;
    const [start, end] = range.split("-").map(Number);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (start < 0 || end < start) continue;
    gifs.push({ id, url, start, end });
  }
  return gifs;
}

export interface GifTextSegment {
  type: "text";
  /** Plain text slice between GIF ranges; safe for HTML innerText use. */
  text: string;
  /** Start offset of this segment within the original input (inclusive). */
  start: number;
  /** End offset of this segment within the original input (exclusive). */
  end: number;
}

export interface GifImageSegment {
  type: "gif";
  /** Giphy GIF id. */
  id: string;
  /** Full Giphy media URL (use as-is). */
  url: string;
  /** Start offset of this GIF within the original input (inclusive). */
  start: number;
  /** End offset of this GIF within the original input (exclusive). */
  end: number;
}

export type GifSplitSegment = GifTextSegment | GifImageSegment;

/**
 * Walk `text` linearly and split it into alternating text/GIF segments
 * wherever a GIF range is declared. Used by the chat renderers to mount an
 * `<img>` inline where the GIF caption text would otherwise render.
 *
 * GIFs are sorted by start offset; out-of-order or overlapping ranges are
 * handled defensively (later ranges that start before the cursor are
 * clamped). Always emits at least one segment so callers don't need a
 * special case.
 */
export function splitMessageByGifs(
  text: string,
  gifs: TwitchGif[] | undefined,
): GifSplitSegment[] {
  if (!text) return [{ type: "text", text: "", start: 0, end: 0 }];
  if (!gifs?.length) {
    return [{ type: "text", text, start: 0, end: text.length }];
  }

  const sorted = [...gifs].sort((a, b) => a.start - b.start);
  const segments: GifSplitSegment[] = [];
  let cursor = 0;

  for (const gif of sorted) {
    const start = Math.max(gif.start, cursor);
    const end = Math.max(gif.end, start);
    if (start > cursor) {
      segments.push({
        type: "text",
        text: text.slice(cursor, start),
        start: cursor,
        end: start,
      });
    }
    segments.push({
      type: "gif",
      id: gif.id,
      url: gif.url,
      start,
      end,
    });
    cursor = end;
  }

  if (cursor < text.length) {
    segments.push({
      type: "text",
      text: text.slice(cursor),
      start: cursor,
      end: text.length,
    });
  }

  // Twitch's `gifs` tag ranges run from the opening bracket through the
  // end of the caption but stop one character short of the closing `]`
  // (e.g. `gifs=0-36` for a 37-char `[Dance Party Disco GIF by X]`).
  // Those brackets are caption formatting, not user text — Twitch's own
  // chat renders such messages as just the GIF, so drop bracket-only
  // segments that directly flank a GIF here.
  const first = segments[0];
  if (first?.type === "text" && first.text === "[" && segments[1]?.type === "gif") {
    segments.shift();
  }
  const last = segments[segments.length - 1];
  if (
    last?.type === "text" &&
    last.text === "]" &&
    segments[segments.length - 2]?.type === "gif"
  ) {
    segments.pop();
  }

  if (segments.length === 0) {
    segments.push({ type: "text", text, start: 0, end: text.length });
  }
  return segments;
}
