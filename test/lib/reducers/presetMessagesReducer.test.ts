import { describe, it, expect } from "vitest";
import { reducer } from "../../../src/components/chat/shared/PresetMessages";
import type {
  State,
  Action,
  PresetMessage,
} from "../../../src/components/chat/shared/PresetMessages";

const makePreset = (overrides: Partial<PresetMessage> = {}): PresetMessage => ({
  id: "preset-1",
  name: "Welcome",
  content: "Hello!",
  ...overrides,
});

const makeState = (overrides: Partial<State> = {}): State => ({
  showDropdown: false,
  showModal: false,
  presets: [],
  editingPreset: null,
  formName: "",
  formContent: "",
  emoteResults: [],
  selectedEmoteIndex: -1,
  dropdownRect: null,
  ...overrides,
});

describe("PresetMessages reducer", () => {
  describe("SET_DROPDOWN", () => {
    it("sets showDropdown to true", () => {
      const result = reducer(makeState(), {
        type: "SET_DROPDOWN",
        payload: true,
      });
      expect(result.showDropdown).toBe(true);
    });

    it("sets showDropdown to false", () => {
      const state = makeState({ showDropdown: true });
      const result = reducer(state, {
        type: "SET_DROPDOWN",
        payload: false,
      });
      expect(result.showDropdown).toBe(false);
    });
  });

  describe("SET_DROPDOWN_RECT", () => {
    it("sets dropdownRect", () => {
      const rect = new DOMRect(10, 20, 200, 100);
      const result = reducer(makeState(), {
        type: "SET_DROPDOWN_RECT",
        payload: rect,
      });
      expect(result.dropdownRect).toBe(rect);
    });

    it("clears dropdownRect with null", () => {
      const state = makeState({
        dropdownRect: new DOMRect(0, 0, 100, 50),
      });
      const result = reducer(state, {
        type: "SET_DROPDOWN_RECT",
        payload: null,
      });
      expect(result.dropdownRect).toBeNull();
    });
  });

  describe("OPEN_MODAL", () => {
    it("opens modal and resets form fields", () => {
      const state = makeState({
        showDropdown: true,
        showModal: false,
        editingPreset: makePreset(),
        formName: "old",
        formContent: "old content",
        emoteResults: [{ name: "emote", url: "http://url", source: "7tv" }],
        selectedEmoteIndex: 0,
      });
      const result = reducer(state, { type: "OPEN_MODAL" });
      expect(result.showModal).toBe(true);
      expect(result.showDropdown).toBe(false);
      expect(result.editingPreset).toBeNull();
      expect(result.formName).toBe("");
      expect(result.formContent).toBe("");
      expect(result.emoteResults).toEqual([]);
      expect(result.selectedEmoteIndex).toBe(-1);
    });
  });

  describe("CLOSE_MODAL", () => {
    it("closes modal and clears editing/emote state", () => {
      const state = makeState({
        showModal: true,
        editingPreset: makePreset(),
        emoteResults: [{ name: "emote", url: "http://url", source: "7tv" }],
        selectedEmoteIndex: 0,
      });
      const result = reducer(state, { type: "CLOSE_MODAL" });
      expect(result.showModal).toBe(false);
      expect(result.editingPreset).toBeNull();
      expect(result.emoteResults).toEqual([]);
      expect(result.selectedEmoteIndex).toBe(-1);
    });
  });

  describe("START_EDIT", () => {
    it("opens modal with preset data pre-filled", () => {
      const preset = makePreset({
        id: "p1",
        name: "GG",
        content: "Good game!",
      });
      const result = reducer(makeState(), {
        type: "START_EDIT",
        payload: preset,
      });
      expect(result.showModal).toBe(true);
      expect(result.editingPreset).toBe(preset);
      expect(result.formName).toBe("GG");
      expect(result.formContent).toBe("Good game!");
      expect(result.emoteResults).toEqual([]);
      expect(result.selectedEmoteIndex).toBe(-1);
    });
  });

  describe("SET_FORM_NAME", () => {
    it("sets formName", () => {
      const result = reducer(makeState(), {
        type: "SET_FORM_NAME",
        payload: "New Name",
      });
      expect(result.formName).toBe("New Name");
    });
  });

  describe("SET_FORM_CONTENT", () => {
    it("sets formContent", () => {
      const result = reducer(makeState(), {
        type: "SET_FORM_CONTENT",
        payload: "New content",
      });
      expect(result.formContent).toBe("New content");
    });
  });

  describe("SET_EMOTE_RESULTS", () => {
    it("sets emote results and resets selected index", () => {
      const emotes = [
        { name: "catJAM", url: "http://url1", source: "7tv" },
        { name: "pepeJAM", url: "http://url2", source: "7tv" },
      ];
      const state = makeState({ selectedEmoteIndex: 2 });
      const result = reducer(state, {
        type: "SET_EMOTE_RESULTS",
        payload: emotes,
      });
      expect(result.emoteResults).toEqual(emotes);
      expect(result.selectedEmoteIndex).toBe(-1);
    });

    it("clears emote results with empty array", () => {
      const state = makeState({
        emoteResults: [{ name: "x", url: "http://x", source: "7tv" }],
      });
      const result = reducer(state, {
        type: "SET_EMOTE_RESULTS",
        payload: [],
      });
      expect(result.emoteResults).toEqual([]);
    });
  });

  describe("SET_SELECTED_EMOTE_INDEX", () => {
    it("sets selectedEmoteIndex", () => {
      const result = reducer(makeState(), {
        type: "SET_SELECTED_EMOTE_INDEX",
        payload: 3,
      });
      expect(result.selectedEmoteIndex).toBe(3);
    });
  });

  describe("MOVE_EMOTE_SELECTION", () => {
    const emotes = [
      { name: "a", url: "http://a", source: "7tv" },
      { name: "b", url: "http://b", source: "7tv" },
      { name: "c", url: "http://c", source: "7tv" },
    ];

    it("moves selection down", () => {
      const state = makeState({
        emoteResults: emotes,
        selectedEmoteIndex: 0,
      });
      const result = reducer(state, {
        type: "MOVE_EMOTE_SELECTION",
        payload: "DOWN",
      });
      expect(result.selectedEmoteIndex).toBe(1);
    });

    it("does not move past the last item", () => {
      const state = makeState({
        emoteResults: emotes,
        selectedEmoteIndex: 2,
      });
      const result = reducer(state, {
        type: "MOVE_EMOTE_SELECTION",
        payload: "DOWN",
      });
      expect(result.selectedEmoteIndex).toBe(2);
    });

    it("moves selection up", () => {
      const state = makeState({
        emoteResults: emotes,
        selectedEmoteIndex: 2,
      });
      const result = reducer(state, {
        type: "MOVE_EMOTE_SELECTION",
        payload: "UP",
      });
      expect(result.selectedEmoteIndex).toBe(1);
    });

    it("clamps at 0 when moving up from first item", () => {
      const state = makeState({
        emoteResults: emotes,
        selectedEmoteIndex: 0,
      });
      const result = reducer(state, {
        type: "MOVE_EMOTE_SELECTION",
        payload: "UP",
      });
      expect(result.selectedEmoteIndex).toBe(0);
    });

    it("moves to 0 when moving down from -1 (no selection)", () => {
      const state = makeState({
        emoteResults: emotes,
        selectedEmoteIndex: -1,
      });
      const result = reducer(state, {
        type: "MOVE_EMOTE_SELECTION",
        payload: "DOWN",
      });
      expect(result.selectedEmoteIndex).toBe(0);
    });
  });

  describe("CLEAR_EMOTES", () => {
    it("clears emote results and resets selected index", () => {
      const state = makeState({
        emoteResults: [
          { name: "a", url: "http://a", source: "7tv" },
        ],
        selectedEmoteIndex: 0,
      });
      const result = reducer(state, { type: "CLEAR_EMOTES" });
      expect(result.emoteResults).toEqual([]);
      expect(result.selectedEmoteIndex).toBe(-1);
    });
  });

  describe("SET_PRESETS", () => {
    it("replaces presets", () => {
      const presets = [makePreset({ id: "p1" }), makePreset({ id: "p2" })];
      const result = reducer(makeState(), {
        type: "SET_PRESETS",
        payload: presets,
      });
      expect(result.presets).toEqual(presets);
    });
  });

  describe("FINISH_SAVE", () => {
    it("updates presets, resets form, and closes modal", () => {
      const presets = [makePreset({ id: "new-1" })];
      const state = makeState({
        showModal: true,
        editingPreset: makePreset(),
        formName: "GG",
        formContent: "Good game!",
        emoteResults: [{ name: "x", url: "http://x", source: "7tv" }],
      });
      const result = reducer(state, {
        type: "FINISH_SAVE",
        payload: presets,
      });
      expect(result.presets).toEqual(presets);
      expect(result.editingPreset).toBeNull();
      expect(result.formName).toBe("");
      expect(result.formContent).toBe("");
      expect(result.emoteResults).toEqual([]);
      expect(result.showModal).toBe(false);
    });
  });

  describe("default", () => {
    it("returns current state for unknown actions", () => {
      const state = makeState({ formName: "keep" });
      // @ts-expect-error testing unknown action
      const result = reducer(state, { type: "UNKNOWN" });
      expect(result).toBe(state);
    });
  });

  describe("state immutability", () => {
    it("does not mutate the original state object", () => {
      const state = makeState({ formName: "original" });
      const result = reducer(state, {
        type: "SET_FORM_NAME",
        payload: "changed",
      });
      expect(state.formName).toBe("original");
      expect(result.formName).toBe("changed");
      expect(result).not.toBe(state);
    });
  });
});
