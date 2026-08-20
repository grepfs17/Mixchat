import { useReducer, useRef, useEffect, memo } from "react";
import { createPortal } from "react-dom";
import {
  FaBookmark,
  FaCaretDown,
  FaTimes,
  FaTrash,
  FaPen,
  FaPlus,
} from "react-icons/fa";
import { searchEmotes } from "../../../lib/emotes";
import { isMobileDevice } from "../../../lib/device";
import type { EmoteAutocompleteMode } from "../../../lib/types";

const STORAGE_KEY = "mixchat_preset_messages:v1";

export interface PresetMessage {
  id: string;
  name: string;
  content: string;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function getPresetMessages(): PresetMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePresetMessages(messages: PresetMessage[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
}

export interface State {
  showDropdown: boolean;
  showModal: boolean;
  presets: PresetMessage[];
  editingPreset: PresetMessage | null;
  formName: string;
  formContent: string;
  emoteResults: Array<{ name: string; url: string; source: string }>;
  selectedEmoteIndex: number;
  dropdownRect: DOMRect | null;
}

export type Action =
  | { type: "SET_DROPDOWN"; payload: boolean }
  | { type: "SET_DROPDOWN_RECT"; payload: DOMRect | null }
  | { type: "OPEN_MODAL" }
  | { type: "CLOSE_MODAL" }
  | { type: "START_EDIT"; payload: PresetMessage }
  | { type: "SET_FORM_NAME"; payload: string }
  | { type: "SET_FORM_CONTENT"; payload: string }
  | { type: "SET_EMOTE_RESULTS"; payload: State["emoteResults"] }
  | { type: "SET_SELECTED_EMOTE_INDEX"; payload: number }
  | { type: "MOVE_EMOTE_SELECTION"; payload: "UP" | "DOWN" }
  | { type: "CLEAR_EMOTES" }
  | { type: "SET_PRESETS"; payload: PresetMessage[] }
  | { type: "FINISH_SAVE"; payload: PresetMessage[] };

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_DROPDOWN":
      return { ...state, showDropdown: action.payload };
    case "SET_DROPDOWN_RECT":
      return { ...state, dropdownRect: action.payload };
    case "OPEN_MODAL":
      return {
        ...state,
        showModal: true,
        showDropdown: false,
        editingPreset: null,
        formName: "",
        formContent: "",
        emoteResults: [],
        selectedEmoteIndex: -1,
      };
    case "CLOSE_MODAL":
      return {
        ...state,
        showModal: false,
        editingPreset: null,
        emoteResults: [],
        selectedEmoteIndex: -1,
      };
    case "START_EDIT":
      return {
        ...state,
        showModal: true,
        editingPreset: action.payload,
        formName: action.payload.name,
        formContent: action.payload.content,
        emoteResults: [],
        selectedEmoteIndex: -1,
      };
    case "SET_FORM_NAME":
      return { ...state, formName: action.payload };
    case "SET_FORM_CONTENT":
      return { ...state, formContent: action.payload };
    case "SET_EMOTE_RESULTS":
      return { ...state, emoteResults: action.payload, selectedEmoteIndex: -1 };
    case "SET_SELECTED_EMOTE_INDEX":
      return { ...state, selectedEmoteIndex: action.payload };
    case "MOVE_EMOTE_SELECTION":
      if (action.payload === "DOWN") {
        return {
          ...state,
          selectedEmoteIndex:
            state.selectedEmoteIndex < state.emoteResults.length - 1
              ? state.selectedEmoteIndex + 1
              : state.selectedEmoteIndex,
        };
      } else {
        return {
          ...state,
          selectedEmoteIndex:
            state.selectedEmoteIndex > 0 ? state.selectedEmoteIndex - 1 : 0,
        };
      }
    case "CLEAR_EMOTES":
      return { ...state, emoteResults: [], selectedEmoteIndex: -1 };
    case "SET_PRESETS":
      return { ...state, presets: action.payload };
    case "FINISH_SAVE":
      return {
        ...state,
        presets: action.payload,
        editingPreset: null,
        formName: "",
        formContent: "",
        emoteResults: [],
        showModal: false,
      };
    default:
      return state;
  }
}

interface PresetMessagesProps {
  onSendMessage: (
    message: string,
    platforms: any[],
    replyToId?: string,
  ) => Promise<void>;
  isLoading: boolean;
  selectedPlatforms: any[];
  replyingTo?: any;
  onCancelReply?: () => void;
  emoteAutocompleteMode?: EmoteAutocompleteMode;
}

function PresetMessages({
  onSendMessage,
  isLoading,
  selectedPlatforms,
  replyingTo,
  onCancelReply,
  emoteAutocompleteMode = "default",
}: PresetMessagesProps) {
  const [state, dispatch] = useReducer(reducer, {
    showDropdown: false,
    showModal: false,
    presets: getPresetMessages(),
    editingPreset: null,
    formName: "",
    formContent: "",
    emoteResults: [],
    selectedEmoteIndex: -1,
    dropdownRect: null,
  });

  const hasEmoteSelectionRef = useRef(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emoteMenuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.showDropdown && buttonRef.current) {
      dispatch({
        type: "SET_DROPDOWN_RECT",
        payload: buttonRef.current.getBoundingClientRect(),
      });
    } else {
      dispatch({ type: "SET_DROPDOWN_RECT", payload: null });
    }
  }, [state.showDropdown]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        dispatch({ type: "SET_DROPDOWN", payload: false });
      }
    }
    if (state.showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [state.showDropdown]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (state.emoteResults.length > 0) {
          dispatch({ type: "CLEAR_EMOTES" });
          hasEmoteSelectionRef.current = false;
          return;
        }
        if (state.showModal) {
          dispatch({ type: "CLOSE_MODAL" });
        } else if (state.showDropdown) {
          dispatch({ type: "SET_DROPDOWN", payload: false });
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [state.showModal, state.showDropdown, state.emoteResults]);

  useEffect(() => {
    if (!state.showModal) {
      dispatch({ type: "CLEAR_EMOTES" });
      hasEmoteSelectionRef.current = false;
    }
  }, [state.showModal]);

  useEffect(() => {
    if (state.emoteResults.length > 0 && emoteMenuRef.current) {
      const selectedElement = emoteMenuRef.current.children[
        state.selectedEmoteIndex
      ] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView(
          isMobileDevice()
            ? { inline: "nearest", block: "nearest" }
            : { block: "nearest" },
        );
      }
    }
  }, [state.selectedEmoteIndex, state.emoteResults]);

  const handleFormContentChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    const value = e.target.value;
    dispatch({ type: "SET_FORM_CONTENT", payload: value });

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastSpaceIndex = textBeforeCursor.lastIndexOf(" ");
    const currentWord = textBeforeCursor.substring(lastSpaceIndex + 1);

    let query = currentWord;
    if (emoteAutocompleteMode === "colon") {
      // "Require the : prefix": only show suggestions once the user types a
      // colon. The colon is stripped from the search query, and typing ":"
      // alone surfaces the top emotes.
      if (!currentWord.startsWith(":")) {
        query = "";
      } else {
        query = currentWord.substring(1);
      }
    }

    if (
      (emoteAutocompleteMode === "colon"
        ? currentWord.startsWith(":")
        : query.length > 0) &&
      !currentWord.startsWith("@")
    ) {
      const results = searchEmotes(
        query,
        10,
        emoteAutocompleteMode === "colon",
      );
      if (results.length > 0) {
        dispatch({ type: "SET_EMOTE_RESULTS", payload: results });
        hasEmoteSelectionRef.current = false;
        return;
      }
    }
    dispatch({ type: "CLEAR_EMOTES" });
    hasEmoteSelectionRef.current = false;
  };

  const insertEmote = (emoteName: string) => {
    if (!textareaRef.current) return;
    const cursorPos = textareaRef.current.selectionStart;
    const textBeforeCursor = state.formContent.substring(0, cursorPos);
    const textAfterCursor = state.formContent.substring(cursorPos);

    if (!textBeforeCursor.trim()) {
      const newContent = emoteName + " " + textAfterCursor;
      dispatch({ type: "SET_FORM_CONTENT", payload: newContent });
      dispatch({ type: "CLEAR_EMOTES" });
      hasEmoteSelectionRef.current = false;
      setTimeout(() => {
        if (textareaRef.current) {
          const newPos = (emoteName + " ").length;
          textareaRef.current.selectionStart = newPos;
          textareaRef.current.selectionEnd = newPos;
          textareaRef.current.focus();
        }
      }, 0);
      return;
    }

    const lastSpaceIndex = textBeforeCursor.lastIndexOf(" ");
    const beforeWord = textBeforeCursor.substring(0, lastSpaceIndex + 1);
    const newContent = beforeWord + emoteName + " " + textAfterCursor;
    dispatch({ type: "SET_FORM_CONTENT", payload: newContent });
    dispatch({ type: "CLEAR_EMOTES" });
    hasEmoteSelectionRef.current = false;
    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = (beforeWord + emoteName + " ").length;
        textareaRef.current.selectionStart = newPos;
        textareaRef.current.selectionEnd = newPos;
        textareaRef.current.focus();
      }
    }, 0);
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent) => {
    if (state.emoteResults.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        dispatch({ type: "MOVE_EMOTE_SELECTION", payload: "DOWN" });
        hasEmoteSelectionRef.current = true;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        dispatch({ type: "MOVE_EMOTE_SELECTION", payload: "UP" });
        hasEmoteSelectionRef.current = true;
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (
          hasEmoteSelectionRef.current &&
          state.selectedEmoteIndex >= 0 &&
          state.emoteResults[state.selectedEmoteIndex]
        ) {
          e.preventDefault();
          insertEmote(state.emoteResults[state.selectedEmoteIndex].name);
        }
      }
    }
  };

  const handleOpenModal = () => {
    hasEmoteSelectionRef.current = false;
    dispatch({ type: "OPEN_MODAL" });
  };

  const handleEditPreset = (preset: PresetMessage) => {
    hasEmoteSelectionRef.current = false;
    dispatch({ type: "START_EDIT", payload: preset });
  };

  const handleSavePreset = () => {
    if (!state.formName.trim() || !state.formContent.trim()) return;
    let updated: PresetMessage[];
    if (state.editingPreset) {
      updated = state.presets.map((p) =>
        p.id === state.editingPreset!.id
          ? {
              ...p,
              name: state.formName.trim(),
              content: state.formContent.trim(),
            }
          : p,
      );
    } else {
      updated = [
        ...state.presets,
        {
          id: generateId(),
          name: state.formName.trim(),
          content: state.formContent.trim(),
        },
      ];
    }
    dispatch({ type: "FINISH_SAVE", payload: updated });
    savePresetMessages(updated);
  };

  const handleDeletePreset = (id: string) => {
    const updated = state.presets.filter((p) => p.id !== id);
    dispatch({ type: "SET_PRESETS", payload: updated });
    savePresetMessages(updated);
  };

  const handleSendPreset = async (preset: PresetMessage) => {
    if (isLoading || selectedPlatforms.length === 0) return;
    dispatch({ type: "SET_DROPDOWN", payload: false });
    await onSendMessage(preset.content, selectedPlatforms, replyingTo?.id);
    if (onCancelReply) onCancelReply();
  };

  const isDisabled = selectedPlatforms.length === 0 || isLoading;
  const textareaRect = textareaRef.current?.getBoundingClientRect();

  return (
    <>
      <div className="preset-split-button" ref={buttonRef}>
        <button type="button"
          className="preset-split-left"
          onClick={handleOpenModal}
          disabled={false}
          title="Manage preset messages"
        >
          <FaBookmark size={14} />
        </button>
        <button type="button"
          className="preset-split-right"
          onClick={() =>
            dispatch({ type: "SET_DROPDOWN", payload: !state.showDropdown })
          }
          disabled={isDisabled}
          title="Send preset message"
        >
          <FaCaretDown size={10} />
        </button>
      </div>

      {state.showDropdown &&
        state.dropdownRect &&
        createPortal(
          <div
            ref={dropdownRef}
            className="preset-dropdown"
            style={{
              position: "fixed",
              bottom: window.innerHeight - state.dropdownRect.top + 6,
              left: state.dropdownRect.left,
              minWidth: Math.max(state.dropdownRect.width, 200),
              maxHeight: "50vh",
            }}
          >
            {state.presets.length === 0 ? (
              <div className="preset-dropdown-empty">
                <span>No preset messages yet</span>
                <button type="button"
                  className="preset-dropdown-create-btn"
                  onClick={() => {
                    dispatch({ type: "SET_DROPDOWN", payload: false });
                    handleOpenModal();
                  }}
                >
                  <FaPlus size={10} /> Create one
                </button>
              </div>
            ) : (
              state.presets.map((preset) => (
                    <div
                      key={preset.id}
                      role="button"
                      tabIndex={0}
                      className="preset-dropdown-item"
                      onClick={() => handleSendPreset(preset)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSendPreset(preset); } }}
                >
                  <div className="preset-dropdown-item-info">
                    <span className="preset-dropdown-item-name">
                      {preset.name}
                    </span>
                    <span className="preset-dropdown-item-preview">
                      {preset.content.length > 60
                        ? preset.content.slice(0, 60) + "..."
                        : preset.content}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>,
          document.body,
        )}

      {state.showModal &&
        createPortal(
        <div className="preset-modal-overlay" role="presentation" onClick={() => {
          dispatch({ type: "CLOSE_MODAL" });
        }}>
            <div
              className="preset-modal"
              ref={modalRef}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="preset-modal-header">
                <h2>{state.editingPreset ? "Edit Preset" : "Preset Messages"}</h2>
        <button type="button"
          className="preset-modal-close"
          aria-label="Close preset messages"
                  onClick={() => {
                    dispatch({ type: "CLOSE_MODAL" });
                  }}
                >
                  <FaTimes size={16} />
                </button>
              </div>

              <div className="preset-modal-form">
                <div className="preset-modal-field">
                  <label className="preset-modal-label" htmlFor="preset-name-input">Name</label>
                  <input
                    id="preset-name-input"
                    type="text"
                    className="preset-modal-input"
                    placeholder="e.g. Welcome message"
                    value={state.formName}
                    onChange={(e) =>
                      dispatch({ type: "SET_FORM_NAME", payload: e.target.value })
                    }
                    maxLength={50}
                    autoFocus
                  />
                </div>
                <div
                  className="preset-modal-field"
                  style={{ position: "relative" }}
                >
                  <label className="preset-modal-label" htmlFor="preset-message-input">Message</label>
                  <textarea
                    id="preset-message-input"
                    ref={textareaRef}
                    className="preset-modal-textarea"
                    placeholder="Type the message content... (emote autocomplete available)"
                    value={state.formContent}
                    onChange={handleFormContentChange}
                    onKeyDown={handleTextareaKeyDown}
                    maxLength={500}
                    rows={3}
                  />
                  {state.emoteResults.length > 0 &&
                    textareaRect &&
                    createPortal(
                      <div
                        ref={emoteMenuRef}
                        className="preset-emote-autocomplete"
                        style={{
                          position: "fixed",
                          bottom: window.innerHeight - textareaRect.top + 6,
                          left: textareaRect.left,
                          width: Math.min(textareaRect.width, 320),
                          maxHeight: "40vh",
                        }}
                      >
                        {state.emoteResults.map((emote, index) => (
    <div
      key={`${emote.source}-${emote.name}`}
      role="button"
      tabIndex={0}
      onClick={() => insertEmote(emote.name)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); insertEmote(emote.name); } }}
      className={`preset-emote-item${index === state.selectedEmoteIndex ? " selected" : ""}`}
                            onMouseEnter={() => {
                              dispatch({ type: "SET_SELECTED_EMOTE_INDEX", payload: index });
                              hasEmoteSelectionRef.current = true;
                            }}
                          >
                            <img
                              src={emote.url}
                              alt={emote.name}
                              style={{ width: "28px", height: "28px" }}
                            />
                            <div className="preset-emote-item-info">
                              <span className="preset-emote-item-name">
                                {emote.name}
                              </span>
                              <span className="preset-emote-item-source">
                                {emote.source}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>,
                      document.body,
                    )}
                </div>
                <button type="button"
                  className="preset-modal-save"
                  onClick={handleSavePreset}
                  disabled={!state.formName.trim() || !state.formContent.trim()}
                >
                  <FaPlus size={12} />{" "}
                  {state.editingPreset ? "Save Changes" : "Add Preset"}
                </button>
              </div>

              <div className="preset-modal-list">
                {state.presets.length === 0 && !state.editingPreset && (
                  <div className="preset-modal-empty">
                    No preset messages created yet.
                  </div>
                )}
                {state.presets.map((preset) => (
                  <div key={preset.id} className="preset-modal-item">
                    <div className="preset-modal-item-info">
                      <span className="preset-modal-item-name">
                        {preset.name}
                      </span>
                      <span className="preset-modal-item-content">
                        {preset.content}
                      </span>
                    </div>
                    <div className="preset-modal-item-actions">
                      <button type="button"
                        className="preset-modal-item-btn preset-modal-item-btn--edit"
                        onClick={() => handleEditPreset(preset)}
                        title="Edit"
                      >
                        <FaPen size={10} />
                      </button>
                      <button type="button"
                        className="preset-modal-item-btn preset-modal-item-btn--delete"
                        onClick={() => handleDeletePreset(preset.id)}
                        title="Delete"
                      >
                        <FaTrash size={10} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

export default memo(PresetMessages);
