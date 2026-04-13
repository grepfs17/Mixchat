
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initializeBadges, getBadge, getBadgeDetail, clearBadgeCache } from '../../src/lib/badges';

// Mock the @twurple modules
vi.mock('@twurple/auth', () => ({
  StaticAuthProvider: vi.fn(),
}));

const mockBadgeSet = (id: string, versions: any[]) => ({
  id,
  getVersion: (v: string) => {
    const ver = versions.find(ver => ver.id === v);
    if (!ver) return null;
    return {
      getImageUrl: (size: number) => `http://badge.com/${id}/${v}/${size}x`,
      title: ver.title,
      description: ver.description,
    };
  },
});

vi.mock('@twurple/api', () => {
  return {
    ApiClient: vi.fn().mockImplementation(() => ({
      chat: {
        getGlobalBadges: vi.fn().mockResolvedValue([
          mockBadgeSet('moderator', [{ id: '1', title: 'Mod', description: 'Moderator' }]),
          mockBadgeSet('subscriber', [{ id: '0', title: 'Sub', description: 'Subscriber' }]),
        ]),
        getChannelBadges: vi.fn().mockResolvedValue([
          mockBadgeSet('subscriber', [{ id: '12', title: '12-Month Sub', description: '1 Year Subscriber' }]),
          mockBadgeSet('custom-badge', [{ id: '1', title: 'VIP+', description: 'Special VIP' }]),
        ]),
      },
      users: {
        getUserByName: vi.fn().mockResolvedValue({ id: '123' }),
      },
    })),
  };
});

describe('badges lib', () => {
  beforeEach(() => {
    clearBadgeCache();
    vi.clearAllMocks();
  });

  it('initializes and retrieves global badges', async () => {
    await initializeBadges('123', 'token', 'client');
    
    const modBadge = getBadge('moderator', '1');
    expect(modBadge).toBe('http://badge.com/moderator/1/2x');
    
    const detail = getBadgeDetail('moderator', '1');
    expect(detail).toEqual({
      id: 'moderator',
      version: '1',
      url: 'http://badge.com/moderator/1/2x',
      title: 'Mod',
      description: 'Moderator',
    });
  });

  it('prioritizes channel badges over global badges', async () => {
    await initializeBadges('123', 'token', 'client');
    
    // Subscriber badge exists in both global and channel
    // Global: version '0', Channel: version '12'
    const channelSub = getBadgeDetail('subscriber', '12');
    expect(channelSub?.title).toBe('12-Month Sub');
    
    const customBadge = getBadgeDetail('custom-badge', '1');
    expect(customBadge?.title).toBe('VIP+');
  });

  it('returns undefined for non-existent badges', async () => {
    await initializeBadges('123', 'token', 'client');
    expect(getBadge('non-existent', '1')).toBeUndefined();
  });

  it('resolves numeric broadcaster ID when login name is provided', async () => {
    await initializeBadges('my_channel', 'token', 'client');
    // The ApiClient mock is called with '123' because 'my_channel' is resolved
    const { ApiClient } = await import('@twurple/api');
    const clientInstance = vi.mocked(ApiClient).mock.results[0].value;
    expect(clientInstance.chat.getChannelBadges).toHaveBeenCalledWith('123');
  });
});
