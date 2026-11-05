import { describe, it, expect } from "vitest";
import {
  computeMaxFontSize,
  optionIndexAtPointer,
} from "../../src/lib/wheel/draw";
import { sanitizeWheelOptions } from "../../src/lib/wheel/types";
import { formatHistoryTime } from "../../src/lib/wheel/history";

describe("optionIndexAtPointer", () => {
  it("maps rotations to the four quadrant slices", () => {
    expect(optionIndexAtPointer(0, 4)).toBe(3);
    expect(optionIndexAtPointer(90, 4)).toBe(2);
    expect(optionIndexAtPointer(180, 4)).toBe(1);
    expect(optionIndexAtPointer(270, 4)).toBe(0);
  });

  it("handles negative and wrapped rotations", () => {
    expect(optionIndexAtPointer(-90, 4)).toBe(0);
    expect(optionIndexAtPointer(360, 4)).toBe(3);
    expect(optionIndexAtPointer(450, 4)).toBe(2);
  });

  it("returns -1 for an empty wheel", () => {
    expect(optionIndexAtPointer(0, 0)).toBe(-1);
  });
});

describe("computeMaxFontSize", () => {
  function makeCtx(): CanvasRenderingContext2D {
    const ctx: { font: string; measureText: (text: string) => TextMetrics } = {
      font: "bold 10px Arial",
      measureText(text: string) {
        const match = /(\d+(?:\.\d+)?)px/.exec(ctx.font);
        const size = match ? parseFloat(match[1]) : 10;
        return { width: text.length * size * 0.6 } as TextMetrics;
      },
    };
    return ctx as unknown as CanvasRenderingContext2D;
  }

  it("shrinks the font as the text gets longer", () => {
    const ctx = makeCtx();
    const short = computeMaxFontSize(ctx, "Hi", 3, 200);
    const long = computeMaxFontSize(ctx, "a".repeat(30), 3, 200);
    expect(short).toBeGreaterThan(long);
    expect(long).toBeGreaterThanOrEqual(8);
  });

  it("never returns below the minimum readable size", () => {
    const ctx = makeCtx();
    const size = computeMaxFontSize(ctx, "b".repeat(200), 30, 200);
    expect(size).toBeGreaterThanOrEqual(8);
  });
});

describe("sanitizeWheelOptions", () => {
  it("trims, drops empties and dedupes case-insensitively", () => {
    expect(sanitizeWheelOptions(["  Yes ", "yes", "", "No", "No"])).toEqual([
      "Yes",
      "No",
    ]);
  });

  it("ignores non-strings", () => {
    expect(sanitizeWheelOptions(["A", 1, null, "B"])).toEqual(["A", "B"]);
  });

  it("returns an empty array for non-array input", () => {
    expect(sanitizeWheelOptions("nope")).toEqual([]);
  });
});

describe("wheel history", () => {
  it("formats a timestamp as HH:MM:SS DD/MM", () => {
    const formatted = formatHistoryTime(new Date(2026, 0, 2, 3, 4, 5));
    expect(formatted).toBe("03:04:05 02/01");
  });
});
