import { describe, it, expect, beforeEach } from "vitest";
import {
  getEmoteUsage,
  recordEmoteUsageFromText,
  searchEmotes,
  setEmotes7tv,
  setEmotesBttv,
  setEmotesFfz,
} from "../../src/lib/emotes";

describe("emote usage ranking", () => {
  beforeEach(() => {
    localStorage.clear();
    setEmotes7tv({});
    setEmotesBttv({});
    setEmotesFfz({});
  });

  it("counts known emote names in sent text", () => {
    setEmotes7tv({
      KnownEmote: "https://cdn.7tv.app/emote/known/1x.webp",
    });

    recordEmoteUsageFromText("hello KnownEmote KnownEmote unknown");

    expect(getEmoteUsage()).toEqual({ KnownEmote: 2 });
  });

  it("ignores text that contains no known emotes", () => {
    recordEmoteUsageFromText("just a normal message");

    expect(getEmoteUsage()).toEqual({});
  });

  it("puts more frequently used emotes first in search results", () => {
    setEmotes7tv({
      UsageRankAlpha: "https://cdn.7tv.app/emote/alpha/1x.webp",
      UsageRankBeta: "https://cdn.7tv.app/emote/beta/1x.webp",
    });

    recordEmoteUsageFromText("UsageRankBeta UsageRankBeta");
    recordEmoteUsageFromText("UsageRankAlpha");

    const results = searchEmotes("UsageRank");

    expect(results.map((r) => r.name)).toEqual([
      "UsageRankBeta",
      "UsageRankAlpha",
    ]);
  });

  it("keeps an exact match above more frequently used partial matches", () => {
    setEmotes7tv({
      Rank: "https://cdn.7tv.app/emote/rank/1x.webp",
      Ranked: "https://cdn.7tv.app/emote/ranked/1x.webp",
    });

    recordEmoteUsageFromText("Ranked Ranked Ranked");

    const results = searchEmotes("Rank");

    expect(results[0]?.name).toBe("Rank");
  });
});
