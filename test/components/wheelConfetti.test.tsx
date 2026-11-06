import { describe, it, expect, afterEach } from "vitest";
import { render } from "@testing-library/react";
import WheelConfetti, { buildConfetti } from "../../src/components/wheel/WheelConfetti";

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).matchMedia;
});

describe("buildConfetti", () => {
  it("spreads pieces across the overlay with varied timing", () => {
    const pieces = buildConfetti(50);

    expect(pieces).toHaveLength(50);
    expect(new Set(pieces.map((p) => p.id)).size).toBe(50);
    for (const piece of pieces) {
      expect(piece.left).toBeGreaterThanOrEqual(0);
      expect(piece.left).toBeLessThan(100);
      expect(piece.delay).toBeGreaterThanOrEqual(0);
      expect(piece.delay).toBeLessThan(1.2);
      expect(piece.duration).toBeGreaterThanOrEqual(2.2);
      expect(piece.duration).toBeLessThan(4);
      expect(piece.drift).toBeGreaterThanOrEqual(-80);
      expect(piece.drift).toBeLessThan(80);
      expect(piece.size).toBeGreaterThanOrEqual(6);
      expect(piece.size).toBeLessThan(11);
      expect(piece.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("is deterministic when given a fixed random source", () => {
    const pieces = buildConfetti(3, () => 0);

    expect(pieces).toHaveLength(3);
    for (const piece of pieces) {
      expect(piece.left).toBe(0);
      expect(piece.delay).toBe(0);
      expect(piece.duration).toBeCloseTo(2.2);
      expect(piece.drift).toBe(-80);
      expect(piece.round).toBe(false);
    }
  });
});

describe("WheelConfetti", () => {
  it("renders an aria-hidden layer with one element per piece", () => {
    render(<WheelConfetti count={12} />);

    const layer = document.querySelector(".wheel-confetti");
    expect(layer).toBeTruthy();
    expect(layer?.getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelectorAll(".wheel-confetti__piece")).toHaveLength(12);
  });

  it("bakes the fall animation onto each piece", () => {
    render(<WheelConfetti count={4} />);

    const piece = document.querySelector(".wheel-confetti__piece") as HTMLElement;
    expect(piece).toBeTruthy();
    // The keyframe name itself lives in wheel.css; only these are inline.
    expect(piece.style.animationDelay).toMatch(/^\d+(\.\d+)?s$/);
    expect(Number.parseFloat(piece.style.animationDuration)).toBeGreaterThan(0);
    expect(piece.style.getPropertyValue("--confetti-drift")).toMatch(/^-?\d+(\.\d+)?px$/);
  });

  it("renders nothing when the user prefers reduced motion", () => {
    (window as unknown as Record<string, unknown>).matchMedia = () => ({
      matches: true,
    });

    render(<WheelConfetti count={12} />);
    expect(document.querySelector(".wheel-confetti")).toBeNull();
  });
});
