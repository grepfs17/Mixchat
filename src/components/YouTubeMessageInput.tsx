import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaYoutube } from 'react-icons/fa';
import type { YouTubeEmote } from './YouTubeChat';

interface YouTubeMessageInputProps {
    youtubeVideoId: string;
    /** Shared emote registry populated by YouTubeChat's onEmotesDiscovered */
    emoteRegistry: React.MutableRefObject<Map<string, YouTubeEmote>>;
    /** Called when the API returns an error so the parent can show a notification */
    onError?: (message: string) => void;
}

/**
 * Self-contained YouTube message input with emote autocomplete.
 * Extracted from ChatApp where an identical block appeared in both
 * unified-chat mode and split mode.
 */
export default function YouTubeMessageInput({
    youtubeVideoId,
    emoteRegistry,
    onError,
}: YouTubeMessageInputProps) {
    const [ytMessage, setYtMessage] = useState('');
    const [ytSending, setYtSending] = useState(false);
    const [ytEmoteResults, setYtEmoteResults] = useState<YouTubeEmote[]>([]);
    const [ytSelectedEmoteIndex, setYtSelectedEmoteIndex] = useState(-1);
    const [ytShowEmoteMenu, setYtShowEmoteMenu] = useState(false);
    const [ytHasEmoteSelection, setYtHasEmoteSelection] = useState(false);
    const [ytMenuRect, setYtMenuRect] = useState<DOMRect | null>(null);
    const ytInputRef = useRef<HTMLInputElement>(null);
    const ytEmoteMenuRef = useRef<HTMLDivElement>(null);

    const handleSendYoutubeMessage = useCallback(async () => {
        if (!ytMessage.trim() || !youtubeVideoId) return;
        setYtSending(true);
        try {
            const res = await fetch('/api/youtube-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videoId: youtubeVideoId, message: ytMessage.trim() }),
            });
            const data = await res.json();
            if (res.ok) {
                setYtMessage('');
            } else {
                onError?.(`YouTube: ${data.error || 'Failed to send message'}`);
            }
        } catch (err) {
            console.error('Failed to send YouTube message:', err);
            onError?.('Failed to send YouTube message');
        } finally {
            setYtSending(false);
        }
    }, [ytMessage, youtubeVideoId, onError]);

    const ytInsertEmote = useCallback((emoteName: string) => {
        const input = ytInputRef.current;
        if (!input) return;
        const cursorPos = input.selectionStart ?? ytMessage.length;
        const before = ytMessage.substring(0, cursorPos);
        const after = ytMessage.substring(cursorPos);
        const lastSpace = before.lastIndexOf(' ');
        const beforeWord = before.substring(0, lastSpace + 1);
        const newMsg = beforeWord + emoteName + ' ' + after;
        setYtMessage(newMsg);
        setYtShowEmoteMenu(false);
        setYtHasEmoteSelection(false);
        setYtSelectedEmoteIndex(-1);
        setTimeout(() => {
            if (input) {
                const pos = (beforeWord + emoteName + ' ').length;
                input.setSelectionRange(pos, pos);
                input.focus();
            }
        }, 0);
    }, [ytMessage]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                ytEmoteMenuRef.current && !ytEmoteMenuRef.current.contains(event.target as Node) &&
                ytInputRef.current && !ytInputRef.current.contains(event.target as Node)
            ) {
                setYtShowEmoteMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Scroll selected item into view in the dropdown
    useEffect(() => {
        if (ytShowEmoteMenu && ytEmoteMenuRef.current && ytSelectedEmoteIndex >= 0) {
            const el = ytEmoteMenuRef.current.children[ytSelectedEmoteIndex] as HTMLElement;
            if (el) el.scrollIntoView({ block: 'nearest' });
        }
    }, [ytSelectedEmoteIndex, ytShowEmoteMenu]);

    // Capture input bounding rect for portal positioning
    useEffect(() => {
        if (!ytShowEmoteMenu || !ytInputRef.current) {
            setYtMenuRect(null);
            return;
        }
        setYtMenuRect(ytInputRef.current.getBoundingClientRect());
    }, [ytShowEmoteMenu]);

    return (
        <div className="yt-message-input-wrapper message-input">
            <div className="yt-input-group input-group">
                {/* Emote autocomplete dropdown — portal-rendered to escape GPU layers */}
                {ytShowEmoteMenu && ytEmoteResults.length > 0 && ytMenuRect && createPortal(
                    <div
                        ref={ytEmoteMenuRef}
                        style={{
                            position: 'fixed',
                            bottom: window.innerHeight - ytMenuRect.top + 6,
                            left: ytMenuRect.left,
                            width: ytMenuRect.width,
                            maxHeight: '40vh',
                            overflowY: 'auto',
                            background: 'var(--color-autocomplete-bg, #1e293b)',
                            border: '1px solid var(--color-autocomplete-border, #475569)',
                            borderRadius: '8px',
                            zIndex: 99999,
                            boxShadow: '0 -4px 20px rgba(0,0,0,0.6)',
                        }}
                    >
                        {ytEmoteResults.map((emote, idx) => (
                            <div
                                key={emote.name}
                                onMouseDown={(e) => { e.preventDefault(); ytInsertEmote(emote.name); }}
                                onMouseEnter={() => { setYtSelectedEmoteIndex(idx); setYtHasEmoteSelection(true); }}
                                className={`emote-autocomplete-item ${idx === ytSelectedEmoteIndex ? 'selected' : ''}`}
                            >
                                <img
                                    src={emote.url}
                                    alt={emote.name}
                                    style={{ width: emote.isCustom ? '28px' : '20px', height: emote.isCustom ? '28px' : '20px' }}
                                />
                                <div className="emote-autocomplete-info">
                                    <span className="emote-autocomplete-name">{emote.name}</span>
                                    <span className="emote-autocomplete-type">{emote.isCustom ? 'Custom emote' : 'YouTube emoji'}</span>
                                </div>
                            </div>
                        ))}
                    </div>,
                    document.body
                )}

                <input
                    ref={ytInputRef}
                    type="text"
                    value={ytMessage}
                    onChange={(e) => {
                        const val = e.target.value;
                        setYtMessage(val);
                        const cursor = e.target.selectionStart ?? val.length;
                        const before = val.substring(0, cursor);
                        const lastSpace = before.lastIndexOf(' ');
                        const currentWord = before.substring(lastSpace + 1);
                        if (currentWord.length >= 1 && !currentWord.startsWith('@')) {
                            const q = currentWord.toLowerCase();
                            const matches = Array.from(emoteRegistry.current.values())
                                .filter((e) => e.name.toLowerCase().includes(q))
                                .sort((a, b) => {
                                    const aStarts = a.name.toLowerCase().startsWith(q);
                                    const bStarts = b.name.toLowerCase().startsWith(q);
                                    if (aStarts && !bStarts) return -1;
                                    if (!aStarts && bStarts) return 1;
                                    return a.name.localeCompare(b.name);
                                })
                                .slice(0, 12);
                            if (matches.length > 0) {
                                setYtEmoteResults(matches);
                                setYtSelectedEmoteIndex(-1);
                                setYtHasEmoteSelection(false);
                                setYtShowEmoteMenu(true);
                            } else {
                                setYtShowEmoteMenu(false);
                            }
                        } else {
                            setYtShowEmoteMenu(false);
                        }
                    }}
                    onKeyDown={(e) => {
                        if (ytShowEmoteMenu) {
                            if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                setYtSelectedEmoteIndex((p) => p < ytEmoteResults.length - 1 ? p + 1 : p);
                                setYtHasEmoteSelection(true);
                                return;
                            }
                            if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                setYtSelectedEmoteIndex((p) => p > 0 ? p - 1 : 0);
                                setYtHasEmoteSelection(true);
                                return;
                            }
                            if (e.key === 'Tab') {
                                if (ytHasEmoteSelection && ytSelectedEmoteIndex >= 0 && ytEmoteResults[ytSelectedEmoteIndex]) {
                                    e.preventDefault();
                                    ytInsertEmote(ytEmoteResults[ytSelectedEmoteIndex].name);
                                }
                                return;
                            }
                            if (e.key === 'Enter') {
                                if (ytHasEmoteSelection && ytSelectedEmoteIndex >= 0 && ytEmoteResults[ytSelectedEmoteIndex]) {
                                    e.preventDefault();
                                    ytInsertEmote(ytEmoteResults[ytSelectedEmoteIndex].name);
                                } else {
                                    e.preventDefault();
                                    setYtShowEmoteMenu(false);
                                    handleSendYoutubeMessage();
                                }
                                return;
                            }
                            if (e.key === 'Escape') {
                                e.preventDefault();
                                setYtShowEmoteMenu(false);
                                setYtSelectedEmoteIndex(-1);
                                setYtHasEmoteSelection(false);
                                return;
                            }
                        }
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendYoutubeMessage();
                        }
                    }}
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
            </div>
        </div>
    );
}
