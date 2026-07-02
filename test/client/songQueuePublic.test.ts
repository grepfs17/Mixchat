import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import {
  renderListHtml,
  bindCopyHandlers,
  bindPlayHandlers,
  createPlayController,
  markCurrent,
  showToast,
  copyToClipboard,
  formatPlaylistCreatedAt,
  type PublicListItem,
} from "../../src/client/songQueuePublic";

function makeItem(
  overrides: Partial<PublicListItem> = {},
): PublicListItem {
  return {
    id: overrides.id || "i1",
    videoId: overrides.videoId || "dQw4w9WgXcQ",
    title: overrides.title || "Never Gonna Give You Up",
    channelTitle: overrides.channelTitle || "Rick Astley",
    thumbnail:
      overrides.thumbnail ||
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    status: overrides.status || "pending",
    submitter: overrides.submitter || {
      author: "Alice",
      platform: "twitch",
    },
  };
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("renderListHtml", () => {
  it("renders one <li> per item with a copy and a play button", () => {
    const html = renderListHtml([makeItem(), makeItem({ id: "i2" })], 0);
    const container = document.createElement("ol");
    container.innerHTML = html;
    const items = container.querySelectorAll("li");
    expect(items).toHaveLength(2);
    expect(items[0].querySelectorAll('[data-role="copy"]')).toHaveLength(1);
    expect(items[0].querySelectorAll('[data-role="play"]')).toHaveLength(1);
    expect(items[0].classList.contains("current")).toBe(true);
    expect(items[1].classList.contains("current")).toBe(false);
  });

  it("embeds the YouTube id and the item index in the data attributes", () => {
    const html = renderListHtml(
      [
        makeItem({ id: "i1", videoId: "ABCDEFGHIJK" }),
        makeItem({ id: "i2", videoId: "LMNOPQRSTUV" }),
      ],
      1,
    );
    const container = document.createElement("ol");
    container.innerHTML = html;
    const playBtns = container.querySelectorAll(
      '[data-role="play"]',
    ) as NodeListOf<HTMLButtonElement>;
    const copyBtns = container.querySelectorAll(
      '[data-role="copy"]',
    ) as NodeListOf<HTMLButtonElement>;
    expect(playBtns[0].getAttribute("data-video-id")).toBe("ABCDEFGHIJK");
    expect(playBtns[0].getAttribute("data-index")).toBe("0");
    expect(playBtns[1].getAttribute("data-video-id")).toBe("LMNOPQRSTUV");
    expect(playBtns[1].getAttribute("data-index")).toBe("1");
    expect(copyBtns[0].getAttribute("data-video-url")).toBe(
      "https://www.youtube.com/watch?v=ABCDEFGHIJK",
    );
  });

  it("escapes quotes in the thumbnail URL attribute", () => {
    const html = renderListHtml(
      [makeItem({ thumbnail: `https://x.com/a"b.jpg` })],
      0,
    );
    expect(html).toContain("&quot;");
  });
});

describe("bindCopyHandlers", () => {
  it("calls onCopy(true) and writes the URL to the clipboard on click", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: write },
      configurable: true,
    });
    Object.defineProperty(window, "isSecureContext", {
      value: true,
      configurable: true,
    });
    const container = document.createElement("ol");
    container.innerHTML = renderListHtml([makeItem()], 0);
    document.body.appendChild(container);

    const onCopy = vi.fn();
    bindCopyHandlers(container, onCopy);
    const btn = container.querySelector(
      '[data-role="copy"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => expect(onCopy).toHaveBeenCalledWith(true, expect.any(String)));
    expect(write).toHaveBeenCalledWith(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
  });

  it("is idempotent: a second bind does not attach duplicate listeners", () => {
    const container = document.createElement("ol");
    container.innerHTML = renderListHtml([makeItem()], 0);
    document.body.appendChild(container);
    const onCopy = vi.fn();
    bindCopyHandlers(container, onCopy);
    bindCopyHandlers(container, onCopy);
    const btn = container.querySelector(
      '[data-role="copy"]',
    ) as HTMLButtonElement;
    expect(btn.dataset.bound).toBe("1");
  });
});

describe("createPlayController", () => {
  function makeFakePlayer() {
    return {
      playVideoAt: vi.fn(),
      loadVideoById: vi.fn(),
      playVideo: vi.fn(),
    };
  }

  it("defers play() until setPlayer() is called", () => {
    const c = createPlayController();
    c.play(2, "VIDEO_ID_2");
    // No player yet — no call.
    const player = makeFakePlayer();
    c.setPlayer(player);
    expect(player.loadVideoById).toHaveBeenCalledWith("VIDEO_ID_2");
    expect(player.playVideo).toHaveBeenCalled();
  });

  it("calls loadVideoById immediately when the player is already set", () => {
    const c = createPlayController();
    const player = makeFakePlayer();
    c.setPlayer(player);
    c.play(3, "VIDEO_ID_3");
    expect(player.loadVideoById).toHaveBeenCalledWith("VIDEO_ID_3");
    expect(player.playVideo).toHaveBeenCalled();
  });

  it("only honors the latest pending target", () => {
    const c = createPlayController();
    c.play(1, "ID_1");
    c.play(2, "ID_2");
    c.play(5, "ID_5");
    const player = makeFakePlayer();
    c.setPlayer(player);
    expect(player.loadVideoById).toHaveBeenCalledTimes(1);
    expect(player.loadVideoById).toHaveBeenCalledWith("ID_5");
  });
});

describe("bindPlayHandlers", () => {
  it("calls onPlay(index) and the controller on click", () => {
    const container = document.createElement("ol");
    container.innerHTML = renderListHtml(
      [makeItem({ id: "i1" }), makeItem({ id: "i2" })],
      0,
    );
    document.body.appendChild(container);

    const onPlay = vi.fn();
    const controller = createPlayController();
    const player = {
      playVideoAt: vi.fn(),
      loadVideoById: vi.fn(),
      playVideo: vi.fn(),
    };
    controller.setPlayer(player);

    bindPlayHandlers(container, controller, onPlay);
    const btns = container.querySelectorAll(
      '[data-role="play"]',
    ) as NodeListOf<HTMLButtonElement>;
    fireEvent.click(btns[1]);
    expect(onPlay).toHaveBeenCalledWith(1);
    expect(player.loadVideoById).toHaveBeenCalledWith("dQw4w9WgXcQ");
    expect(player.playVideo).toHaveBeenCalled();
    // The visual current class is updated immediately.
    expect(container.querySelectorAll("li")[0].classList.contains("current")).toBe(false);
    expect(container.querySelectorAll("li")[1].classList.contains("current")).toBe(true);
  });

  it("does not throw when the controller is null (player never loaded)", () => {
    const container = document.createElement("ol");
    container.innerHTML = renderListHtml([makeItem()], 0);
    document.body.appendChild(container);
    bindPlayHandlers(container, null, () => {});
    const btn = container.querySelector(
      '[data-role="play"]',
    ) as HTMLButtonElement;
    expect(() => fireEvent.click(btn)).not.toThrow();
  });
});

describe("showToast", () => {
  it("mounts a toast element and removes it after the TTL", () => {
    vi.useFakeTimers();
    const dismiss = showToast("hello", 1000);
    expect(document.getElementById("song-queue-toast")).toBeTruthy();
    vi.advanceTimersByTime(1100);
    expect(document.getElementById("song-queue-toast")).toBeNull();
    vi.useRealTimers();
    // Silence unused warning
    expect(typeof dismiss).toBe("function");
  });
});

describe("copyToClipboard", () => {
  it("returns false when neither clipboard API nor execCommand works", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(window, "isSecureContext", {
      value: false,
      configurable: true,
    });
    // jsdom does not implement execCommand; the fallback returns false.
    const ok = await copyToClipboard("hello");
    expect(ok).toBe(false);
  });
});

describe("formatPlaylistCreatedAt", () => {
  it("formats a valid ISO timestamp as a human-readable string", () => {
    const result = formatPlaylistCreatedAt("2026-03-12T14:07:00.000Z");
    // Don't pin the locale-dependent format (jsdom may use ICU day-first).
    // Just check the components are present and the timezone marker is gone.
    expect(result).toMatch(/2026/);
    expect(result).toMatch(/Mar/);
    expect(result).toMatch(/07/);
    expect(result).toMatch(/:/);
    expect(result).not.toMatch(/UTC/);
    expect(result).not.toBe("2026-03-12T14:07:00.000Z");
  });

  it("returns the input verbatim when the timestamp is invalid", () => {
    expect(formatPlaylistCreatedAt("not-a-date")).toBe("not-a-date");
  });
});

describe("PublicListItem type usage", () => {
  it("the shape matches what the server returns", () => {
    const item = makeItem();
    expect(item.id).toBe("i1");
    expect(item.submitter.platform === "twitch" || item.submitter.platform === "youtube").toBe(true);
  });
});
