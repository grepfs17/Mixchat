import { describe, it, expect, beforeEach, afterEach, vi as rawVi } from "vitest";
import { act, fireEvent, render, renderHook, waitFor } from "@testing-library/react";
import { useMusicPlayer } from "../../src/hooks/chat/useMusicPlayer";
import {
  _resetForTests,
  loadAllPlaylists,
  loadSettings,
} from "../../src/lib/musicPlayer/idb";
import { VideoValidationError } from "../../src/lib/songQueue/oembed";
import MusicPlayerPanel from "../../src/components/chat/shared/MusicPlayerPanel";
import type { UseMusicPlayerResult } from "../../src/hooks/chat/useMusicPlayer";
import {
  IDBFactory,
  IDBKeyRange,
  IDBDatabase,
  IDBTransaction,
  IDBRequest,
  IDBOpenDBRequest,
  IDBCursor,
  IDBCursorWithValue,
} from "fake-indexeddb";

beforeEach(async () => {
  // fresh IDB factory for each test
  const factory = new IDBFactory();
  (globalThis as any).indexedDB = factory;
  (globalThis as any).IDBKeyRange = IDBKeyRange;
  (globalThis as any).IDBDatabase = IDBDatabase;
  (globalThis as any).IDBTransaction = IDBTransaction;
  (globalThis as any).IDBRequest = IDBRequest;
  (globalThis as any).IDBOpenDBRequest = IDBOpenDBRequest;
  (globalThis as any).IDBCursor = IDBCursor;
  (globalThis as any).IDBCursorWithValue = IDBCursorWithValue;
  // Drop the cached openPromise from any prior test so the new factory
  // is used. Without this, writes against the new factory would route
  // through a connection belonging to a discarded database.
  _resetForTests();
});

afterEach(() => {
  delete (globalThis as any).indexedDB;
  delete (globalThis as any).IDBKeyRange;
  delete (globalThis as any).IDBDatabase;
  delete (globalThis as any).IDBTransaction;
  delete (globalThis as any).IDBRequest;
  delete (globalThis as any).IDBOpenDBRequest;
  delete (globalThis as any).IDBCursor;
  delete (globalThis as any).IDBCursorWithValue;
  _resetForTests();
});

async function waitForHydration(result: { current: UseMusicPlayerResult }) {
  await waitFor(() => expect(result.current.hydrated).toBe(true));
}

/**
 * Wrap @testing-library/react's renderHook `result.current` in a Proxy
 * so consumers (e.g. the panel) read the latest values from each render.
 * Spreading `{ ...result.current }` would snapshot stale values and
 * give React a stable but never-updated `player` prop.
 */
function livePlayer(
  result: { current: UseMusicPlayerResult },
): UseMusicPlayerResult {
  return new Proxy({} as UseMusicPlayerResult, {
    get(_target, prop) {
      const value = (result.current as any)[prop];
      // Bind function refs to the live object so closures captured at
      // playback mutation time still hit fresh state.
      return typeof value === "function" ? value.bind(result.current) : value;
    },
  }) as UseMusicPlayerResult;
}

async function mockFetchOEmbed() {
  const oembedModule = await import("../../src/lib/songQueue/oembed");
  return rawVi
    .spyOn(oembedModule, "fetchVideoMeta")
    .mockImplementation(async (id: string) => ({
      videoId: id,
      title: "Mock Title",
      channelTitle: "Mock Channel",
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    }));
}

async function seedPlaylistsViaHook(
  items: Array<{
    name: string;
    videos?: string[];
  }>,
) {
  const oembedSpy = await mockFetchOEmbed();
  try {
    const { result } = renderHook(() => useMusicPlayer());
    await waitForHydration(result);
    for (const entry of items) {
      act(() => {
        result.current.createPlaylist(entry.name);
      });
      const pl = result.current.activePlaylist!;
      for (const videoId of entry.videos ?? []) {
        await act(async () => {
          await result.current.addTrackFromUrl(
            `https://youtu.be/${videoId}`,
            pl.id,
          );
        });
      }
    }
    return result;
  } finally {
    oembedSpy.mockRestore();
  }
}

describe("useMusicPlayer", () => {
  it("creates a new playlist and selects it as active", async () => {
    const { result } = renderHook(() => useMusicPlayer());
    await waitForHydration(result);
    act(() => {
      result.current.createPlaylist("Friday Night Mix");
    });
    expect(result.current.playlists).toHaveLength(1);
    expect(result.current.activePlaylist?.name).toBe("Friday Night Mix");
    expect(result.current.currentIndex).toBe(0);
    expect(result.current.currentItem).toBeNull();

    // Persisted to IDB.
    const stored = await loadAllPlaylists();
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("Friday Night Mix");
    const settings = await loadSettings();
    expect(settings.activePlaylistId).toBe(stored[0].id);
  });

  it("switches the active playlist and resets currentIndex", async () => {
    const { result } = renderHook(() => useMusicPlayer());
    await waitForHydration(result);
    act(() => {
      result.current.createPlaylist("first");
    });
    const firstId = result.current.activePlaylist!.id;
    act(() => {
      result.current.createPlaylist("second");
    });
    const secondId = result.current.activePlaylist!.id;
    expect(secondId).not.toBe(firstId);

    act(() => {
      result.current.setActivePlaylist(firstId);
    });
    expect(result.current.activePlaylist?.id).toBe(firstId);
    expect(result.current.currentIndex).toBe(0);
  });

  it("rejects an invalid URL on addTrackFromUrl and surfaces the error", async () => {
    const { result } = renderHook(() => useMusicPlayer());
    await waitForHydration(result);
    act(() => {
      result.current.createPlaylist("Friday Night Mix");
    });
    await act(async () => {
      await result.current.addTrackFromUrl("not a youtube link");
    });
    expect(result.current.error).toMatch(/Not a valid YouTube/);
    expect(result.current.activePlaylist?.items).toHaveLength(0);
  });

  it("adds a valid YouTube URL and stores the oEmbed metadata", async () => {
    const spy = await mockFetchOEmbed();
    try {
      const { result } = renderHook(() => useMusicPlayer());
      await waitForHydration(result);
      act(() => {
        result.current.createPlaylist("Friday Night Mix");
      });
      await act(async () => {
        await result.current.addTrackFromUrl("https://youtu.be/dQw4w9WgXcQ");
      });
      expect(result.current.error).toBeNull();
      expect(result.current.activePlaylist?.items).toHaveLength(1);
      const item = result.current.activePlaylist!.items[0];
      expect(item.title).toBe("Mock Title");
      expect(item.channelTitle).toBe("Mock Channel");
      expect(item.videoId).toBe("dQw4w9WgXcQ");

      const stored = await loadAllPlaylists();
      expect(stored[0].items).toHaveLength(1);
      expect(stored[0].items[0].videoId).toBe("dQw4w9WgXcQ");
    } finally {
      spy.mockRestore();
    }
  });

  it("surfaces a VideoValidationError when oEmbed fails", async () => {
    const oembedModule = await import("../../src/lib/songQueue/oembed");
    const spy = rawVi
      .spyOn(oembedModule, "fetchVideoMeta")
      .mockImplementation(async () => {
        throw new VideoValidationError(
          "unembeddable",
          "This video cannot be embedded.",
        );
      });
    try {
      const { result } = renderHook(() => useMusicPlayer());
      await waitForHydration(result);
      act(() => {
        result.current.createPlaylist("Friday Night Mix");
      });
      await act(async () => {
        await result.current.addTrackFromUrl("https://youtu.be/dQw4w9WgXcQ");
      });
      expect(result.current.error).toBe("This video cannot be embedded.");
      expect(result.current.activePlaylist?.items).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });

  it("captures the target playlist id at click-time (regression: empty-state ghost)", async () => {
    // Regression for the user-reported bug: the empty-state used to
    // call createPlaylist twice and addTrackFromUrl would bounce off
    // the stale `state.activePlaylistId = null` closure. Fix: the
    // panel now passes the just-created playlist id explicitly.
    const spy = await mockFetchOEmbed();
    try {
      const { result } = renderHook(() => useMusicPlayer());
      await waitForHydration(result);
      const newPlaylist = result.current.createPlaylist("Friday Night Mix");
      await act(async () => {
        await result.current.addTrackFromUrl(
          "https://youtu.be/dQw4w9WgXcQ",
          newPlaylist.id,
        );
      });

      expect(result.current.playlists).toHaveLength(1);
      expect(result.current.playlists[0].name).toBe("Friday Night Mix");
      expect(result.current.playlists[0].items).toHaveLength(1);
      expect(result.current.error).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it("addTrackFromUrl rejects duplicate videoIds in the same playlist", async () => {
    const spy = await mockFetchOEmbed();
    try {
      const { result } = renderHook(() => useMusicPlayer());
      await waitForHydration(result);
      act(() => {
        result.current.createPlaylist("dupes");
      });
      await act(async () => {
        await result.current.addTrackFromUrl("https://youtu.be/dQw4w9WgXcQ");
      });
      expect(result.current.activePlaylist?.items).toHaveLength(1);

      await act(async () => {
        await result.current.addTrackFromUrl("https://youtu.be/dQw4w9WgXcQ");
      });
      expect(result.current.activePlaylist?.items).toHaveLength(1);
      expect(result.current.error).toMatch(/already in the playlist/);
    } finally {
      spy.mockRestore();
    }
  });

  it("playTrackIndex clamps out-of-range indices", async () => {
    const result = await seedPlaylistsViaHook([
      { name: "p", videos: ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"] },
    ]);
    act(() => {
      result.current.playTrackIndex(99);
    });
    expect(result.current.currentIndex).toBe(2);
    expect(result.current.currentItem?.videoId).toBe("ccccccccccc");
    act(() => {
      result.current.playTrackIndex(-5);
    });
    expect(result.current.currentIndex).toBe(0);
  });

  it("next() loops to start when loop is on, stops when loop is off", async () => {
    const result = await seedPlaylistsViaHook([
      {
        name: "pl",
        videos: ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"],
      },
    ]);
    act(() => {
      result.current.playTrackIndex(2);
    });
    expect(result.current.loop).toBe(true);
    expect(result.current.currentIndex).toBe(2);
    act(() => {
      result.current.next();
    });
    expect(result.current.currentIndex).toBe(0);

    act(() => {
      result.current.setLoop(false);
    });
    act(() => {
      result.current.playTrackIndex(2);
    });
    act(() => {
      result.current.next();
    });
    expect(result.current.currentIndex).toBe(2);
  });

  it("previous() wraps to the last track when at the start", async () => {
    const result = await seedPlaylistsViaHook([
      { name: "pl", videos: ["aaaaaaaaaaa", "bbbbbbbbbbb"] },
    ]);
    act(() => {
      result.current.previous();
    });
    expect(result.current.currentIndex).toBe(1);
  });

  it("removeTrack on the active track keeps the next slot playing", async () => {
    const result = await seedPlaylistsViaHook([
      { name: "pl", videos: ["aaaaaaaaaaa", "bbbbbbbbbbb"] },
    ]);
    const trackId = result.current.activePlaylist!.items[0].id;
    act(() => {
      result.current.removeTrack(trackId);
    });
    expect(result.current.activePlaylist?.items).toHaveLength(1);
    expect(result.current.activePlaylist?.items[0].videoId).toBe(
      "bbbbbbbbbbb",
    );
    expect(result.current.currentIndex).toBe(0);
    expect(result.current.currentItem?.videoId).toBe("bbbbbbbbbbb");
  });

  it("removeTrack shifts currentIndex down when removing a track before it", async () => {
    const result = await seedPlaylistsViaHook([
      {
        name: "pl",
        videos: ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"],
      },
    ]);
    act(() => {
      result.current.playTrackIndex(2);
    });
    const firstId = result.current.activePlaylist!.items[0].id;
    act(() => {
      result.current.removeTrack(firstId);
    });
    expect(result.current.activePlaylist?.items).toHaveLength(2);
    expect(result.current.currentIndex).toBe(1);
  });

  it("reorderTracks keeps the active track on the active item", async () => {
    const result = await seedPlaylistsViaHook([
      {
        name: "pl",
        videos: ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"],
      },
    ]);
    const items = result.current.activePlaylist!.items;
    act(() => {
      result.current.reorderTracks(items[0].id, items[2].id);
    });
    const newItems = result.current.activePlaylist!.items;
    expect(newItems.map((it) => it.id)).toEqual([
      items[1].id,
      items[2].id,
      items[0].id,
    ]);
    expect(result.current.currentIndex).toBe(2);
    expect(result.current.currentItem?.id).toBe(items[0].id);
  });

  it("deletePlaylist falls back to the next available playlist", async () => {
    const { result } = renderHook(() => useMusicPlayer());
    await waitForHydration(result);
    act(() => {
      result.current.createPlaylist("alpha");
    });
    const alphaId = result.current.activePlaylist!.id;
    act(() => {
      result.current.createPlaylist("beta");
    });
    const betaId = result.current.activePlaylist!.id;

    act(() => {
      result.current.setActivePlaylist(alphaId);
    });
    act(() => {
      result.current.deletePlaylist(alphaId);
    });

    await waitFor(() => expect(result.current.activePlaylist?.id).toBe(betaId));
    expect(result.current.playlists.map((p) => p.id)).toEqual([betaId]);
  });

  it("deletePlaylist of the only remaining playlist clears the active pointer", async () => {
    const { result } = renderHook(() => useMusicPlayer());
    await waitForHydration(result);
    act(() => {
      const p = result.current.createPlaylist("solo");
      result.current.deletePlaylist(p.id);
    });
    await waitFor(() => expect(result.current.activePlaylist).toBeNull());
    expect(result.current.playlists).toHaveLength(0);
  });

  it("uses default settings when the settings row is missing", async () => {
    const { result } = renderHook(() => useMusicPlayer());
    await waitForHydration(result);
    expect(result.current.volume).toBe(100);
    expect(result.current.loop).toBe(true);
  });

  it("persists state across unmount + remount", async () => {
    const oembedSpy = await mockFetchOEmbed();
    try {
      const { result, unmount } = renderHook(() => useMusicPlayer());
      await waitForHydration(result);
      act(() => {
        result.current.createPlaylist("persistent");
      });
      const id = result.current.activePlaylist!.id;
      await act(async () => {
        await result.current.addTrackFromUrl(
          "https://youtu.be/dQw4w9WgXcQ",
          id,
        );
      });
      unmount();

      const { result: r2 } = renderHook(() => useMusicPlayer());
      await waitForHydration(r2);
      expect(r2.current.activePlaylist?.name).toBe("persistent");
      expect(r2.current.activePlaylist?.items).toHaveLength(1);
    } finally {
      oembedSpy.mockRestore();
    }
  });

  it("auto-heals a dangling activePlaylistId after deletion", async () => {
    // Pre-seed a settings row whose activePlaylistId doesn't match any
    // persisted playlist so auto-heal rebuilds the pointer.
    const mod = await import("../../src/lib/musicPlayer/idb");
    await mod.saveSettings({
      activePlaylistId: "definitely-does-not-exist",
      currentIndex: 0,
      volume: 100,
      loop: true,
      miniBarHidden: false,
    });
    const now = new Date().toISOString();
    await mod.savePlaylist({
      id: "healthy",
      name: "healthy",
      items: [],
      createdAt: now,
      updatedAt: now,
      categoryId: null,
      categoryName: "",
    });

    const { result } = renderHook(() => useMusicPlayer());
    await waitForHydration(result);
    expect(result.current.activePlaylist?.id).toBe("healthy");
  });

  it("hideMiniBar persists across unmount + remount", async () => {
    const { result, unmount } = renderHook(() => useMusicPlayer());
    await waitForHydration(result);
    act(() => {
      result.current.createPlaylist("test");
    });
    expect(result.current.miniBarHidden).toBe(false);

    act(() => {
      result.current.hideMiniBar();
    });
    expect(result.current.miniBarHidden).toBe(true);

    // Persisted to IDB across remount.
    unmount();
    const { result: r2, unmount: unmount2 } = renderHook(() => useMusicPlayer());
    await waitForHydration(r2);
    expect(r2.current.miniBarHidden).toBe(true);

    act(() => {
      r2.current.showMiniBar();
    });
    expect(r2.current.miniBarHidden).toBe(false);

    // showMiniBar also persists.
    unmount2();
    const { result: r3 } = renderHook(() => useMusicPlayer());
    await waitForHydration(r3);
    expect(r3.current.miniBarHidden).toBe(false);
  });
});

describe("MusicPlayerPanel auto-select", () => {
  it("auto-selects the playlist whose categoryId matches streamGameId", async () => {
    const { result } = renderHook(() => useMusicPlayer());
    await waitForHydration(result);

    // Create two playlists: one tagged with a category, one not.
    act(() => {
      result.current.createPlaylist("Chill");
    });
    const chillId = result.current.activePlaylist!.id;
    act(() => {
      result.current.setPlaylistCategory(
        chillId,
        "chill-category",
        "Chill Category",
      );
    });

    // Create second playlist — becomes the active one.
    act(() => {
      result.current.createPlaylist("Hype");
    });
    expect(result.current.activePlaylist?.name).toBe("Hype");

    // Render the panel with a matching streamGameId.
    const player = livePlayer(result);
    const { unmount } = render(
      <MusicPlayerPanel
        player={player}
        streamGameId="chill-category"
        streamGameName="Chill Category"
      />,
    );

    // The panel should have auto-selected the Chill playlist.
    await waitFor(() =>
      expect(result.current.activePlaylist?.id).toBe(chillId),
    );
    unmount();
  });

  it("does not auto-select when streamGameId does not match any playlist", async () => {
    const { result } = renderHook(() => useMusicPlayer());
    await waitForHydration(result);

    act(() => {
      result.current.createPlaylist("Only One");
    });
    act(() => {
      result.current.setPlaylistCategory(
        result.current.activePlaylist!.id,
        "some-category",
        "Some Category",
      );
    });

    const player = livePlayer(result);
    render(
      <MusicPlayerPanel
        player={player}
        streamGameId="different-category"
        streamGameName="Different"
      />,
    );

    // The active playlist should remain unchanged.
    expect(result.current.activePlaylist?.name).toBe("Only One");
  });
});

describe("MusicPlayerPanel empty-state regression", () => {
  // Regression for the user-reported bug:
  //   - clicking "Create playlist" used to add a hardcoded second
  //     "My playlist" in addition to the typed-name playlist
  //   - the URL after that used to bounce off the stale closure and show
  //     "Create or select a playlist first"
  // The fix drops the duplicate createPlaylist and passes the just-
  // created playlist id into addTrackFromUrl.

  it("creates one named playlist and routes the first URL into it (no ghost)", async () => {
    const spy = await mockFetchOEmbed();
    try {
      const { result, unmount } = renderHook(() => useMusicPlayer());
      await waitForHydration(result);
      const player = livePlayer(result);
      render(<MusicPlayerPanel player={player} />);

      const nameInput = await waitFor(() => {
        const el = document.querySelector(
          'input[placeholder="e.g. Friday Night Mix"]',
        );
        if (!el) throw new Error("name input not yet rendered");
        return el as HTMLInputElement;
      });
      fireEvent.change(nameInput, {
        target: { value: "Friday Night Mix" },
      });
      const urlInput = await waitFor(() => {
        const el = document.querySelector(
          'input[placeholder="https://www.youtube.com/watch?v=…"]',
        );
        if (!el) throw new Error("url input not yet rendered");
        return el as HTMLInputElement;
      });
      fireEvent.change(urlInput, {
        target: { value: "https://youtu.be/dQw4w9WgXcQ" },
      });

      const submit = document.querySelector(
        "button.music-player-btn--primary",
      ) as HTMLButtonElement;
      expect(submit).toBeTruthy();
      fireEvent.click(submit);

      await waitFor(() => expect(result.current.playlists.length).toBe(1));
      await waitFor(() =>
        expect(result.current.activePlaylist?.items.length).toBe(1),
      );

      await act(async () => {
        expect(result.current.playlists).toHaveLength(1);
        expect(result.current.playlists[0].name).toBe("Friday Night Mix");
        expect(result.current.activePlaylist?.items[0]?.videoId).toBe(
          "dQw4w9WgXcQ",
        );
        expect(result.current.error).toBeNull();
      });
      unmount();
    } finally {
      spy.mockRestore();
    }
  });
});
