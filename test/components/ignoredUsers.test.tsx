import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import ChatDisplay from '../../src/components/chat/display';
import UnifiedChat from '../../src/components/chat/unified';
import type { ChatMessage, Platform } from '../../src/lib/types';

vi.mock('react-dom', async () => {
  const actual = await vi.importActual('react-dom');
  return {
    ...actual,
    createPortal: (children: React.ReactNode) => children,
  };
});

vi.mock('../../src/lib/emotes', () => ({
  parseMessageWithEmotes: (text: string) => text,
  searchEmotes: () => [],
  getAllEmotesOrganized: () => ({}),
}));

vi.mock('../../src/hooks/useChatTouchGestures', () => ({
  useChatTouchGestures: () => ({}),
}));

vi.mock('../../src/hooks/useScrollToBottomOnKeyboard', () => ({
  useScrollToBottomOnKeyboard: () => ({}),
}));

vi.mock('../../src/components/EmoteMenu', () => ({
  default: () => null,
  __esModule: true,
}));

vi.mock('../../src/components/MessageBadges', () => ({
  default: () => null,
  __esModule: true,
}));

vi.mock('../../src/components/TwitchEventIcon', () => ({
  default: () => null,
  EVENT_CONFIG: {},
  __esModule: true,
}));

vi.mock('../../src/lib/device', () => ({
  isMobileDevice: () => false,
}));

const makeTwitchMessage = (id: string, author: string, content: string): ChatMessage => ({
  id,
  platform: 'twitch',
  author,
  content,
  timestamp: new Date(),
  userId: `user-${id}`,
});

const makeYtMessage = (id: string, author: string, text: string) => ({
  id,
  author,
  parts: [{ type: 'text' as const, text }],
  timestamp: new Date(),
});

describe('Ignored Users', () => {
  describe('ChatDisplay - Ignored Users filtering', () => {
    const defaultProps = {
      messages: [] as ChatMessage[],
      isLoading: false,
      selectedPlatforms: ['twitch'] as Platform[],
    };

    it('shows all messages when ignoredUsers is empty', () => {
      const messages = [
        makeTwitchMessage('1', 'Alice', 'Hello'),
        makeTwitchMessage('2', 'Bob', 'Hi'),
        makeTwitchMessage('3', 'Charlie', 'Hey'),
      ];

      render(<ChatDisplay {...defaultProps} messages={messages} />);

      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
      expect(screen.getByText('Charlie')).toBeInTheDocument();
    });

    it('filters out messages from ignored users', () => {
      const messages = [
        makeTwitchMessage('1', 'Alice', 'Hello'),
        makeTwitchMessage('2', 'BotUser', 'spam spam'),
        makeTwitchMessage('3', 'Charlie', 'Hey'),
      ];

      const { container } = render(
        <ChatDisplay
          {...defaultProps}
          messages={messages}
          ignoredUsers={['botuser']}
        />
      );

      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Charlie')).toBeInTheDocument();

      const messageElements = container.querySelectorAll('.message');
      expect(messageElements).toHaveLength(2);
      const authors = Array.from(messageElements).map(el => el.querySelector('.author')?.textContent);
      expect(authors).not.toContain('BotUser');
    });

    it('matches ignored users case-insensitively', () => {
      const messages = [
        makeTwitchMessage('1', 'Mushu', 'bot message 1'),
        makeTwitchMessage('2', 'MUSHU', 'bot message 2'),
        makeTwitchMessage('3', 'mushu', 'bot message 3'),
        makeTwitchMessage('4', 'Viewer', 'real message'),
      ];

      const { container } = render(
        <ChatDisplay
          {...defaultProps}
          messages={messages}
          ignoredUsers={['mushu']}
        />
      );

      const messageElements = container.querySelectorAll('.message');
      expect(messageElements).toHaveLength(1);
      expect(messageElements[0].querySelector('.author')?.textContent).toBe('Viewer');
      expect(screen.getByText('Viewer')).toBeInTheDocument();
    });

    it('filters multiple ignored users', () => {
      const messages = [
        makeTwitchMessage('1', 'Alice', 'Hello'),
        makeTwitchMessage('2', 'BotOne', 'spam'),
        makeTwitchMessage('3', 'Bob', 'Hi'),
        makeTwitchMessage('4', 'BotTwo', 'more spam'),
        makeTwitchMessage('5', 'Charlie', 'Hey'),
      ];

      const { container } = render(
        <ChatDisplay
          {...defaultProps}
          messages={messages}
          ignoredUsers={['botone', 'bottwo']}
        />
      );

      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
      expect(screen.getByText('Charlie')).toBeInTheDocument();

      const messageElements = container.querySelectorAll('.message');
      expect(messageElements).toHaveLength(3);
      const authors = Array.from(messageElements).map(el => el.querySelector('.author')?.textContent);
      expect(authors).not.toContain('BotOne');
      expect(authors).not.toContain('BotTwo');
    });

    it('only renders non-ignored message count', () => {
      const messages = [
        makeTwitchMessage('1', 'Alice', 'Hello'),
        makeTwitchMessage('2', 'BotUser', 'spam'),
        makeTwitchMessage('3', 'Charlie', 'Hey'),
      ];

      const { container } = render(
        <ChatDisplay
          {...defaultProps}
          messages={messages}
          ignoredUsers={['botuser']}
        />
      );

      const messageElements = container.querySelectorAll('.message');
      expect(messageElements).toHaveLength(2);
    });
  });

  describe('UnifiedChat - Ignored Users filtering', () => {
    it('filters Twitch messages from ignored users', () => {
      const twitchMessages = [
        makeTwitchMessage('1', 'Alice', 'Hello from Twitch'),
        makeTwitchMessage('2', 'BotUser', 'twitch spam'),
      ];
      const ytMessages = [
        makeYtMessage('y1', 'YTViewer', 'Hello from YouTube'),
      ];

      const { container } = render(
        <UnifiedChat
          twitchMessages={twitchMessages}
          ytMessages={ytMessages}
          ignoredUsers={['botuser']}
        />
      );

      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('YTViewer')).toBeInTheDocument();

      const messageElements = container.querySelectorAll('.message');
      const authors = Array.from(messageElements).map(el => el.querySelector('.author')?.textContent);
      expect(authors).not.toContain('BotUser');
    });

    it('filters YouTube messages from ignored users', () => {
      const twitchMessages = [
        makeTwitchMessage('1', 'Alice', 'Hello from Twitch'),
      ];
      const ytMessages = [
        makeYtMessage('y1', 'YTViewer', 'Hello from YouTube'),
        makeYtMessage('y2', 'YtBot', 'youtube spam'),
      ];

      const { container } = render(
        <UnifiedChat
          channelName="testchannel"
          twitchMessages={twitchMessages}
          ytMessages={ytMessages}
          ignoredUsers={['ytbot']}
        />
      );

      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('YTViewer')).toBeInTheDocument();

      const messageElements = container.querySelectorAll('.message');
      const authors = Array.from(messageElements).map(el => el.querySelector('.author')?.textContent);
      expect(authors).not.toContain('YtBot');
    });

    it('filters both platforms when same username exists on both', () => {
      const twitchMessages = [
        makeTwitchMessage('1', 'Spammer', 'twitch spam'),
        makeTwitchMessage('2', 'GoodUser', 'twitch hello'),
      ];
      const ytMessages = [
        makeYtMessage('y1', 'Spammer', 'youtube spam'),
        makeYtMessage('y2', 'GoodUser', 'youtube hello'),
      ];

      const { container } = render(
        <UnifiedChat
          channelName="testchannel"
          twitchMessages={twitchMessages}
          ytMessages={ytMessages}
          ignoredUsers={['spammer']}
        />
      );

      const messageElements = container.querySelectorAll('.message');
      const authors = Array.from(messageElements).map(el => el.querySelector('.author')?.textContent);
      expect(authors).not.toContain('Spammer');
      expect(authors.filter(a => a === 'GoodUser')).toHaveLength(2);
    });

    it('matches ignored users case-insensitively for both platforms', () => {
      const twitchMessages = [
        makeTwitchMessage('1', 'Mushu', 'twitch bot msg'),
      ];
      const ytMessages = [
        makeYtMessage('y1', 'MUSHU', 'youtube bot msg'),
        makeYtMessage('y2', 'Viewer', 'real yt msg'),
      ];

      const { container } = render(
        <UnifiedChat
          channelName="testchannel"
          twitchMessages={twitchMessages}
          ytMessages={ytMessages}
          ignoredUsers={['mushu']}
        />
      );

      const messageElements = container.querySelectorAll('.message');
      expect(messageElements).toHaveLength(1);
      expect(messageElements[0].querySelector('.author')?.textContent).toBe('Viewer');
      expect(screen.getByText('Viewer')).toBeInTheDocument();
    });

    it('shows all messages from both platforms when ignoredUsers is empty', () => {
      const twitchMessages = [
        makeTwitchMessage('1', 'Alice', 'Twitch msg'),
      ];
      const ytMessages = [
        makeYtMessage('y1', 'Bob', 'YouTube msg'),
      ];

      render(
        <UnifiedChat
          channelName="testchannel"
          twitchMessages={twitchMessages}
          ytMessages={ytMessages}
        />
      );

      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    it('only renders non-ignored message count from both platforms', () => {
      const twitchMessages = [
        makeTwitchMessage('1', 'Alice', 'Twitch msg'),
        makeTwitchMessage('2', 'BotUser', 'twitch spam'),
      ];
      const ytMessages = [
        makeYtMessage('y1', 'YTViewer', 'YouTube msg'),
        makeYtMessage('y2', 'BotUser', 'youtube spam'),
      ];

      const { container } = render(
        <UnifiedChat
          channelName="testchannel"
          twitchMessages={twitchMessages}
          ytMessages={ytMessages}
          ignoredUsers={['botuser']}
        />
      );

      const messageElements = container.querySelectorAll('.message');
      expect(messageElements).toHaveLength(2);
    });
  });
});
