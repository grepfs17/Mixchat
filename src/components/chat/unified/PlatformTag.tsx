import { FaTwitch, FaYoutube } from 'react-icons/fa';

export function PlatformTag({ source }: { source: 'twitch' | 'youtube' }) {
    return (
        <span
            title={source === 'twitch' ? 'Twitch' : 'YouTube'}
            className={`platform-tag ${source}`}
        >
            {source === 'twitch' ? <FaTwitch size={12} /> : <FaYoutube size={12} />}
        </span>
    );
}
