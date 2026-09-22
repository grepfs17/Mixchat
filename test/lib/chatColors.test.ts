import { describe, it, expect, beforeEach } from "vitest";
import {
  getReadableUsernameColor,
  setThemeBackgroundColor,
  getColorFromName,
  buildMentionColorMap,
} from "../../src/lib/chatColors";

// Matches the default --color-bg-primary from styles/vars.css
const DARK_BG = "#0c0c0e";

describe("getReadableUsernameColor", () => {
  beforeEach(() => {
    setThemeBackgroundColor(DARK_BG);
  });

  it("returns the default colour when no colour is provided", () => {
    expect(getReadableUsernameColor(undefined)).toBe("#e2e8f0");
  });

  it("keeps bright, readable colours unchanged", () => {
    expect(getReadableUsernameColor("#ff7f50")).toBe("#ff7f50");
    expect(getReadableUsernameColor("#00ff7f")).toBe("#00ff7f");
    expect(getReadableUsernameColor("#ffffff")).toBe("#ffffff");
  });

  it("switches hard-to-read dark colours like #0000ff to white", () => {
    // Pure blue is ~2.3:1 on the dark background — unreadable even though
    // it is far from the background in RGB space.
    expect(getReadableUsernameColor("#0000ff")).toBe("#ffffff");
  });

  it("switches colours that are visually close to the background to white", () => {
    expect(getReadableUsernameColor("#101012")).toBe("#ffffff");
    expect(getReadableUsernameColor("#555555")).toBe("#ffffff");
  });

  it("keeps mid-tone colours that clear the contrast floor", () => {
    expect(getReadableUsernameColor("#666666")).toBe("#666666");
  });

  it("works with hsl colours produced by getColorFromName", () => {
    const generated = getColorFromName("someUser");
    const readable = getReadableUsernameColor(generated);
    expect(["#ffffff", generated]).toContain(readable);
  });

  it("re-evaluates against the new background after a theme change", () => {
    // On the default dark background #666666 passes the contrast floor…
    expect(getReadableUsernameColor("#666666")).toBe("#666666");
    // …but on a lighter background it also clears the floor.
    setThemeBackgroundColor("#ffffff");
    expect(getReadableUsernameColor("#0000ff")).toBe("#0000ff");
  });
});

describe("buildMentionColorMap", () => {
  beforeEach(() => {
    setThemeBackgroundColor(DARK_BG);
  });

  it("maps both the display name and login (lowercased) to the colour", () => {
    const map = buildMentionColorMap([
      { author: "CoolUser", userName: "cooluser", authorColor: "#ff7f50" },
    ]);
    expect(map.get("cooluser")).toBe("#ff7f50");
    expect(map.get("CoolUser".toLowerCase())).toBe("#ff7f50");
  });

  it("skips messages without a colour", () => {
    expect(buildMentionColorMap([{ author: "NoColor" }]).size).toBe(0);
  });

  it("applies the readability pass to stored colours", () => {
    const map = buildMentionColorMap([
      { author: "Blue", authorColor: "#0000ff" },
    ]);
    expect(map.get("blue")).toBe("#ffffff");
  });
});
