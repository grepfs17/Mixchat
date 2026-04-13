
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  checkLiveStreamers, 
  getWatchedStreamers, 
  addWatchedStreamer, 
  removeWatchedStreamer 
} from '../../src/lib/streamMonitor';
import * as twitch from '../../src/lib/twitch';

vi.mock('../../src/lib/twitch', () => ({
  getStreamStatuses: vi.fn(),
}));

describe('streamMonitor lib', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('manages watched streamers in localStorage', () => {
    const streamer = { id: '1', name: 'chan1', displayName: 'Channel One' };
    
    addWatchedStreamer(streamer);
    expect(getWatchedStreamers()).toHaveLength(1);
    expect(getWatchedStreamers()[0]).toEqual(streamer);
    
    // Don't add duplicate
    addWatchedStreamer(streamer);
    expect(getWatchedStreamers()).toHaveLength(1);
    
    removeWatchedStreamer('1');
    expect(getWatchedStreamers()).toHaveLength(0);
  });

  it('checks for live streamers using batch API', async () => {
    const streamers = [
      { id: '1', name: 'chan1', displayName: 'Channel One' },
      { id: '2', name: 'chan2', displayName: 'Channel Two' },
    ];
    
    vi.mocked(twitch.getStreamStatuses).mockResolvedValue({
      '1': { isLive: true, title: 'Live Title', viewerCount: 100 },
      '2': { isLive: false },
    });
    
    const live = await checkLiveStreamers(streamers, 'token', 'client');
    
    expect(live).toHaveLength(1);
    expect(live[0].id).toBe('1');
    expect(live[0].title).toBe('Live Title');
    expect(twitch.getStreamStatuses).toHaveBeenCalledWith('token', 'client', ['1', '2']);
  });

  it('returns empty array when no streamers to watch', async () => {
    const live = await checkLiveStreamers([], 'token', 'client');
    expect(live).toEqual([]);
    expect(twitch.getStreamStatuses).not.toHaveBeenCalled();
  });
});
