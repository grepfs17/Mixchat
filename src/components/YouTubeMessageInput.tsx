import React, { useCallback, useRef, useState } from 'react';
import { FaYoutube } from 'react-icons/fa';

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
 * Self-contained YouTube message input with emote autocomplete.
 * Extracted from ChatApp where an identical block appeared in both
 * unified-chat mode and split mode.
 */
export default function YouTubeMessageInput({
    youtubeVideoId,
    onError,
    onOptimisticMessage,
    onOptimisticFailed,
}: YouTubeMessageInputProps) {
    const [ytMessage, setYtMessage] = useState('');
    const [ytSending, setYtSending] = useState(false);
    const ytInputRef = useRef<HTMLInputElement>(null);

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
                setYtMessage(text); // restore input on failure
                onError?.(`YouTube: ${data.error || 'Failed to send message'}`);
            }
        } catch (err) {
            console.error('Failed to send YouTube message:', err);
            onOptimisticFailed?.(optimisticId);
            setYtMessage(text); // restore input on failure
            onError?.('Failed to send YouTube message');
        } finally {
            setYtSending(false);
        }
    }, [ytMessage, youtubeVideoId, onError, onOptimisticMessage, onOptimisticFailed]);

    return (
        <div className="yt-message-input-wrapper message-input">
            <div className="yt-input-group input-group">
                <input
                    ref={ytInputRef}
                    type="text"
                    value={ytMessage}
                    onChange={(e) => setYtMessage(e.target.value)}
                    onKeyDown={(e) => {
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
