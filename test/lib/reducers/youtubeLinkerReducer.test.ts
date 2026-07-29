import { describe, it, expect } from "vitest";
import {
  reducer,
  initLinks,
} from "../../../src/components/YouTubeLinker";
import type {
  State,
  Action,
} from "../../../src/components/YouTubeLinker";
import type { YouTubeLink } from "../../../src/lib/youtubeLinks";

const makeLink = (overrides: Partial<YouTubeLink> = {}): YouTubeLink => ({
  twitchChannelId: "a",
  twitchDisplayName: "Channel A",
  youtubeUrl: "https://www.youtube.com/@channelA",
  active: true,
  ...overrides,
});

const makeState = (overrides: Partial<State> = {}): State => ({
  youtubeLinks: [],
  selectedChannelId: "",
  searchQuery: "",
  youtubeUrl: "",
  error: "",
  editingId: null,
  editUrl: "",
  editError: "",
  ...overrides,
});

describe("YouTubeLinker reducer", () => {
  describe("initLinks", () => {
    it("returns initial state with provided links and empty form fields", () => {
      const links = [makeLink()];
      const state = initLinks(links);
      expect(state.youtubeLinks).toEqual(links);
      expect(state.selectedChannelId).toBe("");
      expect(state.searchQuery).toBe("");
      expect(state.youtubeUrl).toBe("");
      expect(state.error).toBe("");
      expect(state.editingId).toBeNull();
      expect(state.editUrl).toBe("");
      expect(state.editError).toBe("");
    });

    it("works with empty links array", () => {
      const state = initLinks([]);
      expect(state.youtubeLinks).toEqual([]);
    });
  });

  describe("SET_LINKS", () => {
    it("replaces youtubeLinks", () => {
      const links = [makeLink({ twitchChannelId: "x" })];
      const result = reducer(makeState(), {
        type: "SET_LINKS",
        payload: links,
      });
      expect(result.youtubeLinks).toEqual(links);
    });
  });

  describe("SET_SEARCH_QUERY", () => {
    it("sets searchQuery and clears selectedChannelId", () => {
      const state = makeState({ selectedChannelId: "abc", searchQuery: "" });
      const result = reducer(state, {
        type: "SET_SEARCH_QUERY",
        payload: "test",
      });
      expect(result.searchQuery).toBe("test");
      expect(result.selectedChannelId).toBe("");
    });
  });

  describe("SET_SELECTED_CHANNEL", () => {
    it("sets selectedChannelId and searchQuery", () => {
      const result = reducer(makeState(), {
        type: "SET_SELECTED_CHANNEL",
        payload: { id: "ch1", query: "My Channel" },
      });
      expect(result.selectedChannelId).toBe("ch1");
      expect(result.searchQuery).toBe("My Channel");
    });
  });

  describe("SET_YOUTUBE_URL", () => {
    it("sets youtubeUrl and clears error", () => {
      const state = makeState({ error: "previous error" });
      const result = reducer(state, {
        type: "SET_YOUTUBE_URL",
        payload: "https://www.youtube.com/@new",
      });
      expect(result.youtubeUrl).toBe("https://www.youtube.com/@new");
      expect(result.error).toBe("");
    });
  });

  describe("SET_ADD_ERROR", () => {
    it("sets the error message", () => {
      const result = reducer(makeState(), {
        type: "SET_ADD_ERROR",
        payload: "Invalid URL",
      });
      expect(result.error).toBe("Invalid URL");
    });
  });

  describe("RESET_ADD_FORM", () => {
    it("resets form fields and updates links", () => {
      const links = [makeLink()];
      const state = makeState({
        selectedChannelId: "ch1",
        searchQuery: "search",
        youtubeUrl: "https://youtube.com/@x",
        error: "some error",
      });
      const result = reducer(state, {
        type: "RESET_ADD_FORM",
        payload: links,
      });
      expect(result.youtubeLinks).toEqual(links);
      expect(result.selectedChannelId).toBe("");
      expect(result.searchQuery).toBe("");
      expect(result.youtubeUrl).toBe("");
      expect(result.error).toBe("");
    });
  });

  describe("START_EDIT", () => {
    it("sets editing state with url and clears editError", () => {
      const result = reducer(makeState(), {
        type: "START_EDIT",
        payload: { id: "a", url: "https://www.youtube.com/@old" },
      });
      expect(result.editingId).toBe("a");
      expect(result.editUrl).toBe("https://www.youtube.com/@old");
      expect(result.editError).toBe("");
    });
  });

  describe("SET_EDIT_URL", () => {
    it("sets editUrl and clears editError", () => {
      const state = makeState({ editError: "previous error" });
      const result = reducer(state, {
        type: "SET_EDIT_URL",
        payload: "https://www.youtube.com/@new",
      });
      expect(result.editUrl).toBe("https://www.youtube.com/@new");
      expect(result.editError).toBe("");
    });
  });

  describe("SET_EDIT_ERROR", () => {
    it("sets the edit error message", () => {
      const result = reducer(makeState(), {
        type: "SET_EDIT_ERROR",
        payload: "Invalid edit URL",
      });
      expect(result.editError).toBe("Invalid edit URL");
    });
  });

  describe("CANCEL_EDIT", () => {
    it("clears editingId, editUrl, and editError", () => {
      const state = makeState({
        editingId: "a",
        editUrl: "https://www.youtube.com/@editing",
        editError: "some error",
      });
      const result = reducer(state, { type: "CANCEL_EDIT" });
      expect(result.editingId).toBeNull();
      expect(result.editUrl).toBe("");
      expect(result.editError).toBe("");
    });
  });

  describe("FINISH_EDIT", () => {
    it("updates links and clears editing state", () => {
      const links = [makeLink({ youtubeUrl: "https://www.youtube.com/@updated" })];
      const state = makeState({
        editingId: "a",
        editUrl: "https://www.youtube.com/@editing",
        editError: "",
      });
      const result = reducer(state, {
        type: "FINISH_EDIT",
        payload: links,
      });
      expect(result.youtubeLinks).toEqual(links);
      expect(result.editingId).toBeNull();
      expect(result.editUrl).toBe("");
      expect(result.editError).toBe("");
    });
  });

  describe("default", () => {
    it("returns the current state for unknown actions", () => {
      const state = makeState({ searchQuery: "keep" });
      // @ts-expect-error testing unknown action
      const result = reducer(state, { type: "UNKNOWN" });
      expect(result).toBe(state);
    });
  });

  describe("state immutability", () => {
    it("does not mutate the original state object", () => {
      const state = makeState({ searchQuery: "original" });
      const result = reducer(state, {
        type: "SET_SEARCH_QUERY",
        payload: "changed",
      });
      expect(state.searchQuery).toBe("original");
      expect(result.searchQuery).toBe("changed");
      expect(result).not.toBe(state);
    });
  });
});
