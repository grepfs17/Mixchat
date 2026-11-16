import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  IDBFactory,
  IDBKeyRange,
  IDBDatabase,
  IDBTransaction,
  IDBRequest,
  IDBOpenDBRequest,
} from "fake-indexeddb";
import StreamNotesOverlay from "../../src/components/chat/shared/StreamNotesOverlay";
import {
  _resetForTests,
  loadChannelNotes,
} from "../../src/lib/notes/idb";

function addNote(text: string) {
  fireEvent.change(screen.getByLabelText("Note text"), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole("button", { name: /add note at/i }));
}

describe("StreamNotesOverlay", () => {
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

  it("shows the empty state and adds a note with a timestamp", async () => {
    render(
      <StreamNotesOverlay
        channel="streamer"
        streamStartedAt={new Date(Date.now() - 65_000)}
        onClose={() => {}}
      />,
    );

    expect(
      await screen.findByText("No notes yet. Add one to capture this moment."),
    ).toBeInTheDocument();

    addNote("Great play");

    expect(await screen.findByText("Great play")).toBeInTheDocument();
    expect(screen.getByTitle("Copy timestamp")).toBeInTheDocument();

    await waitFor(async () => {
      const stored = await loadChannelNotes("streamer");
      expect(stored).toHaveLength(1);
      expect(stored[0].text).toBe("Great play");
    });
  });

  it("can add a note without a timestamp", async () => {
    render(
      <StreamNotesOverlay channel="streamer" onClose={() => {}} />,
    );
    await screen.findByText("No notes yet. Add one to capture this moment.");

    fireEvent.change(screen.getByLabelText("Note text"), {
      target: { value: "No timestamp please" },
    });
    fireEvent.click(screen.getByLabelText("Include timestamp"));
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));

    expect(await screen.findByText("No timestamp please")).toBeInTheDocument();
    expect(screen.queryByTitle("Copy timestamp")).not.toBeInTheDocument();
  });

  it("filters notes by search text", async () => {
    render(
      <StreamNotesOverlay channel="streamer" onClose={() => {}} />,
    );
    await screen.findByText("No notes yet. Add one to capture this moment.");

    addNote("first note");
    addNote("second note");

    fireEvent.change(screen.getByLabelText("Search notes"), {
      target: { value: "second" },
    });

    expect(screen.queryByText("first note")).not.toBeInTheDocument();
    expect(screen.getByText("second note")).toBeInTheDocument();
  });

  it("edits a note inline", async () => {
    render(
      <StreamNotesOverlay channel="streamer" onClose={() => {}} />,
    );
    await screen.findByText("No notes yet. Add one to capture this moment.");

    addNote("draft note");
    await screen.findByText("draft note");

    fireEvent.click(screen.getByLabelText("Edit note"));
    fireEvent.change(screen.getByLabelText("Edit note text"), {
      target: { value: "edited note" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("edited note")).toBeInTheDocument();
    expect(screen.queryByText("draft note")).not.toBeInTheDocument();
  });

  it("deletes a note after a second confirming click", async () => {
    render(
      <StreamNotesOverlay channel="streamer" onClose={() => {}} />,
    );
    await screen.findByText("No notes yet. Add one to capture this moment.");

    addNote("to delete");
    await screen.findByText("to delete");

    fireEvent.click(screen.getByLabelText("Delete note"));
    expect(screen.getByText("Delete?")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Confirm delete note"));

    expect(screen.queryByText("to delete")).not.toBeInTheDocument();
    await waitFor(async () => {
      expect(await loadChannelNotes("streamer")).toEqual([]);
    });
  });

  it("closes on Escape", async () => {
    let closed = false;
    render(
      <StreamNotesOverlay
        channel="streamer"
        onClose={() => {
          closed = true;
        }}
      />,
    );
    await screen.findByText("No notes yet. Add one to capture this moment.");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(closed).toBe(true);
  });
});
