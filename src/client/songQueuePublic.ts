/**
 * Client-side logic for the public song-queue page (`/s/[sessionId].astro`).
 *
 * Lives in its own module so the Astro page can stay declarative and so
 * the helpers can be unit-tested with JSDOM.
 */

export interface PublicListItem {
  id: string;
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  status: string;
  submitter: { author: string; platform: "twitch" | "youtube" };
}

export interface PublicViewLite {
  version: number;
  currentIndex: number;
  videoIds: string[];
  ended: boolean;
}

/**
 * Shape of the YouTube IFrame Player API player instance we touch from
 * the public page. Loosely typed because the IFrame API injects
 * `window.YT` at runtime; we only need a couple of methods.
 */
export interface YTPlayerLite {
  playVideoAt(index: number): void;
  loadVideoById(videoId: string): void;
  playVideo(): void;
}

/**
 * Builds the queue list HTML. The caller fills text slots via
 * textContent (data-roles mark them) so server strings can't break
 * the markup.
 */
export function renderListHtml(
  items: PublicListItem[],
  currentIndex: number,
): string {
  return items
    .map((it, i) => {
      const classes = i === currentIndex ? "current" : "";
      const videoUrl = `https://www.youtube.com/watch?v=${it.videoId}`;
      return `
        <li data-id="${it.id}" data-index="${i}" data-video-id="${it.videoId}" data-status="${it.status}" class="${classes}">
          <img class="thumb" alt="" data-thumb-src="${escapeAttr(it.thumbnail)}" />
          <div class="meta">
            <span class="title" data-role="title"></span>
            <span class="sub" data-role="sub"></span>
          </div>
          <div class="actions">
            <button type="button" class="action-btn action-btn--play" data-role="play" data-index="${i}" data-video-id="${it.videoId}" title="Play this song in the queue">▶ Play</button>
            <button type="button" class="action-btn action-btn--copy" data-role="copy" data-video-url="${escapeAttr(videoUrl)}" title="Copy YouTube link" aria-label="Copy link">Copy</button>
          </div>
        </li>`;
    })
    .join("");
}

function escapeAttr(s: string): string {
  // Defensive only — values are server-validated 11-char ids or
  // https://i.ytimg.com URLs.
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * Attach click handlers to the copy buttons. Idempotent via a
 * `data-bound` flag so re-renders don't pile up listeners.
 */
export function bindCopyHandlers(
  listEl: HTMLElement,
  onCopy: (ok: boolean, url: string) => void,
): void {
  const buttons = listEl.querySelectorAll<HTMLElement>('[data-role="copy"]');
  buttons.forEach((btn) => {
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const url = btn.dataset.videoUrl || "";
      if (!url) return;
      copyToClipboard(url).then((ok) => onCopy(ok, url));
    });
  });
}

/**
 * Buffers play() calls until the player is ready, and collapses rapid
 * clicks to the latest target. Only the most recent pending call wins.
 */
export interface PlayController {
  /** Request that the player jump to a specific item. */
  play(index: number, videoId: string): void;
  /** Replace the underlying player (called after the IFrame API is ready). */
  setPlayer(player: YTPlayerLite | null): void;
}

export function createPlayController(): PlayController {
  let player: YTPlayerLite | null = null;
  let pending: { index: number; videoId: string } | null = null;

  const flush = () => {
    if (!player || pending == null) return;
    const { videoId } = pending;
    pending = null;
    try {
      // loadVideoById works whether or not a playlist is loaded.
      player.loadVideoById(videoId);
      player.playVideo();
    } catch {
      /* not ready yet — try again on the next setPlayer */
    }
  };

  return {
    play(index, videoId) {
      pending = { index, videoId };
      flush();
    },
    setPlayer(p) {
      player = p;
      flush();
    },
  };
}

/**
 * Wire the per-item ▶ Play buttons. A null controller (player never
 * loaded) makes the click a no-op.
 */
export function bindPlayHandlers(
  listEl: HTMLElement,
  controller: PlayController | null,
  onPlay: (index: number) => void,
): void {
  const buttons =
    listEl.querySelectorAll<HTMLButtonElement>('[data-role="play"]');
  buttons.forEach((btn) => {
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const raw = btn.dataset.index;
      const videoId = btn.dataset.videoId;
      if (raw == null || !videoId) return;
      const index = Number.parseInt(raw, 10);
      if (Number.isNaN(index)) return;
      // Update the visual highlight right away, before the IFrame catches up.
      markCurrent(listEl, index);
      onPlay(index);
      if (controller) controller.play(index, videoId);
    });
  });
}

/** Mark the <li> at `index` as the current item. */
export function markCurrent(listEl: HTMLElement, index: number): void {
  const items = listEl.querySelectorAll<HTMLLIElement>("li");
  items.forEach((li, i) => {
    li.classList.toggle("current", i === index);
  });
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof window !== "undefined" &&
    window.isSecureContext
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
  // Fallback for plain http://localhost or older browsers.
  if (typeof document === "undefined") return false;
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

/** Show a transient toast at the bottom of the screen. */
export function showToast(message: string, ttlMs = 1700): () => void {
  if (typeof document === "undefined") return () => {};
  const existing = document.getElementById("song-queue-toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.id = "song-queue-toast";
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  const t = window.setTimeout(() => toast.remove(), ttlMs);
  return () => {
    window.clearTimeout(t);
    toast.remove();
  };
}

/** e.g. "Mar 12, 2026 at 14:07" in the viewer's local timezone. */
export function formatPlaylistCreatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} at ${time}`;
}
