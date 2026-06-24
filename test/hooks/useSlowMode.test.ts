import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useSlowMode } from "../../src/hooks/chat/useSlowMode";

describe("useSlowMode", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with cooldown 0", () => {
    const { result } = renderHook(() => useSlowMode());
    expect(result.current.cooldown).toBe(0);
  });

  it("startCooldown sets the cooldown value", () => {
    const { result } = renderHook(() => useSlowMode());
    act(() => result.current.startCooldown(30));
    expect(result.current.cooldown).toBe(30);
  });

  it("cooldown decrements each second", () => {
    const { result } = renderHook(() => useSlowMode());
    act(() => result.current.startCooldown(5));
    expect(result.current.cooldown).toBe(5);

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.cooldown).toBe(4);

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.cooldown).toBe(3);
  });

  it("cooldown reaches 0 and stops", () => {
    const { result } = renderHook(() => useSlowMode());
    act(() => result.current.startCooldown(2));
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.cooldown).toBe(1);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.cooldown).toBe(0);
    // Advancing more should stay at 0
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.cooldown).toBe(0);
  });

  it("startCooldown resets if called again", () => {
    const { result } = renderHook(() => useSlowMode());
    act(() => result.current.startCooldown(10));
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.cooldown).toBe(5);
    act(() => result.current.startCooldown(20));
    expect(result.current.cooldown).toBe(20);
  });

  it("cleans up timer on unmount", () => {
    const { result, unmount } = renderHook(() => useSlowMode());
    act(() => result.current.startCooldown(10));
    unmount();
    // Should not throw
    act(() => vi.advanceTimersByTime(5000));
  });
});
