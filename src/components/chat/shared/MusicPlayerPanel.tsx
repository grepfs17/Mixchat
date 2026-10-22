import { useEffect, useRef, useState } from "react";
import {
  FaCheck,
  FaMusic,
  FaPen,
  FaPlay,
  FaPlus,
  FaSearch,
  FaStepBackward,
  FaStepForward,
  FaTag,
  FaTimes,
  FaTrash,
} from "react-icons/fa";
import type { UseMusicPlayerResult } from "../../../hooks/chat/useMusicPlayer";
import type {
  MusicPlayerItem,
  MusicPlaylist,
} from "../../../lib/musicPlayer/types";

interface MusicPlayerPanelProps {
  player: UseMusicPlayerResult;
  /** Current Twitch category id, used to auto-select a matching playlist. */
  streamGameId?: string;
  /** Current Twitch category name, shown in the auto-select chip. */
  streamGameName?: string;
  /** Search Twitch categories (same API as the stream-info category picker). */
  onSearchCategories?: (
    query: string,
  ) => Promise<Array<{ id: string; name: string }>>;
}

type ConfirmAction = null | "clear";

type CategoryOption = { id: string; name: string };

function useCategorySearch(
  onSearchCategories?: (query: string) => Promise<CategoryOption[]>,
) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CategoryOption[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!query.trim() || !onSearchCategories) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const found = await onSearchCategories(query);
      if (!cancelled) {
        setResults(found);
        setOpen(found.length > 0);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, onSearchCategories]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return { query, setQuery, results, setResults, open, setOpen, ref, inputRef };
}

export default function MusicPlayerPanel({
  player,
  streamGameId = "",
  streamGameName = "",
  onSearchCategories,
}: MusicPlayerPanelProps) {
  const {
    hydrated,
    playlists,
    activePlaylist,
    currentItem,
    currentIndex,
    loop,
    miniBarHidden,
    loadingUrl,
    error,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    setActivePlaylist,
    addTrackFromUrl,
    removeTrack,
    reorderTracks,
    playTrackIndex,
    next,
    previous,
    setLoop,
    showMiniBar,
    setPlaylistCategory,
  } = player;

  const [newUrl, setNewUrl] = useState("");
  const [confirm, setConfirm] = useState<ConfirmAction>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const dragOverIdRef = useRef<string | null>(null);

  const handleAdd = async () => {
    const trimmed = newUrl.trim();
    if (!trimmed) return;
    await addTrackFromUrl(trimmed);
    setNewUrl("");
  };

  // Auto-select playlist when the stream's category matches a playlist's
  // categoryId. Runs once after hydration. Does NOT start playback.
  const autoSelectedRef = useRef(false);
  useEffect(() => {
    if (!hydrated || autoSelectedRef.current) return;
    if (!streamGameId || playlists.length === 0) return;
    const match = playlists.find((p) => p.categoryId === streamGameId);
    if (match && activePlaylist?.id !== match.id) {
      setActivePlaylist(match.id);
    }
    autoSelectedRef.current = true;    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hydrated, streamGameId, playlists, setActivePlaylist]);

  const category = useCategorySearch(onSearchCategories);

  const handleSelectCategory = (cat: CategoryOption) => {
    if (!activePlaylist) return;
    setPlaylistCategory(activePlaylist.id, cat.id, cat.name);
    category.setQuery("");
    category.setOpen(false);
    category.setResults([]);
  };

  // Don't render anything (empty or otherwise) until IDB has hydrated.
  // Otherwise we'd briefly show the empty state for users who have saved
  // playlists, which flashes confusingly.
  if (!hydrated) {
    return <Hydrating />;
  }

  if (playlists.length === 0 || !activePlaylist) {
    return (
      <div className="music-player-panel">
        <MusicPlayerEmptyState
          loadingUrl={loadingUrl}
          error={error}
          onCreate={createPlaylist}
          onAddFirstUrl={async (url, targetPlaylistId) => {
            // Pass the just-created playlist id so addTrackFromUrl lands
            // the song in the playlist we just made, regardless of when
            // React re-renders to reflect the new activePlaylistId.
            await addTrackFromUrl(url, targetPlaylistId);
          }}
        />
      </div>
    );
  }

  return (
    <div className="music-player-panel">
      <PlaylistHeader
        playlists={playlists}
        activePlaylist={activePlaylist}
        renamingId={renamingId}
        renameDraft={renameDraft}
        onSelectPlaylist={setActivePlaylist}
        onRenameDraftChange={setRenameDraft}
        onCommitRename={() => {
          renamePlaylist(activePlaylist.id, renameDraft);
          setRenamingId(null);
        }}
        onCancelRename={() => setRenamingId(null)}
        onStartRename={() => {
          setRenamingId(activePlaylist.id);
          setRenameDraft(activePlaylist.name);
        }}
        onCreatePlaylist={() =>
          createPlaylist(`Playlist ${playlists.length + 1}`)
        }
        onRequestDelete={() => setConfirm("clear")}
      />

      <PlaylistCategorySection
        categoryId={activePlaylist.categoryId}
        categoryName={activePlaylist.categoryName}
        streamGameId={streamGameId}
        streamGameName={streamGameName}
        searchEnabled={Boolean(onSearchCategories)}
        categoryQuery={category.query}
        categoryResults={category.results}
        categoryOpen={category.open}
        categoryRef={category.ref}
        categoryInputRef={category.inputRef}
        onQueryChange={category.setQuery}
        onFocus={() => {
          if (category.results.length > 0) category.setOpen(true);
        }}
        onSelectCategory={handleSelectCategory}
        onRemoveCategory={() =>
          setPlaylistCategory(activePlaylist.id, null, "")
        }
      />

      <NowPlayingRow
        currentItem={currentItem}
        hasItems={activePlaylist.items.length > 0}
        trackPosition={
          activePlaylist.items.length > 0
            ? `${currentIndex + 1} / ${activePlaylist.items.length}`
            : ""
        }
        onPrev={previous}
        onNext={next}
      />

      {miniBarHidden && activePlaylist.items.length > 0 && (
        <button
          type="button"
          className="music-player-btn music-player-btn--play-minibar"
          onClick={() => {
            showMiniBar();
            playTrackIndex(0);
          }}
        >
          <FaPlay size={11} /> Play Playlist
        </button>
      )}

      <AddTrackForm
        newUrl={newUrl}
        loadingUrl={loadingUrl}
        onUrlChange={setNewUrl}
        onSubmit={() => void handleAdd()}
      />

      {error && <p className="music-player-error">{error}</p>}

      <label className="music-player-checkbox">
        <input
          type="checkbox"
          checked={loop}
          onChange={(e) => setLoop(e.target.checked)}
        />
        <span>Loop playlist when it ends</span>
      </label>

      <TrackList
        items={activePlaylist.items}
        currentIndex={currentIndex}
        dragId={dragId}
        onPlayNow={(idx) => playTrackIndex(idx)}
        onRemove={(id) => removeTrack(id)}
        onDragStart={(id) => setDragId(id)}
        onDragEnter={(id) => {
          dragOverIdRef.current = id;
        }}
        onDragOver={(e) => {
          // Required to allow drop.
          e.preventDefault();
        }}
        onDragEnd={() => {
          const fromId = dragId;
          const toId = dragOverIdRef.current;
          setDragId(null);
          dragOverIdRef.current = null;
          if (fromId && toId && fromId !== toId) {
            reorderTracks(fromId, toId);
          }
        }}
      />

      {confirm === "clear" ? (
        <ConfirmClearRow
          playlistName={activePlaylist.name}
          onConfirm={() => {
            deletePlaylist(activePlaylist.id);
            setConfirm(null);
          }}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </div>
  );
}

function PlaylistHeader({
  playlists,
  activePlaylist,
  renamingId,
  renameDraft,
  onSelectPlaylist,
  onRenameDraftChange,
  onCommitRename,
  onCancelRename,
  onStartRename,
  onCreatePlaylist,
  onRequestDelete,
}: {
  playlists: MusicPlaylist[];
  activePlaylist: MusicPlaylist;
  renamingId: string | null;
  renameDraft: string;
  onSelectPlaylist: (id: string) => void;
  onRenameDraftChange: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onStartRename: () => void;
  onCreatePlaylist: () => void;
  onRequestDelete: () => void;
}) {
  return (
    <header className="music-player-panel-header">
      <span className="music-player-panel-header-icon" aria-hidden="true">
        <FaMusic size={12} />
      </span>
      <select
        className="music-player-select"
        value={activePlaylist.id}
        onChange={(e) => onSelectPlaylist(e.target.value)}
        aria-label="Active playlist"
        title="Switch active playlist"
      >
        {playlists.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {renamingId === activePlaylist.id ? (
        <input
          autoFocus
          className="music-player-input music-player-rename"
          aria-label="Rename playlist"
          value={renameDraft}
          onChange={(e) => onRenameDraftChange(e.target.value)}
          onBlur={onCommitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onCommitRename();
            } else if (e.key === "Escape") {
              onCancelRename();
            }
          }}
          maxLength={80}
        />
      ) : (
        <button
          type="button"
          className="music-player-icon-btn"
          onClick={onStartRename}
          title="Rename playlist"
          aria-label="Rename playlist"
        >
          <FaPen size={10} />
        </button>
      )}
      <button
        type="button"
        className="music-player-icon-btn"
        onClick={onCreatePlaylist}
        title="Create playlist"
        aria-label="Create new playlist"
      >
        <FaPlus size={11} />
      </button>
      <button
        type="button"
        className="music-player-icon-btn music-player-icon-btn--danger"
        onClick={onRequestDelete}
        title="Delete active playlist"
        aria-label="Delete playlist"
      >
        <FaTrash size={10} />
      </button>
    </header>
  );
}

function PlaylistCategorySection({
  categoryId,
  categoryName,
  streamGameId,
  streamGameName,
  searchEnabled,
  categoryQuery,
  categoryResults,
  categoryOpen,
  categoryRef,
  categoryInputRef,
  onQueryChange,
  onFocus,
  onSelectCategory,
  onRemoveCategory,
}: {
  categoryId: string | null;
  categoryName: string;
  streamGameId: string;
  streamGameName: string;
  searchEnabled: boolean;
  categoryQuery: string;
  categoryResults: CategoryOption[];
  categoryOpen: boolean;
  categoryRef: React.RefObject<HTMLDivElement | null>;
  categoryInputRef: React.RefObject<HTMLInputElement | null>;
  onQueryChange: (value: string) => void;
  onFocus: () => void;
  onSelectCategory: (cat: CategoryOption) => void;
  onRemoveCategory: () => void;
}) {
  return (
    <div className="music-player-category" ref={categoryRef}>
      <span className="music-player-field-label">
        <FaTag size={10} /> Twitch category
      </span>
      {categoryId ? (
        <div className="music-player-category-chip">
          <span className="music-player-category-chip-name">
            {categoryName || "Unknown"}
          </span>
          <button
            type="button"
            className="music-player-category-chip-remove"
            onClick={onRemoveCategory}
            title="Remove category association"
            aria-label="Remove category"
          >
            <FaTimes size={9} />
          </button>
        </div>
      ) : (
        <div className="music-player-category-search">
          <FaSearch size={11} className="music-player-category-search-icon" />
          <input
            ref={categoryInputRef}
            type="text"
            className="music-player-input music-player-category-input"
            placeholder={
              streamGameId
                ? `e.g. ${streamGameName || "current category"}`
                : "Search Twitch category…"
            }
            value={categoryQuery}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={onFocus}
            disabled={!searchEnabled}
          />
          {categoryOpen && categoryResults.length > 0 && (
            <div className="music-player-category-dropdown">
              {categoryResults.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className="music-player-category-option"
                  onClick={() => onSelectCategory(cat)}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AddTrackForm({
  newUrl,
  loadingUrl,
  onUrlChange,
  onSubmit,
}: {
  newUrl: string;
  loadingUrl: boolean;
  onUrlChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="music-player-add">
      <label htmlFor="music-player-url-input" style={{position:'absolute',width:'1px',height:'1px',padding:0,margin:'-1px',overflow:'hidden',clip:'rect(0,0,0,0)',whiteSpace:'nowrap',border:0}}>Add YouTube URL</label>
      <input
        id="music-player-url-input"
        type="text"
        className="music-player-input"
        placeholder="Paste a YouTube URL or video id…"
        value={newUrl}
        onChange={(e) => onUrlChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
        }}
        disabled={loadingUrl}
      />
      <button
        type="button"
        className="music-player-btn music-player-btn--primary"
        onClick={onSubmit}
        disabled={loadingUrl || !newUrl.trim()}
      >
        <FaPlus size={10} /> {loadingUrl ? "Adding…" : "Add"}
      </button>
    </div>
  );
}

function TrackList({
  items,
  currentIndex,
  dragId,
  onPlayNow,
  onRemove,
  onDragStart,
  onDragEnter,
  onDragOver,
  onDragEnd,
}: {
  items: MusicPlayerItem[];
  currentIndex: number;
  dragId: string | null;
  onPlayNow: (index: number) => void;
  onRemove: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnter: (id: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  return (
    <div className="music-player-track-list-wrap">
      <h4 className="music-player-track-list-title">
        Tracks{" "}
        <span className="music-player-track-list-count">{items.length}</span>
      </h4>
      {items.length === 0 ? (
        <div className="music-player-empty">
          <p>No tracks yet. Paste a YouTube URL above to get started.</p>
        </div>
      ) : (
        <ul className="music-player-track-list">
          {items.map((item, idx) => (
            <TrackRow
              key={item.id}
              item={item}
              index={idx}
              active={idx === currentIndex}
              isDragging={dragId === item.id}
              onPlayNow={() => onPlayNow(idx)}
              onRemove={() => onRemove(item.id)}
              onDragStart={() => onDragStart(item.id)}
              onDragEnter={onDragEnter}
              onDragOver={onDragOver}
              onDragEnd={onDragEnd}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function NowPlayingRow({
  currentItem,
  hasItems,
  trackPosition,
  onPrev,
  onNext,
}: {
  currentItem: MusicPlayerItem | null;
  hasItems: boolean;
  trackPosition: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (!hasItems) {
    return (
      <div className="music-player-now-playing music-player-now-playing--empty">
        <span className="music-player-now-playing-label">No track loaded</span>
        <span className="music-player-now-playing-sub">
          Paste a YouTube URL below to start.
        </span>
      </div>
    );
  }
  if (!currentItem) {
    return (
      <div className="music-player-now-playing music-player-now-playing--empty">
        <span className="music-player-now-playing-label">Ready</span>
        <span className="music-player-now-playing-sub">{trackPosition}</span>
      </div>
    );
  }
  return (
    <div className="music-player-now-playing">
      <img
        src={currentItem.thumbnail}
        alt=""
        className="music-player-now-playing-thumb"
      />
      <div className="music-player-now-playing-meta">
        <span className="music-player-now-playing-label">
          Now playing <span className="music-player-now-playing-position">{trackPosition}</span>
        </span>
        <span className="music-player-now-playing-title">
          {currentItem.title}
        </span>
        <span className="music-player-now-playing-sub">
          {currentItem.channelTitle}
        </span>
      </div>
      <div className="music-player-now-playing-controls">
        <button
          type="button"
          className="music-player-btn music-player-btn--icon"
          onClick={onPrev}
          title="Previous track"
          aria-label="Previous"
        >
          <FaStepBackward size={12} />
        </button>
        <button
          type="button"
          className="music-player-btn music-player-btn--icon"
          onClick={onNext}
          title="Next track"
          aria-label="Next"
        >
          <FaStepForward size={12} />
        </button>
      </div>
    </div>
  );
}

function TrackRow({
  item,
  index,
  active,
  isDragging,
  onPlayNow,
  onRemove,
  onDragStart,
  onDragEnter,
  onDragOver,
  onDragEnd,
}: {
  item: MusicPlayerItem;
  index: number;
  active: boolean;
  isDragging: boolean;
  onPlayNow: () => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragEnter: (id: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  return (
    <li
      className={`music-player-track${active ? " music-player-track--active" : ""}${isDragging ? " music-player-track--dragging" : ""}`}
      draggable
      onDragStart={onDragStart}
      onDragEnter={() => onDragEnter(item.id)}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      data-testid={`music-player-track-${item.id}`}
    >
      <span
        className="music-player-track-handle"
        title="Drag to reorder"
        aria-label="Drag handle"
      >
        ⋮⋮
      </span>
      <span className="music-player-track-index">{index + 1}</span>
      <img src={item.thumbnail} alt="" className="music-player-track-thumb" />
      <div className="music-player-track-meta">
        <span className="music-player-track-title">{item.title}</span>
        <span className="music-player-track-sub">{item.channelTitle}</span>
      </div>
      <div className="music-player-track-actions">
        {active && (
          <span className="music-player-track-active-chip" title="Now playing">
            <FaCheck size={9} />
          </span>
        )}
        <button
          type="button"
          className="music-player-btn music-player-btn--icon"
          onClick={onPlayNow}
          title="Play this track"
          aria-label={`Play ${item.title}`}
        >
          ▶
        </button>
        <button
          type="button"
          className="music-player-btn music-player-btn--icon music-player-btn--icon-danger"
          onClick={onRemove}
          title="Remove from playlist"
          aria-label="Remove track"
        >
          <FaTrash size={10} />
        </button>
      </div>
    </li>
  );
}

function Hydrating() {
  // Lightweight placeholder while IDB loads. We deliberately avoid the
  // dashed-border empty-state visuals here so users with saved
  // playlists don't see a flash of an "empty" UI before hydration
  // completes.
  return (
    <div
      className="music-player-panel"
      aria-busy="true"
      aria-live="polite"
    >
      <p className="music-player-hydrating">Loading playlists…</p>
    </div>
  );
}

function MusicPlayerEmptyState({
  loadingUrl,
  error,
  onCreate,
  onAddFirstUrl,
}: {
  loadingUrl: boolean;
  error: string | null;
  onCreate: (name: string) => { id: string };
  onAddFirstUrl: (url: string, targetPlaylistId: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  return (
    <div className="music-player-empty-state">
      <div className="music-player-empty-state-icon" aria-hidden="true">
        <FaMusic size={28} />
      </div>
      <p className="music-player-empty-state-title">
        Build a playlist in seconds
      </p>
      <p className="music-player-empty-state-desc">
        Create a named playlist, then paste any YouTube URL to start
        playing it through the mini player.
      </p>
      <label className="music-player-field">
        <span className="music-player-field-label">Playlist name</span>
        <input
          type="text"
          className="music-player-input"
          placeholder="e.g. Friday Night Mix"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
        />
      </label>
      <label className="music-player-field">
        <span className="music-player-field-label">First YouTube URL (optional)</span>
        <input
          type="text"
          className="music-player-input"
          placeholder="https://www.youtube.com/watch?v=…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={loadingUrl}
        />
      </label>
      {error && <p className="music-player-error">{error}</p>}
      <div className="music-player-actions">
        <button
          type="button"
          className="music-player-btn music-player-btn--primary"
          onClick={async () => {
            const trimmedName = name.trim() || "My playlist";
            const trimmedUrl = url.trim();
            // Create exactly one playlist. Use the returned id to direct
            // the optional URL into the just-created list, no double
            // createPlaylist, no rAF dance, no stale-closure trap.
            const newPlaylist = onCreate(trimmedName);
            if (trimmedUrl) {
              await onAddFirstUrl(trimmedUrl, newPlaylist.id);
            }
          }}
          disabled={loadingUrl}
        >
          {loadingUrl ? "Starting…" : "Create playlist"}
        </button>
      </div>
    </div>
  );
}

function ConfirmClearRow({
  playlistName,
  onConfirm,
  onCancel,
}: {
  playlistName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="music-player-confirm">
      <span>
        Delete <strong>{playlistName}</strong>? This cannot be undone.
      </span>
      <div className="music-player-confirm-actions">
        <button
          type="button"
          className="music-player-btn music-player-btn--small"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="music-player-btn music-player-btn--small music-player-btn--danger"
          onClick={onConfirm}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
