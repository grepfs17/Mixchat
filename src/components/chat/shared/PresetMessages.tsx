import { useState, useRef, useEffect, memo } from "react";
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

const STORAGE_KEY = "mixchat_preset_messages";

export interface PresetMessage {
  id: string;
  name: string;
  content: string;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function getPresetMessages(): PresetMessage[] {
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
}

function PresetMessages({
  onSendMessage,
  isLoading,
  selectedPlatforms,
  replyingTo,
  onCancelReply,
}: PresetMessagesProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [presets, setPresets] = useState<PresetMessage[]>(getPresetMessages);
  const [editingPreset, setEditingPreset] = useState<PresetMessage | null>(
    null,
  );
  const [formName, setFormName] = useState("");
  const [formContent, setFormContent] = useState("");
  const [emoteResults, setEmoteResults] = useState<
    Array<{ name: string; url: string; source: string }>
  >([]);
  const [selectedEmoteIndex, setSelectedEmoteIndex] = useState(-1);
  const [hasEmoteSelection, setHasEmoteSelection] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emoteMenuRef = useRef<HTMLDivElement>(null);
  const [dropdownRect, setDropdownRect] = useState<DOMRect | null>(null);
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showDropdown && buttonRef.current) {
      setDropdownRect(buttonRef.current.getBoundingClientRect());
    } else {
      setDropdownRect(null);
    }
  }, [showDropdown]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showDropdown]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (emoteResults.length > 0) {
          setEmoteResults([]);
          setSelectedEmoteIndex(-1);
          setHasEmoteSelection(false);
          return;
        }
        if (showModal) {
          setShowModal(false);
          setEditingPreset(null);
        } else if (showDropdown) {
          setShowDropdown(false);
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showModal, showDropdown, emoteResults]);

  useEffect(() => {
    if (!showModal) {
      setEmoteResults([]);
      setSelectedEmoteIndex(-1);
      setHasEmoteSelection(false);
    }
  }, [showModal]);

  useEffect(() => {
    if (emoteResults.length > 0 && emoteMenuRef.current) {
      const selectedElement = emoteMenuRef.current.children[
        selectedEmoteIndex
      ] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView(
          isMobileDevice()
            ? { inline: "nearest", block: "nearest" }
            : { block: "nearest" },
        );
      }
    }
  }, [selectedEmoteIndex, emoteResults]);

  const handleFormContentChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    const value = e.target.value;
    setFormContent(value);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastSpaceIndex = textBeforeCursor.lastIndexOf(" ");
    const currentWord = textBeforeCursor.substring(lastSpaceIndex + 1);

    if (currentWord.length > 0 && !currentWord.startsWith("@")) {
      const results = searchEmotes(currentWord);
      if (results.length > 0) {
        setEmoteResults(results);
        setSelectedEmoteIndex(-1);
        setHasEmoteSelection(false);
        return;
      }
    }
    setEmoteResults([]);
    setSelectedEmoteIndex(-1);
    setHasEmoteSelection(false);
  };

  const insertEmote = (emoteName: string) => {
    if (!textareaRef.current) return;
    const cursorPos = textareaRef.current.selectionStart;
    const textBeforeCursor = formContent.substring(0, cursorPos);
    const textAfterCursor = formContent.substring(cursorPos);

    if (!textBeforeCursor.trim()) {
      const newContent = emoteName + " " + textAfterCursor;
      setFormContent(newContent);
      setEmoteResults([]);
      setHasEmoteSelection(false);
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
    setFormContent(newContent);
    setEmoteResults([]);
    setHasEmoteSelection(false);
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
    if (emoteResults.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedEmoteIndex((prev) =>
          prev < emoteResults.length - 1 ? prev + 1 : prev,
        );
        setHasEmoteSelection(true);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedEmoteIndex((prev) => (prev > 0 ? prev - 1 : 0));
        setHasEmoteSelection(true);
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (
          hasEmoteSelection &&
          selectedEmoteIndex >= 0 &&
          emoteResults[selectedEmoteIndex]
        ) {
          e.preventDefault();
          insertEmote(emoteResults[selectedEmoteIndex].name);
        }
      }
    }
  };

  const handleOpenModal = () => {
    setEditingPreset(null);
    setFormName("");
    setFormContent("");
    setEmoteResults([]);
    setSelectedEmoteIndex(-1);
    setHasEmoteSelection(false);
    setShowModal(true);
    setShowDropdown(false);
  };

  const handleEditPreset = (preset: PresetMessage) => {
    setEditingPreset(preset);
    setFormName(preset.name);
    setFormContent(preset.content);
    setEmoteResults([]);
    setSelectedEmoteIndex(-1);
    setHasEmoteSelection(false);
    setShowModal(true);
  };

  const handleSavePreset = () => {
    if (!formName.trim() || !formContent.trim()) return;
    let updated: PresetMessage[];
    if (editingPreset) {
      updated = presets.map((p) =>
        p.id === editingPreset.id
          ? { ...p, name: formName.trim(), content: formContent.trim() }
          : p,
      );
    } else {
      updated = [
        ...presets,
        {
          id: generateId(),
          name: formName.trim(),
          content: formContent.trim(),
        },
      ];
    }
    setPresets(updated);
    savePresetMessages(updated);
    setEditingPreset(null);
    setFormName("");
    setFormContent("");
    setEmoteResults([]);
    setShowModal(false);
  };

  const handleDeletePreset = (id: string) => {
    const updated = presets.filter((p) => p.id !== id);
    setPresets(updated);
    savePresetMessages(updated);
  };

  const handleSendPreset = async (preset: PresetMessage) => {
    if (isLoading || selectedPlatforms.length === 0) return;
    setShowDropdown(false);
    await onSendMessage(preset.content, selectedPlatforms, replyingTo?.id);
    if (onCancelReply) onCancelReply();
  };

  const isDisabled = selectedPlatforms.length === 0 || isLoading;
  const textareaRect = textareaRef.current?.getBoundingClientRect();

  return (
    <>
      <div className="preset-split-button" ref={buttonRef}>
        <button
          className="preset-split-left"
          onClick={handleOpenModal}
          disabled={false}
          title="Manage preset messages"
        >
          <FaBookmark size={14} />
        </button>
        <button
          className="preset-split-right"
          onClick={() => setShowDropdown(!showDropdown)}
          disabled={isDisabled}
          title="Send preset message"
        >
          <FaCaretDown size={10} />
        </button>
      </div>

      {showDropdown &&
        dropdownRect &&
        createPortal(
          <div
            ref={dropdownRef}
            className="preset-dropdown"
            style={{
              position: "fixed",
              bottom: window.innerHeight - dropdownRect.top + 6,
              left: dropdownRect.left,
              minWidth: Math.max(dropdownRect.width, 200),
              maxHeight: "50vh",
            }}
          >
            {presets.length === 0 ? (
              <div className="preset-dropdown-empty">
                <span>No preset messages yet</span>
                <button
                  className="preset-dropdown-create-btn"
                  onClick={() => {
                    setShowDropdown(false);
                    handleOpenModal();
                  }}
                >
                  <FaPlus size={10} /> Create one
                </button>
              </div>
            ) : (
              presets.map((preset) => (
                <div
                  key={preset.id}
                  className="preset-dropdown-item"
                  onClick={() => handleSendPreset(preset)}
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

      {showModal &&
        createPortal(
          <div
            className="preset-modal-overlay"
            onClick={() => {
              setShowModal(false);
              setEditingPreset(null);
            }}
          >
            <div
              className="preset-modal"
              ref={modalRef}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="preset-modal-header">
                <h2>{editingPreset ? "Edit Preset" : "Preset Messages"}</h2>
                <button
                  className="preset-modal-close"
                  onClick={() => {
                    setShowModal(false);
                    setEditingPreset(null);
                  }}
                >
                  <FaTimes size={16} />
                </button>
              </div>

              <div className="preset-modal-form">
                <div className="preset-modal-field">
                  <label className="preset-modal-label">Name</label>
                  <input
                    type="text"
                    className="preset-modal-input"
                    placeholder="e.g. Welcome message"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    maxLength={50}
                    autoFocus
                  />
                </div>
                <div
                  className="preset-modal-field"
                  style={{ position: "relative" }}
                >
                  <label className="preset-modal-label">Message</label>
                  <textarea
                    ref={textareaRef}
                    className="preset-modal-textarea"
                    placeholder="Type the message content... (emote autocomplete available)"
                    value={formContent}
                    onChange={handleFormContentChange}
                    onKeyDown={handleTextareaKeyDown}
                    maxLength={500}
                    rows={3}
                  />
                  {emoteResults.length > 0 &&
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
                        {emoteResults.map((emote, index) => (
                          <div
                            key={`${emote.source}-${emote.name}`}
                            onClick={() => insertEmote(emote.name)}
                            className={`preset-emote-item${index === selectedEmoteIndex ? " selected" : ""}`}
                            onMouseEnter={() => {
                              setSelectedEmoteIndex(index);
                              setHasEmoteSelection(true);
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
                <button
                  className="preset-modal-save"
                  onClick={handleSavePreset}
                  disabled={!formName.trim() || !formContent.trim()}
                >
                  <FaPlus size={12} />{" "}
                  {editingPreset ? "Save Changes" : "Add Preset"}
                </button>
              </div>

              <div className="preset-modal-list">
                {presets.length === 0 && !editingPreset && (
                  <div className="preset-modal-empty">
                    No preset messages created yet.
                  </div>
                )}
                {presets.map((preset) => (
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
                      <button
                        className="preset-modal-item-btn preset-modal-item-btn--edit"
                        onClick={() => handleEditPreset(preset)}
                        title="Edit"
                      >
                        <FaPen size={10} />
                      </button>
                      <button
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
