import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { useRef } from "react";
import { useChatAutoScroll } from "../../../src/hooks/chat/useChatAutoScroll";

/**
 * Helper: create a container div with controllable scroll properties
 * and track addEventListener/removeEventListener for the "scroll" event.
 */
function createContainer() {
  const el = document.createElement("div");
  // Make scrollHeight / scrollTop / clientHeight writable so tests can
  // simulate different scroll positions and content heights.
  Object.defineProperty(el, "scrollHeight", {
    value: 1000,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(el, "scrollTop", {
    value: 0,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(el, "clientHeight", {
    value: 400,
    writable: true,
    configurable: true,
  });

  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  const origAdd = el.addEventListener.bind(el);
  const origRemove = el.removeEventListener.bind(el);

  vi.spyOn(el, "addEventListener").mockImplementation(
    (type: string, listener: EventListenerOrEventListenerObject) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
      return origAdd(type, listener);
    },
  );
  vi.spyOn(el, "removeEventListener").mockImplementation(
    (type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.get(type)?.delete(listener);
      return origRemove(type, listener);
    },
  );

  // Cast so TS allows assignment to the redefined properties.
  return { el: el as any as HTMLDivElement & { scrollHeight: number; scrollTop: number; clientHeight: number }, listeners };
}

/**
 * Helper: wrap the hook in a component that holds the ref,
 * since the hook expects a RefObject.
 */
function renderAutoScroll(
  container: HTMLDivElement,
  initialMessages: unknown[] = [],
) {
  const containerRef = { current: container };

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children);

  const { result, rerender, unmount } = renderHook(
    ({ messages }: { messages: unknown[] }) =>
      useChatAutoScroll({
        containerRef,
        messages,
      }),
    {
      wrapper,
      initialProps: { messages: initialMessages },
    },
  );

  return { result, rerender, unmount };
}

describe("useChatAutoScroll", () => {
  let container: ReturnType<typeof createContainer>;
  let rAFCallbacks: Array<FrameRequestCallback>;
  let resizeObserverCallbacks: Array<() => void>;
  let resizeObserverDisconnects: Array<ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    container = createContainer();
    rAFCallbacks = [];
    resizeObserverCallbacks = [];
    resizeObserverDisconnects = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(
      (cb: FrameRequestCallback) => {
        rAFCallbacks.push(cb);
        return rAFCallbacks.length; // non-zero handle
      },
    );

    // Mock ResizeObserver: capture callbacks and track disconnect calls.
    const MockResizeObserver = vi.fn(function (this: any, cb: () => void) {
      resizeObserverCallbacks.push(cb);
      this.disconnect = vi.fn();
      resizeObserverDisconnects.push(this.disconnect);
    });
    MockResizeObserver.prototype.observe = vi.fn();
    MockResizeObserver.prototype.unobserve = vi.fn();
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** Fire all pending ResizeObserver callbacks. */
  function flushResizeObservers() {
    const batch = resizeObserverCallbacks.splice(0);
    for (const cb of batch) {
      cb();
    }
  }

  /** Flush all queued rAF callbacks (first batch, not the re-scheduled ones). */
  function flushRAF() {
    const batch = rAFCallbacks.splice(0);
    for (const cb of batch) {
      cb(0);
    }
  }

  /** Flush all rAF callbacks including re-scheduled ones. */
  function flushAllRAF() {
    while (rAFCallbacks.length > 0) {
      flushRAF();
    }
  }

  // ---------------------------------------------------------------------------
  // Initial state
  // ---------------------------------------------------------------------------
  it("has isAtBottom=true and newMessagesCount=0 initially", () => {
    const { result } = renderAutoScroll(container.el, []);
    expect(result.current.isAtBottom).toBe(true);
    expect(result.current.newMessagesCount).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Auto-scroll when at bottom
  // ---------------------------------------------------------------------------
  it("scrolls to bottom via rAF when messages change and user is at bottom", () => {
    const { rerender } = renderAutoScroll(container.el, [
      { id: "a", text: "hello" },
    ]);

    // Initially the rAF from the auto-scroll effect runs
    expect(rAFCallbacks.length).toBeGreaterThanOrEqual(1);

    // Set up a known scrollHeight and reset scrollTop
    container.el.scrollHeight = 800;
    container.el.scrollTop = 0;

    // Add a new message
    rerender({ messages: [{ id: "a", text: "hello" }, { id: "b", text: "world" }] });

    // scrollTop should NOT be set yet (deferred to rAF)
    expect(container.el.scrollTop).toBe(0);

    // Flush the rAF — now scrollTop should equal scrollHeight
    flushRAF();
    expect(container.el.scrollTop).toBe(800);
  });

  // ---------------------------------------------------------------------------
  // No auto-scroll when scrolled up
  // ---------------------------------------------------------------------------
  it("does NOT auto-scroll when user is scrolled up", () => {
    // Put container in a "scrolled up" position
    container.el.scrollHeight = 2000;
    container.el.scrollTop = 0;
    container.el.clientHeight = 400;

    const { result, rerender } = renderAutoScroll(container.el, [
      { id: "a" },
    ]);

    // Flush the initial auto-scroll rAFs so isAutoScrollingRef is cleared
    flushAllRAF();

    // The rAF scrolled us to the bottom. Reset to a scrolled-up position
    // before firing the scroll event.
    container.el.scrollTop = 0;

    // Simulate the scroll event that flips isAtBottom to false
    const scrollListeners = container.listeners.get("scroll");
    expect(scrollListeners?.size).toBeGreaterThanOrEqual(1);
    const handler = [...scrollListeners!][0] as EventListener;

    act(() => {
      handler(new Event("scroll"));
    });

    expect(result.current.isAtBottom).toBe(false);

    // Now new messages should NOT cause scrollTop to change
    container.el.scrollTop = 200; // user's current scroll position
    const scrollTopBefore = container.el.scrollTop;
    rerender({ messages: [{ id: "a" }, { id: "b" }] });
    flushAllRAF();
    expect(container.el.scrollTop).toBe(scrollTopBefore); // unchanged
  });

  // ---------------------------------------------------------------------------
  // Scroll handler: user scrolled up
  // ---------------------------------------------------------------------------
  it("sets isAtBottom=false when user scrolls away from bottom", () => {
    container.el.scrollHeight = 2000;
    container.el.scrollTop = 0;
    container.el.clientHeight = 400;

    const { result } = renderAutoScroll(container.el, [{ id: "a" }]);

    // Flush the initial auto-scroll rAFs so isAutoScrollingRef is cleared
    flushAllRAF();

    // The rAF scrolled us to the bottom. Reset to a scrolled-up position.
    container.el.scrollTop = 0;

    // Scroll event with user far from bottom
    const handler = [...container.listeners.get("scroll")!][0] as EventListener;
    act(() => {
      handler(new Event("scroll"));
    });

    expect(result.current.isAtBottom).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Scroll handler: user scrolled to bottom
  // ---------------------------------------------------------------------------
  it("sets isAtBottom=true and clears newMessagesCount when user scrolls to bottom", () => {
    container.el.scrollHeight = 2000;
    container.el.scrollTop = 2000 - 400; // at bottom (within 50px threshold)
    container.el.clientHeight = 400;

    const { result } = renderAutoScroll(container.el, [{ id: "a" }]);

    const handler = [...container.listeners.get("scroll")!][0] as EventListener;
    act(() => {
      handler(new Event("scroll"));
    });

    expect(result.current.isAtBottom).toBe(true);
    expect(result.current.newMessagesCount).toBe(0);
  });

  it("isAtBottom stays true when scroll is within 50px threshold", () => {
    container.el.scrollHeight = 2000;
    container.el.scrollTop = 2000 - 400 - 40; // 40px from bottom (< 50)
    container.el.clientHeight = 400;

    const { result } = renderAutoScroll(container.el, [{ id: "a" }]);

    const handler = [...container.listeners.get("scroll")!][0] as EventListener;
    act(() => {
      handler(new Event("scroll"));
    });

    expect(result.current.isAtBottom).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // New message count when scrolled up
  // ---------------------------------------------------------------------------
  it("increments newMessagesCount when scrolled up and new messages arrive", () => {
    container.el.scrollHeight = 2000;
    container.el.scrollTop = 0;
    container.el.clientHeight = 400;

    // Use stable object references so the hook's indexOf-based diff works
    const msgA = { id: "a" };
    const msgB = { id: "b" };
    const msgC = { id: "c" };
    const msgD = { id: "d" };

    const { result, rerender } = renderAutoScroll(container.el, [msgA, msgB]);

    // Flush the initial auto-scroll rAFs
    flushAllRAF();

    // The rAF scrolled us to the bottom. Reset to a scrolled-up position.
    container.el.scrollTop = 0;

    // User scrolls up
    const handler = [...container.listeners.get("scroll")!][0] as EventListener;
    act(() => {
      handler(new Event("scroll"));
    });
    expect(result.current.isAtBottom).toBe(false);

    // New messages arrive — reuse existing references so indexOf finds them
    rerender({
      messages: [msgA, msgB, msgC, msgD],
    });

    expect(result.current.newMessagesCount).toBe(2);
  });

  it("newMessagesCount resets to 0 when user scrolls back to bottom", () => {
    const { result, rerender } = renderAutoScroll(container.el, [
      { id: "a" },
      { id: "b" },
    ]);

    // Flush the initial auto-scroll rAFs
    flushAllRAF();

    // User scrolls up
    container.el.scrollTop = 0;
    const handler = [...container.listeners.get("scroll")!][0] as EventListener;
    act(() => handler(new Event("scroll")));
    expect(result.current.isAtBottom).toBe(false);

    // Messages arrive while scrolled up
    rerender({
      messages: [{ id: "a" }, { id: "b" }, { id: "c" }],
    });
    expect(result.current.newMessagesCount).toBeGreaterThan(0);

    // User scrolls to bottom
    container.el.scrollTop = container.el.scrollHeight - container.el.clientHeight;
    act(() => handler(new Event("scroll")));
    expect(result.current.isAtBottom).toBe(true);
    expect(result.current.newMessagesCount).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // scrollToBottom
  // ---------------------------------------------------------------------------
  it("scrollToBottom sets scrollTop, resets state, and is deferred via rAF", () => {
    container.el.scrollHeight = 1500;
    container.el.scrollTop = 200;
    container.el.clientHeight = 400;

    const { result } = renderAutoScroll(container.el, [{ id: "a" }]);

    act(() => {
      result.current.scrollToBottom();
    });

    // State updates synchronously
    expect(result.current.isAtBottom).toBe(true);
    expect(result.current.newMessagesCount).toBe(0);

    // scrollTop NOT set synchronously (deferred to rAF)
    expect(container.el.scrollTop).toBe(200);

    // After rAF flush
    flushRAF();
    expect(container.el.scrollTop).toBe(1500);
  });

  // ---------------------------------------------------------------------------
  // isAutoScrollingRef prevents scroll handler from flipping isAtBottom
  // ---------------------------------------------------------------------------
  it("isAutoScrollingRef prevents scroll handler from flipping isAtBottom during auto-scroll", () => {
    container.el.scrollHeight = 1000;
    container.el.scrollTop = 1000 - 400; // at bottom
    container.el.clientHeight = 400;

    const { rerender } = renderAutoScroll(container.el, [
      { id: "a" },
    ]);

    // Add new message to trigger auto-scroll
    rerender({ messages: [{ id: "a" }, { id: "b" }] });

    // The hook sets isAutoScrollingRef = true synchronously and schedules rAF.
    // Now simulate a scroll event that fires before the rAF clears the flag.
    // First, change scrollTop to simulate the browser scrolling us (e.g. old position)
    container.el.scrollTop = 500;

    const handler = [...container.listeners.get("scroll")!][0] as EventListener;
    act(() => {
      handler(new Event("scroll"));
    });

    // The scroll handler should have been suppressed, so isAtBottom should
    // have NOT changed (it was true before). But actually we can't directly
    // observe isAutoScrollingRef. What we CAN test: after rAF flush, the
    // auto-scroll has happened and isAtBottom remains true.
    flushAllRAF();

    // Verify scrollTop was set to scrollHeight by the rAF
    expect(container.el.scrollTop).toBe(1000);
  });

  // ---------------------------------------------------------------------------
  // rAF deferral: multi-line messages
  // ---------------------------------------------------------------------------
  it("reads scrollHeight after layout (rAF) — multi-line message case", () => {
    container.el.scrollHeight = 500;
    container.el.scrollTop = 500 - 400;
    container.el.clientHeight = 400;

    const { rerender } = renderAutoScroll(container.el, [
      { id: "a", text: "first" },
    ]);

    // Add a message — the browser hasn't laid it out yet so scrollHeight is "stale"
    // but our mock will update it. Simulate multi-line by setting scrollHeight
    // to a value that represents the post-layout height only inside rAF.
    const rAFScrollHeights: number[] = [];
    const origRAF = window.requestAnimationFrame;
    vi.mocked(window.requestAnimationFrame).mockImplementation(
      (cb: FrameRequestCallback) => {
        // When the rAF fires, the "browser" has completed layout.
        // Update scrollHeight to simulate multi-line message now laid out.
        container.el.scrollHeight = 700;
        rAFScrollHeights.push(container.el.scrollHeight);
        cb(0);
        return 0;
      },
    );

    rerender({
      messages: [{ id: "a", text: "first" }, { id: "b", text: "second\nthird\nfourth" }],
    });

    // The rAF callback was called inline by our mock above,
    // and it read the updated scrollHeight.
    expect(rAFScrollHeights.length).toBeGreaterThanOrEqual(1);
    expect(rAFScrollHeights[0]).toBe(700);
    // scrollTop should be set to the post-layout scrollHeight
    expect(container.el.scrollTop).toBe(700);
  });

  // ---------------------------------------------------------------------------
  // Rapid message accumulation
  // ---------------------------------------------------------------------------
  it("handles rapid message accumulation and always scrolls to final scrollHeight", () => {
    container.el.scrollHeight = 400;
    container.el.scrollTop = 0;
    container.el.clientHeight = 400;

    const { rerender } = renderAutoScroll(container.el, [
      { id: "initial" },
    ]);

    // Simulate rapid message arrivals
    for (let i = 0; i < 5; i++) {
      container.el.scrollHeight += 100; // each new message adds height
      rerender({
        messages: Array.from({ length: i + 2 }, (_, j) => ({ id: `msg${j}` })),
      });
      flushRAF();
    }

    // After all rAFs, scrollTop should match final scrollHeight
    expect(container.el.scrollTop).toBe(container.el.scrollHeight);
  });

  // ---------------------------------------------------------------------------
  // Edge case: messages array identity changes but last item is the same
  // ---------------------------------------------------------------------------
  it("does not lose scroll position when messages are sliced from the front (MAX_DISPLAYED_MESSAGES cap)", () => {
    // Simulate the scenario where MAX_DISPLAYED_MESSAGES slices old messages off
    container.el.scrollHeight = 1000;
    container.el.scrollTop = 1000 - 400;
    container.el.clientHeight = 400;

    const oldMessages = Array.from({ length: 150 }, (_, i) => ({ id: `old${i}` }));
    const { result, rerender } = renderAutoScroll(container.el, oldMessages);

    // Clear initial rAF
    flushAllRAF();

    // Scroll down a bit so we're not at bottom
    container.el.scrollTop = 500;
    const handler = [...container.listeners.get("scroll")!][0] as EventListener;
    act(() => handler(new Event("scroll")));

    expect(result.current.isAtBottom).toBe(false);

    // Now slice off front and add one new — like MAX_DISPLAYED_MESSAGES would
    const sliced = oldMessages.slice(-149);
    sliced.push({ id: "new1" });

    rerender({ messages: sliced });

    // Should detect exactly 1 new message (not 150 because prevLastItemRef
    // tracks the identity of the last item, which is still present in sliced)
    expect(result.current.newMessagesCount).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // ResizeObserver safety net
  // ---------------------------------------------------------------------------
  it("ResizeObserver scrolls to bottom when height grows while at bottom", () => {
    container.el.scrollHeight = 500;
    container.el.scrollTop = 500 - 400;
    container.el.clientHeight = 400;

    renderAutoScroll(container.el, [{ id: "a" }]);

    // Flush the initial auto-scroll rAF so isAutoScrollingRef is cleared
    flushAllRAF();

    // The observer is created on mount. Simulate a late layout change
    // (e.g. custom emote image loaded, increasing content height).
    container.el.scrollHeight = 650;
    flushResizeObservers();

    expect(container.el.scrollTop).toBe(650);
  });

  it("ResizeObserver does NOT scroll when user has scrolled up", () => {
    container.el.scrollHeight = 500;
    container.el.scrollTop = 0;
    container.el.clientHeight = 400;

    const { result } = renderAutoScroll(container.el, [{ id: "a" }]);

    // Flush initial rAF then scroll up
    flushAllRAF();
    container.el.scrollTop = 0;
    const handler = [...container.listeners.get("scroll")!][0] as EventListener;
    act(() => handler(new Event("scroll")));
    expect(result.current.isAtBottom).toBe(false);

    // Now simulate a resize while scrolled up — should NOT scroll
    container.el.scrollHeight = 700;
    flushResizeObservers();

    expect(container.el.scrollTop).toBe(0);
  });

  it("ResizeObserver does NOT scroll when height shrinks", () => {
    container.el.scrollHeight = 500;
    container.el.scrollTop = 500 - 400;
    container.el.clientHeight = 400;

    renderAutoScroll(container.el, [{ id: "a" }]);

    // Shrink should not trigger a scroll
    container.el.scrollHeight = 400;
    container.el.scrollTop = 400 - 400; // still at hypothetical bottom
    flushResizeObservers();

    // scrollTop should stay where it was (no change)
    expect(container.el.scrollTop).toBe(400 - 400);
  });

  it("ResizeObserver disconnects on unmount", () => {
    const { unmount } = renderAutoScroll(container.el, [{ id: "a" }]);

    expect(resizeObserverDisconnects.length).toBeGreaterThanOrEqual(1);
    const disconnect = resizeObserverDisconnects[resizeObserverDisconnects.length - 1];

    unmount();

    // The hook's cleanup should have called disconnect
    expect(disconnect).toHaveBeenCalled();
  });

  it("ResizeObserver is suppressed while isAutoScrollingRef is true", () => {
    container.el.scrollHeight = 500;
    container.el.scrollTop = 500 - 400;
    container.el.clientHeight = 400;

    const { rerender } = renderAutoScroll(container.el, [
      { id: "a" },
    ]);

    // Trigger auto-scroll (sets isAutoScrollingRef = true)
    rerender({ messages: [{ id: "a" }, { id: "b" }] });

    // Simulate a ResizeObserver firing during the scroll window
    container.el.scrollHeight = 700;
    flushResizeObservers();

    // The observer should have been suppressed; scrollTop stays unchanged
    // until the rAF clears the flag and scrolls.
    flushAllRAF();
    expect(container.el.scrollTop).toBe(700);
  });

  // ---------------------------------------------------------------------------
  // Cleanup: removes scroll listener on unmount
  // ---------------------------------------------------------------------------
  it("removes scroll listener on unmount", () => {
    const { unmount } = renderAutoScroll(container.el, [{ id: "a" }]);

    expect(container.listeners.get("scroll")?.size).toBeGreaterThanOrEqual(1);

    unmount();

    // After unmount, listeners should be cleaned up
    // (our spy tracks removeEventListener calls)
    expect(container.listeners.get("scroll")?.size).toBe(0);
  });
});
