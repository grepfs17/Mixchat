import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useAutocomplete } from "../../src/hooks/chat/useAutocomplete";

describe("useAutocomplete", () => {
  const defaultOpts = () => ({
    onSelect: vi.fn(),
    onSend: vi.fn(),
    onClose: vi.fn(),
  });

  it("starts closed with empty results", () => {
    const { result } = renderHook(() => useAutocomplete(defaultOpts()));
    expect(result.current.isOpen).toBe(false);
    expect(result.current.results).toEqual([]);
    expect(result.current.selectedIndex).toBe(-1);
  });

  it("show() opens with results and resets selection", () => {
    const { result } = renderHook(() => useAutocomplete(defaultOpts()));
    act(() => result.current.show(["a", "b", "c"]));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.results).toEqual(["a", "b", "c"]);
    expect(result.current.selectedIndex).toBe(-1);
  });

  it("hide() closes and clears state", () => {
    const { result } = renderHook(() => useAutocomplete(defaultOpts()));
    act(() => result.current.show(["a"]));
    act(() => result.current.hide());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.results).toEqual([]);
  });

  it("select() calls onSelect with the item and closes", () => {
    const opts = defaultOpts();
    const { result } = renderHook(() => useAutocomplete(opts));
    act(() => result.current.show(["x", "y"]));
    act(() => result.current.select(1));
    expect(opts.onSelect).toHaveBeenCalledWith("y");
    expect(result.current.isOpen).toBe(false);
  });

  it("select() does nothing for out-of-bounds index", () => {
    const opts = defaultOpts();
    const { result } = renderHook(() => useAutocomplete(opts));
    act(() => result.current.show(["x"]));
    act(() => result.current.select(5));
    expect(opts.onSelect).not.toHaveBeenCalled();
    expect(result.current.isOpen).toBe(true);
  });

  describe("handleKeyDown", () => {
    it("ArrowDown moves selection down", () => {
      const { result } = renderHook(() => useAutocomplete(defaultOpts()));
      act(() => result.current.show(["a", "b", "c"]));
      const e = { key: "ArrowDown", preventDefault: vi.fn() } as any;
      act(() => result.current.handleKeyDown(e));
      expect(result.current.selectedIndex).toBe(0);
      act(() => result.current.handleKeyDown(e));
      expect(result.current.selectedIndex).toBe(1);
    });

    it("ArrowUp moves selection up", () => {
      const { result } = renderHook(() => useAutocomplete(defaultOpts()));
      act(() => result.current.show(["a", "b", "c"]));
      act(() =>
        result.current.handleKeyDown({
          key: "ArrowDown",
          preventDefault: vi.fn(),
        } as any),
      );
      act(() =>
        result.current.handleKeyDown({
          key: "ArrowDown",
          preventDefault: vi.fn(),
        } as any),
      );
      act(() =>
        result.current.handleKeyDown({
          key: "ArrowUp",
          preventDefault: vi.fn(),
        } as any),
      );
      expect(result.current.selectedIndex).toBe(0);
    });

    it("Enter with selection calls onSelect and closes", () => {
      const opts = defaultOpts();
      const { result } = renderHook(() => useAutocomplete(opts));
      act(() => result.current.show(["emote1", "emote2"]));
      act(() =>
        result.current.handleKeyDown({
          key: "ArrowDown",
          preventDefault: vi.fn(),
        } as any),
      );
      act(() =>
        result.current.handleKeyDown({
          key: "Enter",
          preventDefault: vi.fn(),
          shiftKey: false,
        } as any),
      );
      expect(opts.onSelect).toHaveBeenCalledWith("emote1");
      expect(result.current.isOpen).toBe(false);
    });

    it("Enter without selection calls onSend and closes", () => {
      const opts = defaultOpts();
      const { result } = renderHook(() => useAutocomplete(opts));
      act(() => result.current.show(["a"]));
      act(() =>
        result.current.handleKeyDown({
          key: "Enter",
          preventDefault: vi.fn(),
          shiftKey: false,
        } as any),
      );
      expect(opts.onSend).toHaveBeenCalled();
      expect(result.current.isOpen).toBe(false);
    });

    it("Tab with selection calls onSelect and closes", () => {
      const opts = defaultOpts();
      const { result } = renderHook(() => useAutocomplete(opts));
      act(() => result.current.show(["a", "b"]));
      act(() =>
        result.current.handleKeyDown({
          key: "ArrowDown",
          preventDefault: vi.fn(),
        } as any),
      );
      act(() =>
        result.current.handleKeyDown({
          key: "Tab",
          preventDefault: vi.fn(),
        } as any),
      );
      expect(opts.onSelect).toHaveBeenCalledWith("a");
      expect(result.current.isOpen).toBe(false);
    });

    it("Tab without selection completes the top result", () => {
      const opts = defaultOpts();
      const { result } = renderHook(() => useAutocomplete(opts));
      act(() => result.current.show(["a", "b"]));
      act(() =>
        result.current.handleKeyDown({
          key: "Tab",
          preventDefault: vi.fn(),
        } as any),
      );
      expect(opts.onSelect).toHaveBeenCalledWith("a");
      expect(result.current.isOpen).toBe(false);
    });

    it("Escape calls onClose and closes", () => {
      const opts = defaultOpts();
      const { result } = renderHook(() => useAutocomplete(opts));
      act(() => result.current.show(["a"]));
      act(() =>
        result.current.handleKeyDown({
          key: "Escape",
          preventDefault: vi.fn(),
        } as any),
      );
      expect(opts.onClose).toHaveBeenCalled();
      expect(result.current.isOpen).toBe(false);
    });

    it("returns false when not open", () => {
      const { result } = renderHook(() => useAutocomplete(defaultOpts()));
      const handled = result.current.handleKeyDown({
        key: "Enter",
        preventDefault: vi.fn(),
      } as any);
      expect(handled).toBe(false);
    });

    it("returns false for unhandled keys", () => {
      const { result } = renderHook(() => useAutocomplete(defaultOpts()));
      act(() => result.current.show(["a"]));
      const handled = result.current.handleKeyDown({
        key: "a",
        preventDefault: vi.fn(),
      } as any);
      expect(handled).toBe(false);
    });
  });
});
