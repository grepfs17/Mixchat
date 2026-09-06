import { describe, it, expect } from "vitest";
import {
  parseGifsTag,
  splitMessageByGifs,
  type TwitchGif,
} from "../../src/lib/twitchGifs";

const GIPHY_URL =
  "https://media4.giphy.com/media/joSNxeswxuc74Juo8X/giphy.gif?cid=095d7a5d&rid=giphy.gif&ct=g";

describe("parseGifsTag", () => {
  it("parses a single gif entry", () => {
    const result = parseGifsTag(`0-33|joSNxeswxuc74Juo8X|${GIPHY_URL}`);
    expect(result).toEqual([
      { id: "joSNxeswxuc74Juo8X", url: GIPHY_URL, start: 0, end: 33 },
    ]);
  });

  it("parses multiple comma-separated gif entries", () => {
    const result = parseGifsTag(
      `0-10|gifA|https://media1.giphy.com/media/gifA/giphy.gif,12-22|gifB|https://media2.giphy.com/media/gifB/giphy.gif`,
    );
    expect(result).toEqual([
      { id: "gifA", url: "https://media1.giphy.com/media/gifA/giphy.gif", start: 0, end: 10 },
      { id: "gifB", url: "https://media2.giphy.com/media/gifB/giphy.gif", start: 12, end: 22 },
    ]);
  });

  it("returns an empty array for undefined/null/empty tags", () => {
    expect(parseGifsTag(undefined)).toEqual([]);
    expect(parseGifsTag(null)).toEqual([]);
    expect(parseGifsTag("")).toEqual([]);
  });

  it("skips malformed entries", () => {
    const result = parseGifsTag(`not-a-range|gifA|urlA,5-10|,5-10|gifB|urlB`);
    expect(result).toEqual([{ id: "gifB", url: "urlB", start: 5, end: 10 }]);
  });

  it("skips entries with inverted ranges", () => {
    expect(parseGifsTag(`10-5|gifA|urlA`)).toEqual([]);
  });

  it("keeps the URL verbatim (no modification)", () => {
    const tag = `0-5|gifA|${GIPHY_URL}`;
    const result = parseGifsTag(tag);
    expect(result[0].url).toBe(GIPHY_URL);
  });
});

describe("splitMessageByGifs", () => {
  const caption = "[Y A Y Yes GIF by Djemilah Birnie]";
  const gif: TwitchGif = { id: "joSNxeswxuc74Juo8X", url: GIPHY_URL, start: 0, end: caption.length };

  it("returns a single text segment when there are no gifs", () => {
    expect(splitMessageByGifs("hello", [])).toEqual([
      { type: "text", text: "hello", start: 0, end: 5 },
    ]);
  });

  it("returns a single empty text segment for empty text", () => {
    expect(splitMessageByGifs("", [])).toEqual([
      { type: "text", text: "", start: 0, end: 0 },
    ]);
  });

  it("splits a full-caption gif into a single gif segment", () => {
    const segments = splitMessageByGifs(caption, [gif]);
    expect(segments).toEqual([
      { type: "gif", id: gif.id, url: gif.url, start: 0, end: caption.length },
    ]);
  });

  it("keeps leading/trailing text around a gif range", () => {
    const text = `prefix ${caption} suffix`;
    const gifs: TwitchGif[] = [
      { ...gif, start: 7, end: 7 + caption.length },
    ];
    const segments = splitMessageByGifs(text, gifs);
    expect(segments).toEqual([
      { type: "text", text: "prefix ", start: 0, end: 7 },
      { type: "gif", id: gif.id, url: gif.url, start: 7, end: 7 + caption.length },
      { type: "text", text: " suffix", start: 7 + caption.length, end: text.length },
    ]);
  });

  it("splits multiple gifs in order", () => {
    const text = "A-B-C";
    const gifs: TwitchGif[] = [
      { id: "gifA", url: "uA", start: 0, end: 1 },
      { id: "gifB", url: "uB", start: 4, end: 5 },
    ];
    const segments = splitMessageByGifs(text, gifs);
    expect(segments).toEqual([
      { type: "gif", id: "gifA", url: "uA", start: 0, end: 1 },
      { type: "text", text: "-B-", start: 1, end: 4 },
      { type: "gif", id: "gifB", url: "uB", start: 4, end: 5 },
    ]);
  });

  it("clamps out-of-order or overlapping ranges defensively", () => {
    const text = "abcdef";
    const gifs: TwitchGif[] = [
      { id: "gifB", url: "uB", start: 4, end: 6 },
      { id: "gifA", url: "uA", start: 0, end: 3 },
    ];
    const segments = splitMessageByGifs(text, gifs);
    expect(segments).toEqual([
      { type: "gif", id: "gifA", url: "uA", start: 0, end: 3 },
      { type: "text", text: "d", start: 3, end: 4 },
      { type: "gif", id: "gifB", url: "uB", start: 4, end: 6 },
    ]);
  });

  it("drops the stray closing bracket left over from a real Twitch range", () => {
    // Real Twitch data: the gifs range (0-36) covers the caption and the
    // opening bracket but stops one char before the closing "]".
    const text = "[Dance Party Disco GIF by Respective]";
    const gifs: TwitchGif[] = [
      { id: "34PROuA0RrlvZHbh8r", url: GIPHY_URL, start: 0, end: 36 },
    ];
    expect(splitMessageByGifs(text, gifs)).toEqual([
      { type: "gif", id: "34PROuA0RrlvZHbh8r", url: GIPHY_URL, start: 0, end: 36 },
    ]);
  });

  it("keeps brackets when they flank real user text, not just a gif", () => {
    const text = "looks like [gif] alright";
    const gifs: TwitchGif[] = [
      { id: "gifA", url: "uA", start: 12, end: 15 },
    ];
    const segments = splitMessageByGifs(text, gifs);
    expect(segments[0]).toEqual({ type: "text", text: "looks like [", start: 0, end: 12 });
    expect(segments[1]).toEqual({ type: "gif", id: "gifA", url: "uA", start: 12, end: 15 });
    expect(segments[2]).toEqual({ type: "text", text: "] alright", start: 15, end: 24 });
  });
});
