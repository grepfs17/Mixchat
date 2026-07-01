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
 * Render the queue list as a string of <li> elements. We pre-escape the
 * inner text fields via the caller, and use data-roles for every text
 * slot so the parent can fill them safely with textContent.
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
  // Minimal escape: only escape characters that could break out of an
  // attribute. Server-validated values are 11-char YouTube ids or
  // https://i.ytimg.com URLs, so this is defensive only.
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * Walk the freshly-rendered list and attach click handlers. Idempotent:
 * each button is tagged with a `data-bound` flag so a re-render does
 * not attach duplicate listeners.
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
 * Resolve a YT.Player. The IFrame Player API exposes the player instance
 * after the `onReady` callback. We hand `resolvePlayer` a function that
 * returns the latest player; if the player isn't ready yet we queue the
 * call until it is. The promise is idempotent — if a play is requested
 * while another is in flight, only the latest target wins.
 */
export interface PlayController {
  /** Request that the player jump to a specific item. */
  play(index: number): void;
  /** Replace the underlying player (called after the IFrame API is ready). */
  setPlayer(player: YTPlayerLite | null): void;
}

export function createPlayController(): PlayController {
  let player: YTPlayerLite | null = null;
  let pending: number | null = null;

  const flush = () => {
    if (!player || pending == null) return;
    const target = pending;
    pending = null;
    try {
      // The IFrame API's playVideoAt takes a zero-based index into the
      // currently-loaded playlist. The player was constructed with
      // listType=playlist + list=videoIds.join(','), so this is safe.
      player.playVideoAt(target);
    } catch {
      // Fallback: if the playlist is not loaded for any reason, load
      // the video directly and start it.
      player.loadVideoById("");
      player.playVideo();
    }
  };

  return {
    play(index) {
      pending = index;
      flush();
    },
    setPlayer(p) {
      player = p;
      flush();
    },
  };
}

/**
 * Wire the per-item ▶ Play buttons. The controller is responsible for
 * routing the click to the right player method. If the controller is
 * `null` (e.g. the player failed to initialise) the click is a no-op.
 */
export function bindPlayHandlers(
  listEl: HTMLElement,
  controller: PlayController | null,
  onPlay: (index: number) => void,
): void {
  const buttons = listEl.querySelectorAll<HTMLButtonElement>(
    '[data-role="play"]',
  );
  buttons.forEach((btn) => {
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const raw = btn.dataset.index;
      if (raw == null) return;
      const index = Number.parseInt(raw, 10);
      if (Number.isNaN(index)) return;
      // Update the visual `current` class immediately so the user
      // sees the selection, even before the IFrame API actually
      // switches tracks.
      markCurrent(listEl, index);
      onPlay(index);
      if (controller) controller.play(index);
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
  // Fallback for non-secure contexts (e.g. plain http://localhost in some
  // setups, older browsers).
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

/**
 * Show a transient toast at the bottom of the screen. The caller is
 * expected to call this with a short string like "Link copied".
 */
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

/**
 * Format a song-playlist created-at timestamp for the public page header.
 * Returns a string like "Mar 12, 2026 at 14:07 UTC".
 */
export function formatPlaylistCreatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Force en-US so the date format is stable across the user's locale
  // (jsdom defaults to ICU which puts day first). The exact "Mar 12, 2026"
  // shape is what the public page contract advertises in the test.
  const date = d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
  return `${date} at ${time} UTC`;
}
