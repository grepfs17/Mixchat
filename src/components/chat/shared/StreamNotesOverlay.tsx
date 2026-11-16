import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MdCheck,
  MdClose,
  MdContentCopy,
  MdDeleteOutline,
  MdEdit,
  MdEditNote,
  MdSearch,
} from "react-icons/md";
import {
  MAX_NOTE_LENGTH,
  createNote,
  elapsedFor,
  formatElapsed,
  noteAnchorMs,
  noteStreamStartMs,
  type StreamNote,
} from "../../../lib/notes/types";
import { deleteNote, loadChannelNotes, saveNote } from "../../../lib/notes/idb";
import "../../../styles/chat/StreamNotesOverlay.css";

interface StreamNotesOverlayProps {
  channel: string;
  streamStartedAt?: Date | null;
  onClose: () => void;
}

function streamLabelFor(note: StreamNote): string {
  if (note.streamStartMs === null) return "Session note";
  const label = new Date(note.streamStartMs).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `Stream · ${label}`;
}

export default function StreamNotesOverlay({
  channel,
  streamStartedAt,
  onClose,
}: StreamNotesOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [notes, setNotes] = useState<StreamNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [includeTimestamp, setIncludeTimestamp] = useState(true);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentStreamStartMs = noteStreamStartMs(streamStartedAt);
  const anchorMs = noteAnchorMs(streamStartedAt);
  const liveElapsed = Math.max(0, nowMs - anchorMs);
  const streamSinceLabel = streamStartedAt
    ? streamStartedAt.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setNotes([]);
    setLoading(true);
    setEditingId(null);
    setEditDraft("");
    setConfirmDeleteId(null);
    loadChannelNotes(channel)
      .then((list) => {
        if (!cancelled) setNotes(list);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [channel]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-stream-notes-trigger]")) return;
      if (overlayRef.current && !overlayRef.current.contains(target)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const handleAdd = useCallback(() => {
    const note = createNote({
      channel,
      text: draft,
      streamStartedAt,
      withTimestamp: includeTimestamp,
    });
    if (!note) return;
    setDraft("");
    setNotes((prev) => [note, ...prev]);
    void saveNote(note);
  }, [channel, draft, includeTimestamp, streamStartedAt]);

  const startEdit = useCallback((note: StreamNote) => {
    setEditingId(note.id);
    setEditDraft(note.text);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditDraft("");
  }, []);

  const handleSaveEdit = useCallback(
    (note: StreamNote) => {
      const text = editDraft.trim();
      if (!text) return;
      const updated: StreamNote = {
        ...note,
        text,
        updatedAt: new Date().toISOString(),
      };
      setNotes((prev) =>
        prev.map((entry) => (entry.id === note.id ? updated : entry)),
      );
      setEditingId(null);
      setEditDraft("");
      void saveNote(updated);
    },
    [editDraft],
  );

  const handleDelete = useCallback((note: StreamNote) => {
    if (confirmDeleteId !== note.id) {
      setConfirmDeleteId(note.id);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = setTimeout(
        () => setConfirmDeleteId(null),
        3000,
      );
      return;
    }
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    setConfirmDeleteId(null);
    setNotes((prev) => prev.filter((entry) => entry.id !== note.id));
    void deleteNote(note.id);
  }, [confirmDeleteId]);

  const handleCopyTimestamp = useCallback((note: StreamNote) => {
    const clipboard = navigator.clipboard;
    if (!clipboard?.writeText) return;
    clipboard
      .writeText(formatElapsed(elapsedFor(note)))
      .then(() => {
        setCopiedId(note.id);
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(() => setCopiedId(null), 1500);
      })
      .catch(() => {});
  }, []);

  const filteredNotes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((note) => note.text.toLowerCase().includes(q));
  }, [notes, query]);

  return (
    <div
      ref={overlayRef}
      className="stream-notes-overlay"
      role="dialog"
      aria-label="Stream notes"
    >
      <div className="stream-notes-header">
        <div className="stream-notes-header-info">
          <MdEditNote size={20} className="stream-notes-header-icon" />
          <div>
            <h2 className="stream-notes-title">Stream notes</h2>
            <span className="stream-notes-subtitle">
              {streamSinceLabel
                ? `Stream since ${streamSinceLabel}`
                : "Session notes · no live stream"}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="overlay-btn-icon"
          aria-label="Close stream notes"
        >
          <MdClose size={24} />
        </button>
      </div>

      <div className="stream-notes-compose">
        <textarea
          className="stream-notes-textarea"
          placeholder="Write a note about this moment…"
          value={draft}
          maxLength={MAX_NOTE_LENGTH}
          rows={6}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          aria-label="Note text"
        />
        <div className="stream-notes-compose-footer">
          <label className="stream-notes-timestamp-toggle">
            <input
              type="checkbox"
              checked={includeTimestamp}
              onChange={(e) => setIncludeTimestamp(e.target.checked)}
            />
            <span>Include timestamp</span>
          </label>
          <span className="stream-notes-counter">
            {draft.length}/{MAX_NOTE_LENGTH}
          </span>
          <button
            type="button"
            className="stream-notes-add"
            onClick={handleAdd}
            disabled={!draft.trim()}
          >
            <MdEditNote size={15} />
            {includeTimestamp
              ? `Add note at ${formatElapsed(liveElapsed)}`
              : "Add note"}
          </button>
        </div>
      </div>

      <div className="stream-notes-search">
        <MdSearch size={15} className="stream-notes-search-icon" />
        <input
          type="search"
          className="stream-notes-search-input"
          placeholder="Search notes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search notes"
        />
      </div>

      <div className="stream-notes-body custom-scrollbar">
        {loading && <div className="stream-notes-loading">Loading notes…</div>}

        {!loading && filteredNotes.length === 0 && (
          <div className="stream-notes-empty">
            {notes.length === 0
              ? "No notes yet. Add one to capture this moment."
              : "No notes match your search."}
          </div>
        )}

        {filteredNotes.map((note) => (
          <div key={note.id} className="stream-notes-item">
            <div className="stream-notes-item-main">
              {note.hasTimestamp && (
                <button
                  type="button"
                  className="stream-notes-time"
                  title="Copy timestamp"
                  onClick={() => handleCopyTimestamp(note)}
                >
                  {copiedId === note.id ? (
                    <MdCheck size={13} />
                  ) : (
                    <MdContentCopy size={13} />
                  )}
                  <span>{formatElapsed(elapsedFor(note))}</span>
                </button>
              )}

              {editingId === note.id ? (
                <div className="stream-notes-edit">
                  <textarea
                    className="stream-notes-edit-textarea"
                    value={editDraft}
                    maxLength={MAX_NOTE_LENGTH}
                    rows={3}
                    onChange={(e) => setEditDraft(e.target.value)}
                    aria-label="Edit note text"
                  />
                  <div className="stream-notes-edit-actions">
                    <button
                      type="button"
                      className="stream-notes-action stream-notes-action--primary"
                      onClick={() => handleSaveEdit(note)}
                      disabled={!editDraft.trim()}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="stream-notes-action"
                      onClick={cancelEdit}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="stream-notes-text">{note.text}</p>
              )}

              {editingId !== note.id && (
                <div className="stream-notes-item-actions">
                  <button
                    type="button"
                    className="stream-notes-icon-btn"
                    title="Edit note"
                    aria-label="Edit note"
                    onClick={() => startEdit(note)}
                  >
                    <MdEdit size={14} />
                  </button>
                  <button
                    type="button"
                    className={`stream-notes-icon-btn${confirmDeleteId === note.id ? " stream-notes-icon-btn--confirm" : ""}`}
                    title={
                      confirmDeleteId === note.id
                        ? "Click again to delete"
                        : "Delete note"
                    }
                    aria-label={
                      confirmDeleteId === note.id
                        ? "Confirm delete note"
                        : "Delete note"
                    }
                    onClick={() => handleDelete(note)}
                  >
                    {confirmDeleteId === note.id ? (
                      "Delete?"
                    ) : (
                      <MdDeleteOutline size={15} />
                    )}
                  </button>
                </div>
              )}
            </div>

            {note.streamStartMs !== currentStreamStartMs && (
              <span className="stream-notes-meta">{streamLabelFor(note)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
