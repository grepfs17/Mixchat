import { describe, it, expect } from "vitest";
import {
  computeMaxFontSize,
  computeWheelFontSize,
  optionIndexAtPointer,
  wheelGeometry,
} from "../../src/lib/wheel/draw";
import {
  MAX_WHEEL_OPTIONS,
  sanitizeWheelOptions,
} from "../../src/lib/wheel/types";
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
    const short = computeMaxFontSize(ctx, "Hi", 200);
    const long = computeMaxFontSize(ctx, "a".repeat(30), 200);
    expect(short).toBeGreaterThan(long);
    expect(long).toBeGreaterThanOrEqual(8);
  });

  it("never returns below the minimum readable size", () => {
    const ctx = makeCtx();
    const size = computeMaxFontSize(ctx, "b".repeat(200), 200);
    expect(size).toBeGreaterThanOrEqual(8);
  });
});

describe("wheelGeometry", () => {
  it("draws the slices to the edge of the canvas", () => {
    const { radius, hubRadius, labelRadius } = wheelGeometry(1000);
    expect(radius).toBe(490);
    expect(hubRadius).toBe(70);
    // The label sits between the hub and the rim.
    expect(labelRadius).toBeGreaterThan(hubRadius);
    expect(labelRadius).toBeLessThan(radius);
  });
});

describe("computeWheelFontSize", () => {
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

  it("grows the text as the wheel gets bigger", () => {
    const ctx = makeCtx();
    const small = computeWheelFontSize(ctx, "Winner", 484, 4);
    const large = computeWheelFontSize(ctx, "Winner", 1000, 4);
    expect(large).toBeGreaterThan(small);
  });

  it("shrinks to fit crowded slices instead of overflowing them", () => {
    const ctx = makeCtx();
    const roomy = computeWheelFontSize(ctx, "Winner", 800, 8);
    const crowded = computeWheelFontSize(ctx, "Winner", 800, 40);
    expect(crowded).toBeLessThan(roomy);
    // The slice is ~18px wide at the label radius for 40 options, so the text
    // has to fit inside it rather than spill across its neighbours.
    const { labelRadius } = wheelGeometry(800);
    const sliceWidth = 2 * labelRadius * Math.sin(Math.PI / 40);
    expect(crowded).toBeLessThanOrEqual(sliceWidth);
    expect(crowded).toBeGreaterThanOrEqual(8);
  });

  it("handles a single-option wheel without collapsing to zero", () => {
    const ctx = makeCtx();
    expect(computeWheelFontSize(ctx, "Winner", 800, 1)).toBeGreaterThanOrEqual(
      8,
    );
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

  it("keeps every repeat when duplicates are allowed", () => {
    expect(
      sanitizeWheelOptions([" Yes ", "yes", "No", "No", "No"], true),
    ).toEqual(["Yes", "yes", "No", "No", "No"]);
  });

  it("still trims and drops empties with duplicates allowed", () => {
    expect(sanitizeWheelOptions([" A ", "", "  ", "B"], true)).toEqual([
      "A",
      "B",
    ]);
  });

  it("caps the list at MAX_WHEEL_OPTIONS", () => {
    const many = Array.from(
      { length: MAX_WHEEL_OPTIONS + 25 },
      (_, i) => `Option ${i + 1}`,
    );
    expect(sanitizeWheelOptions(many)).toHaveLength(MAX_WHEEL_OPTIONS);
    expect(sanitizeWheelOptions(many, true)).toHaveLength(MAX_WHEEL_OPTIONS);
  });
});

describe("wheel history", () => {
  it("formats a timestamp as HH:MM:SS DD/MM", () => {
    const formatted = formatHistoryTime(new Date(2026, 0, 2, 3, 4, 5));
    expect(formatted).toBe("03:04:05 02/01");
  });
});
