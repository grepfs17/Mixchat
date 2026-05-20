import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  IDBFactory,
  IDBKeyRange,
  IDBDatabase,
  IDBTransaction,
  IDBRequest,
  IDBOpenDBRequest,
  IDBCursor,
  IDBCursorWithValue,
} from 'fake-indexeddb';
import { saveMessage, getUserHistory, pruneMessages } from '../../src/lib/chatHistoryStorage';
import type { ChatMessage } from '../../src/lib/types';

describe('chatHistoryStorage', () => {
  beforeEach(() => {
    const factory = new IDBFactory();
    (globalThis as any).indexedDB = factory;
    (globalThis as any).IDBKeyRange = IDBKeyRange;
    (globalThis as any).IDBDatabase = IDBDatabase;
    (globalThis as any).IDBTransaction = IDBTransaction;
    (globalThis as any).IDBRequest = IDBRequest;
    (globalThis as any).IDBOpenDBRequest = IDBOpenDBRequest;
    (globalThis as any).IDBCursor = IDBCursor;
    (globalThis as any).IDBCursorWithValue = IDBCursorWithValue;
  });

  afterEach(() => {
    delete (globalThis as any).indexedDB;
    delete (globalThis as any).IDBKeyRange;
    delete (globalThis as any).IDBDatabase;
    delete (globalThis as any).IDBTransaction;
    delete (globalThis as any).IDBRequest;
    delete (globalThis as any).IDBOpenDBRequest;
    delete (globalThis as any).IDBCursor;
    delete (globalThis as any).IDBCursorWithValue;
  });

  const makeMessage = (id: string, author: string, content: string, platform: 'twitch' | 'youtube' = 'twitch'): ChatMessage => ({
    id,
    platform,
    author,
    content,
    timestamp: new Date(),
    userId: `user-${id}`,
  });

  describe('saveMessage', () => {
    it('stores a Twitch message with platform twitch', async () => {
      const msg = makeMessage('t1', 'TwitchUser', 'Hello from Twitch', 'twitch');
      await saveMessage(msg, 'testchannel');

      const history = await getUserHistory('TwitchUser', 'testchannel');
      expect(history).toHaveLength(1);
      expect(history[0].author).toBe('TwitchUser');
      expect(history[0].content).toBe('Hello from Twitch');
      expect(history[0].platform).toBe('twitch');
    });

    it('stores a YouTube message with platform youtube', async () => {
      const msg = makeMessage('y1', 'YTUser', 'Hello from YouTube', 'youtube');
      await saveMessage(msg, 'testchannel');

      const history = await getUserHistory('YTUser', 'testchannel');
      expect(history).toHaveLength(1);
      expect(history[0].author).toBe('YTUser');
      expect(history[0].content).toBe('Hello from YouTube');
      expect(history[0].platform).toBe('youtube');
    });

    it('stores messages from both platforms for the same user', async () => {
      const twitchMsg = makeMessage('t1', 'CrossUser', 'Twitch message', 'twitch');
      const ytMsg = makeMessage('y1', 'CrossUser', 'YouTube message', 'youtube');

      await saveMessage(twitchMsg, 'testchannel');
      await saveMessage(ytMsg, 'testchannel');

      const history = await getUserHistory('CrossUser', 'testchannel');
      expect(history).toHaveLength(2);
      expect(history.map(m => m.platform)).toContain('twitch');
      expect(history.map(m => m.platform)).toContain('youtube');
    });

    it('overwrites a message with the same id', async () => {
      const msg1 = makeMessage('msg1', 'User', 'Original content', 'twitch');
      const msg2 = { ...msg1, content: 'Updated content' };

      await saveMessage(msg1, 'testchannel');
      await saveMessage(msg2, 'testchannel');

      const history = await getUserHistory('User', 'testchannel');
      expect(history).toHaveLength(1);
      expect(history[0].content).toBe('Updated content');
    });
  });

  describe('getUserHistory', () => {
    it('returns messages for a specific user in a channel', async () => {
      const msg1 = makeMessage('t1', 'Alice', 'Hello', 'twitch');
      const msg2 = makeMessage('t2', 'Bob', 'Hi', 'twitch');

      await saveMessage(msg1, 'testchannel');
      await saveMessage(msg2, 'testchannel');

      const aliceHistory = await getUserHistory('Alice', 'testchannel');
      const bobHistory = await getUserHistory('Bob', 'testchannel');

      expect(aliceHistory).toHaveLength(1);
      expect(aliceHistory[0].author).toBe('Alice');
      expect(bobHistory).toHaveLength(1);
      expect(bobHistory[0].author).toBe('Bob');
    });

    it('returns messages sorted by timestamp', async () => {
      const now = Date.now();
      const msg1 = { ...makeMessage('t1', 'User', 'First'), timestamp: new Date(now - 2000) };
      const msg2 = { ...makeMessage('t2', 'User', 'Second'), timestamp: new Date(now - 1000) };
      const msg3 = { ...makeMessage('t3', 'User', 'Third'), timestamp: new Date(now) };

      await saveMessage(msg1, 'testchannel');
      await saveMessage(msg2, 'testchannel');
      await saveMessage(msg3, 'testchannel');

      const history = await getUserHistory('User', 'testchannel');
      expect(history).toHaveLength(3);
      expect(history[0].content).toBe('First');
      expect(history[1].content).toBe('Second');
      expect(history[2].content).toBe('Third');
    });

    it('filters out messages older than 24 hours', async () => {
      const now = Date.now();
      const recentMsg = { ...makeMessage('t1', 'User', 'Recent'), timestamp: new Date(now - 1000 * 60 * 60) };
      const oldMsg = { ...makeMessage('t2', 'User', 'Old'), timestamp: new Date(now - 1000 * 60 * 60 * 25) };

      await saveMessage(recentMsg, 'testchannel');
      await saveMessage(oldMsg, 'testchannel');

      const history = await getUserHistory('User', 'testchannel');
      expect(history).toHaveLength(1);
      expect(history[0].content).toBe('Recent');
    });

    it('returns empty array for user with no messages', async () => {
      const msg = makeMessage('t1', 'Alice', 'Hello', 'twitch');
      await saveMessage(msg, 'testchannel');

      const history = await getUserHistory('Nobody', 'testchannel');
      expect(history).toHaveLength(0);
    });

    it('returns empty array for channel with no messages for user', async () => {
      const msg = makeMessage('t1', 'Alice', 'Hello', 'twitch');
      await saveMessage(msg, 'channel1');

      const history = await getUserHistory('Alice', 'channel2');
      expect(history).toHaveLength(0);
    });

    it('returns messages from both platforms for a user', async () => {
      const twitchMsg = makeMessage('t1', 'User', 'Twitch msg', 'twitch');
      const ytMsg = makeMessage('y1', 'User', 'YouTube msg', 'youtube');

      await saveMessage(twitchMsg, 'testchannel');
      await saveMessage(ytMsg, 'testchannel');

      const history = await getUserHistory('User', 'testchannel');
      expect(history).toHaveLength(2);
      expect(history.some(m => m.platform === 'twitch')).toBe(true);
      expect(history.some(m => m.platform === 'youtube')).toBe(true);
    });
  });

  describe('pruneMessages', () => {
    it('removes messages older than the specified age', async () => {
      const now = Date.now();
      const recentMsg = { ...makeMessage('t1', 'User', 'Recent'), timestamp: new Date(now - 1000 * 60 * 30) };
      const oldMsg = { ...makeMessage('t2', 'User', 'Old'), timestamp: new Date(now - 1000 * 60 * 60 * 2) };

      await saveMessage(recentMsg, 'testchannel');
      await saveMessage(oldMsg, 'testchannel');

      await pruneMessages(1);

      const history = await getUserHistory('User', 'testchannel');
      expect(history).toHaveLength(1);
      expect(history[0].content).toBe('Recent');
    });

    it('keeps all messages within the age limit', async () => {
      const now = Date.now();
      const msg1 = { ...makeMessage('t1', 'User', 'Msg 1'), timestamp: new Date(now - 1000 * 60 * 10) };
      const msg2 = { ...makeMessage('t2', 'User', 'Msg 2'), timestamp: new Date(now - 1000 * 60 * 20) };

      await saveMessage(msg1, 'testchannel');
      await saveMessage(msg2, 'testchannel');

      await pruneMessages(1);

      const history = await getUserHistory('User', 'testchannel');
      expect(history).toHaveLength(2);
    });
  });
});
