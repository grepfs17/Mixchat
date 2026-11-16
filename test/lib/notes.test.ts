import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  IDBFactory,
  IDBKeyRange,
  IDBDatabase,
  IDBTransaction,
  IDBRequest,
  IDBOpenDBRequest,
} from "fake-indexeddb";
import {
  MAX_NOTE_LENGTH,
  MAX_NOTES_PER_CHANNEL,
  createNote,
  elapsedFor,
  formatElapsed,
  isValidNote,
  noteAnchorMs,
  noteStreamStartMs,
  normalizeNote,
  type StreamNote,
} from "../../src/lib/notes/types";
import {
  _resetForTests,
  deleteNote,
  importNotes,
  loadAllNotes,
  loadChannelNotes,
  saveNote,
} from "../../src/lib/notes/idb";

function makeNote(
  id: string,
  text: string,
  overrides: Partial<StreamNote> = {},
): StreamNote {
  return {
    id,
    channel: "streamer",
    text,
    hasTimestamp: true,
    timestampMs: 1000,
    anchorMs: 0,
    streamStartMs: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("notes types", () => {
  it("formats elapsed time like the uptime display", () => {
    expect(formatElapsed(0)).toBe("0s");
    expect(formatElapsed(5_000)).toBe("5s");
    expect(formatElapsed(125_000)).toBe("2m 5s");
    expect(formatElapsed(3_725_000)).toBe("1h 2m 5s");
    expect(formatElapsed(26 * 3_600_000 + 5 * 60_000)).toBe("1d 2h 5m");
  });

  it("anchors notes to the stream start when live", () => {
    const startedAt = new Date(5_000);
    expect(noteAnchorMs(startedAt)).toBe(5_000);
    expect(noteStreamStartMs(startedAt)).toBe(5_000);
  });

  it("falls back to a page-load anchor and null stream start offline", () => {
    expect(noteAnchorMs(null)).toBeGreaterThan(0);
    expect(noteStreamStartMs(null)).toBeNull();
  });

  it("computes elapsed time from the stored anchor", () => {
    expect(elapsedFor(makeNote("a", "hi", { timestampMs: 61_000 }))).toBe(
      61_000,
    );
  });

  it("creates trimmed notes capped at the max length", () => {
    const note = createNote({
      channel: "streamer",
      text: `  ${"x".repeat(MAX_NOTE_LENGTH + 50)}  `,
      streamStartedAt: new Date(1_000),
    });
    expect(note).not.toBeNull();
    expect(note!.text).toHaveLength(MAX_NOTE_LENGTH);
    expect(note!.anchorMs).toBe(1_000);
    expect(note!.streamStartMs).toBe(1_000);
  });

  it("rejects empty note text", () => {
    expect(createNote({ channel: "streamer", text: "   " })).toBeNull();
  });

  it("marks the timestamp as included by default and optional on request", () => {
    expect(createNote({ channel: "streamer", text: "a" })!.hasTimestamp).toBe(
      true,
    );
    expect(
      createNote({ channel: "streamer", text: "a", withTimestamp: false })!
        .hasTimestamp,
    ).toBe(false);
  });

  it("defaults legacy stored notes to having a timestamp", () => {
    const legacy = { ...makeNote("a", "hi") } as Record<string, unknown>;
    delete legacy.hasTimestamp;
    expect(normalizeNote(legacy)!.hasTimestamp).toBe(true);
  });

  it("validates note shapes", () => {
    expect(isValidNote(makeNote("a", "hi"))).toBe(true);
    expect(isValidNote({ ...makeNote("a", "hi"), timestampMs: NaN })).toBe(
      false,
    );
    expect(isValidNote({ ...makeNote("a", "hi"), id: "" })).toBe(false);
    expect(isValidNote(null)).toBe(false);
  });
});

describe("notes IndexedDB", () => {
  beforeEach(() => {
    const factory = new IDBFactory();
    (globalThis as any).indexedDB = factory;
    (globalThis as any).IDBKeyRange = IDBKeyRange;
    (globalThis as any).IDBDatabase = IDBDatabase;
    (globalThis as any).IDBTransaction = IDBTransaction;
    (globalThis as any).IDBRequest = IDBRequest;
    (globalThis as any).IDBOpenDBRequest = IDBOpenDBRequest;
    _resetForTests();
  });

  afterEach(() => {
    delete (globalThis as any).indexedDB;
    delete (globalThis as any).IDBKeyRange;
    delete (globalThis as any).IDBDatabase;
    delete (globalThis as any).IDBTransaction;
    delete (globalThis as any).IDBRequest;
    delete (globalThis as any).IDBOpenDBRequest;
    _resetForTests();
  });

  it("loads a channel's notes newest first", async () => {
    await saveNote(makeNote("old", "old note", { timestampMs: 1_000 }));
    await saveNote(makeNote("new", "new note", { timestampMs: 5_000 }));
    await saveNote(
      makeNote("other", "other channel", {
        channel: "someone-else",
        timestampMs: 9_000,
      }),
    );

    const notes = await loadChannelNotes("streamer");
    expect(notes.map((note) => note.id)).toEqual(["new", "old"]);
  });

  it("updates and deletes notes", async () => {
    await saveNote(makeNote("a", "draft"));
    await saveNote(makeNote("a", "edited", { updatedAt: "2026-02-02T00:00:00.000Z" }));

    let notes = await loadChannelNotes("streamer");
    expect(notes).toHaveLength(1);
    expect(notes[0].text).toBe("edited");

    await deleteNote("a");
    notes = await loadChannelNotes("streamer");
    expect(notes).toEqual([]);
  });

  it("returns every channel's notes for backups", async () => {
    await saveNote(makeNote("a", "one"));
    await saveNote(makeNote("b", "two", { channel: "other" }));

    const all = await loadAllNotes();
    expect(all.map((note) => note.id).sort()).toEqual(["a", "b"]);
  });

  it("imports valid notes and drops malformed rows", async () => {
    const imported = await importNotes([
      makeNote("a", "one"),
      makeNote("b", "two"),
      { id: "bad" },
      null,
    ]);

    expect(imported).toBe(2);
    expect((await loadChannelNotes("streamer")).map((n) => n.id).sort()).toEqual(
      ["a", "b"],
    );
    expect(await importNotes("not an array")).toBe(0);
  });

  it("keeps only the newest notes per channel", async () => {
    const overflow = MAX_NOTES_PER_CHANNEL + 3;
    const notes = Array.from({ length: overflow }, (_, index) =>
      makeNote(`note-${index}`, `note ${index}`, {
        timestampMs: index + 1,
      }),
    );

    await importNotes(notes);
    const stored = await loadChannelNotes("streamer");

    expect(stored).toHaveLength(MAX_NOTES_PER_CHANNEL);
    expect(stored[0].id).toBe(`note-${overflow - 1}`);
    expect(stored.some((note) => note.id === "note-0")).toBe(false);
  });

  it("swallows storage when IndexedDB is unavailable", async () => {
    delete (globalThis as any).indexedDB;
    _resetForTests();

    await expect(saveNote(makeNote("a", "one"))).resolves.toBeUndefined();
    await expect(loadChannelNotes("streamer")).resolves.toEqual([]);
    await expect(loadAllNotes()).resolves.toEqual([]);
    await expect(importNotes([makeNote("a", "one")])).resolves.toBe(0);
  });
});
