import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaYoutube } from 'react-icons/fa';
import { FaRegSmile } from 'react-icons/fa';
import { searchEmojis, EMOJI_LIST, type EmojiEntry } from '../lib/emojiShortcodes';
import '../styles/MessageInput.css';

interface YouTubeMessageInputProps {
    youtubeVideoId: string;
    /** Called when the API returns an error so the parent can show a notification */
    onError?: (message: string) => void;
    /** Called immediately when send is triggered (before the API call) so the parent can show an optimistic placeholder */
    onOptimisticMessage?: (id: string, text: string) => void;
    /** Called if the API call fails so the parent can remove the optimistic placeholder */
    onOptimisticFailed?: (id: string) => void;
}

/**
 * YouTube message input with Unicode emoji :shortcode: autocomplete.
 * Autocomplete triggers when the user types :xx (colon + 2+ chars).
 * Selecting an entry inserts the real Unicode character so YouTube renders it natively.
 */
export default function YouTubeMessageInput({
    youtubeVideoId,
    onError,
    onOptimisticMessage,
    onOptimisticFailed,
}: YouTubeMessageInputProps) {
    const [ytMessage, setYtMessage] = useState('');
    const [ytSending, setYtSending] = useState(false);

    // :shortcode: autocomplete
    const [emojiResults, setEmojiResults] = useState<EmojiEntry[]>([]);
    const [emojiIndex, setEmojiIndex] = useState(-1);
    const [showEmojiMenu, setShowEmojiMenu] = useState(false);
    const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
    /** Start position of the current :query in the input value */
    const colonPosRef = useRef(-1);

    // Emoji picker popup
    const [showPicker, setShowPicker] = useState(false);
    const [pickerSearch, setPickerSearch] = useState('');
    const [pickerRect, setPickerRect] = useState<DOMRect | null>(null);
    const pickerRef = useRef<HTMLDivElement>(null);
    const pickerBtnRef = useRef<HTMLButtonElement>(null);
    const pickerSearchRef = useRef<HTMLInputElement>(null);

    const ytInputRef = useRef<HTMLInputElement>(null);
    const emojiMenuRef = useRef<HTMLDivElement>(null);

    const handleSendYoutubeMessage = useCallback(async () => {
        const text = ytMessage.trim();
        if (!text || !youtubeVideoId) return;
        const optimisticId = `optimistic_yt_${Date.now()}_${Math.random()}`;
        onOptimisticMessage?.(optimisticId, text);
        setYtMessage('');
        setYtSending(true);
        try {
            const res = await fetch('/api/youtube-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videoId: youtubeVideoId, message: text }),
            });
            const data = await res.json();
            if (!res.ok) {
                onOptimisticFailed?.(optimisticId);
                setYtMessage(text);
                onError?.(`YouTube: ${data.error || 'Failed to send message'}`);
            }
        } catch (err) {
            console.error('Failed to send YouTube message:', err);
            onOptimisticFailed?.(optimisticId);
            setYtMessage(text);
            onError?.('Failed to send YouTube message');
        } finally {
            setYtSending(false);
        }
    }, [ytMessage, youtubeVideoId, onError, onOptimisticMessage, onOptimisticFailed]);

    /** Insert a chosen emoji character, replacing the :query token */
    const insertEmoji = useCallback((entry: EmojiEntry) => {
        const input = ytInputRef.current;
        if (!input || colonPosRef.current === -1) return;
        const before = ytMessage.substring(0, colonPosRef.current);
        const cursor = input.selectionStart ?? ytMessage.length;
        const after = ytMessage.substring(cursor);
        const newVal = before + entry.char + ' ' + after;
        setYtMessage(newVal);
        setShowEmojiMenu(false);
        colonPosRef.current = -1;
        setTimeout(() => {
            const pos = (before + entry.char + ' ').length;
            input.setSelectionRange(pos, pos);
            input.focus();
        }, 0);
    }, [ytMessage]);

    /** Insert emoji character from the picker at current cursor position */
    const insertEmojiFromPicker = useCallback((char: string) => {
        const input = ytInputRef.current;
        if (!input) return;
        const cursor = input.selectionStart ?? ytMessage.length;
        const before = ytMessage.substring(0, cursor);
        const after = ytMessage.substring(cursor);
        const newVal = before + char + after;
        setYtMessage(newVal);
        setTimeout(() => {
            input.setSelectionRange(cursor + char.length, cursor + char.length);
            input.focus();
        }, 0);
    }, [ytMessage]);

    // Open picker: capture button rect for positioning
    useEffect(() => {
        if (showPicker) {
            setPickerRect(pickerBtnRef.current?.getBoundingClientRect() ?? null);
            setPickerSearch('');
            setTimeout(() => pickerSearchRef.current?.focus(), 30);
        }
    }, [showPicker]);

    // Close picker on outside click
    useEffect(() => {
        if (!showPicker) return;
        const handler = (e: MouseEvent) => {
            if (
                pickerRef.current && !pickerRef.current.contains(e.target as Node) &&
                pickerBtnRef.current && !pickerBtnRef.current.contains(e.target as Node)
            ) setShowPicker(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showPicker]);

    // Close on outside click (autocomplete)
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (
                emojiMenuRef.current && !emojiMenuRef.current.contains(e.target as Node) &&
                ytInputRef.current && !ytInputRef.current.contains(e.target as Node)
            ) {
                setShowEmojiMenu(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Scroll selected item into view
    useEffect(() => {
        if (showEmojiMenu && emojiMenuRef.current && emojiIndex >= 0) {
            const el = emojiMenuRef.current.children[emojiIndex] as HTMLElement;
            el?.scrollIntoView({ block: 'nearest' });
        }
    }, [emojiIndex, showEmojiMenu]);

    // Update portal position when menu opens
    useEffect(() => {
        setMenuRect(showEmojiMenu && ytInputRef.current ? ytInputRef.current.getBoundingClientRect() : null);
    }, [showEmojiMenu]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setYtMessage(val);

        const cursor = e.target.selectionStart ?? val.length;
        // Find the last unmatched ':' before the cursor
        const beforeCursor = val.substring(0, cursor);
        const lastColon = beforeCursor.lastIndexOf(':');
        if (lastColon !== -1) {
            const query = beforeCursor.substring(lastColon + 1);
            // Only trigger if no space in query and at least 2 chars typed
            if (query.length >= 2 && !query.includes(' ')) {
                const matches = searchEmojis(query);
                if (matches.length > 0) {
                    colonPosRef.current = lastColon;
                    setEmojiResults(matches);
                    setEmojiIndex(-1);
                    setShowEmojiMenu(true);
                    return;
                }
            }
        }
        setShowEmojiMenu(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (showEmojiMenu) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setEmojiIndex((p) => Math.min(p + 1, emojiResults.length - 1));
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setEmojiIndex((p) => Math.max(p - 1, 0));
                return;
            }
            if ((e.key === 'Tab' || e.key === 'Enter') && emojiIndex >= 0 && emojiResults[emojiIndex]) {
                e.preventDefault();
                insertEmoji(emojiResults[emojiIndex]);
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                setShowEmojiMenu(false);
                return;
            }
        }
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendYoutubeMessage();
        }
    };

    return (
        <div className="message-input">
            <div className="input-group">
                {/* Emoji autocomplete dropdown */}
                {showEmojiMenu && emojiResults.length > 0 && menuRect && createPortal(
                    <div
                        ref={emojiMenuRef}
                        style={{
                            position: 'fixed',
                            bottom: window.innerHeight - menuRect.top + 6,
                            left: menuRect.left,
                            width: menuRect.width,
                            maxHeight: '260px',
                            overflowY: 'auto',
                            background: 'var(--color-autocomplete-bg, #1e293b)',
                            border: '1px solid var(--color-autocomplete-border, #475569)',
                            borderRadius: '8px',
                            zIndex: 99999,
                            boxShadow: '0 -4px 20px rgba(0,0,0,0.6)',
                        }}
                    >
                        {emojiResults.map((entry, idx) => (
                            <div
                                key={entry.shortcode}
                                onMouseDown={(e) => { e.preventDefault(); insertEmoji(entry); }}
                                onMouseEnter={() => setEmojiIndex(idx)}
                                className={`emote-autocomplete-item${idx === emojiIndex ? ' selected' : ''}`}
                            >
                                <span style={{ fontSize: '22px', lineHeight: 1, minWidth: '28px', textAlign: 'center' }}>
                                    {entry.char}
                                </span>
                                <div className="emote-autocomplete-info">
                                    <span className="emote-autocomplete-name">:{entry.shortcode}:</span>
                                    <span className="emote-autocomplete-type">emoji</span>
                                </div>
                            </div>
                        ))}
                    </div>,
                    document.body
                )}

                {/* Emoji picker button */}
                <button
                    ref={pickerBtnRef}
                    type="button"
                    className="emote-picker-button"
                    title="Emoji picker"
                    onClick={() => setShowPicker((p) => !p)}
                    disabled={ytSending}
                >
                    <FaRegSmile size={16} />
                </button>

                <input
                    ref={ytInputRef}
                    type="text"
                    value={ytMessage}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Send a message to YouTube chat..."
                    disabled={ytSending}
                    className="message-textarea youtube"
                />

                <button
                    onClick={handleSendYoutubeMessage}
                    disabled={ytSending || !ytMessage.trim()}
                    className="send-button"
                >
                    {ytSending ? '...' : <FaYoutube size={16} />}
                </button>

                {/* Emoji picker popup — portal so it escapes any overflow:hidden */}
                {showPicker && pickerRect && createPortal(
                    <div
                        ref={pickerRef}
                        className="yt-emoji-picker"
                        style={{
                            position: 'fixed',
                            bottom: window.innerHeight - pickerRect.top + 8,
                            left: pickerRect.left,
                        }}
                    >
                        <div className="yt-emoji-picker-search">
                            <input
                                ref={pickerSearchRef}
                                type="text"
                                placeholder="Search emoji…"
                                value={pickerSearch}
                                onChange={(e) => setPickerSearch(e.target.value)}
                                className="yt-emoji-picker-search-input"
                            />
                        </div>
                        <div className="yt-emoji-picker-grid">
                            {(pickerSearch
                                ? EMOJI_LIST.filter((e) =>
                                    e.shortcode.includes(pickerSearch.toLowerCase())
                                )
                                : EMOJI_LIST
                            ).map((entry) => (
                                <button
                                    key={entry.shortcode}
                                    type="button"
                                    className="yt-emoji-picker-item"
                                    title={`:${entry.shortcode}:`}
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        insertEmojiFromPicker(entry.char);
                                    }}
                                >
                                    {entry.char}
                                </button>
                            ))}
                        </div>
                    </div>,
                    document.body
                )}
            </div>
        </div>
    );
}
