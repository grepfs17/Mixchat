import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import ChatDisplay from '../../src/components/ChatDisplay';
import UnifiedChat from '../../src/components/UnifiedChat';
import MessageInput from '../../src/components/MessageInput';
import type { ChatMessage } from '../../src/lib/types';

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

const baseMessage: ChatMessage = {
  id: 'msg-1',
  platform: 'twitch',
  author: 'TestUser',
  content: 'Hello world',
  timestamp: new Date(),
  userId: 'user-1',
};

const broadcasterMessage: ChatMessage = {
  ...baseMessage,
  id: 'msg-bc',
  author: 'BroadcasterUser',
  badges: { broadcaster: '1' },
};

const moderatorMessage: ChatMessage = {
  ...baseMessage,
  id: 'msg-mod',
  author: 'ModUser',
  badges: { moderator: '1' },
};

const ownMessage: ChatMessage = {
  ...baseMessage,
  id: 'msg-self',
  author: 'MySelf',
  isCurrentUser: true,
};

const timeoutMessage: ChatMessage = {
  ...baseMessage,
  id: 'msg-timeout',
  author: 'system',
  messageType: 'timeout',
  targetUsername: 'TimedOutUser',
  content: 'TimedOutUser was timed out',
};

const banMessage: ChatMessage = {
  ...baseMessage,
  id: 'msg-ban',
  author: 'system',
  messageType: 'ban',
  targetUsername: 'BannedUser',
  content: 'BannedUser was banned',
};

describe('Moderator Mode', () => {
  describe('ChatDisplay - Mod Mode Toggle', () => {
    const defaultProps = {
      messages: [] as ChatMessage[],
      isLoading: false,
      selectedPlatforms: ['twitch'] as const,
    };

    it('renders mod mode button when user is a moderator', () => {
      render(
        <ChatDisplay
          {...defaultProps}
          isModerator={true}
          modModeActive={false}
          onToggleModMode={vi.fn()}
        />
      );
      expect(screen.getByTitle('Enable Mod Mode')).toBeInTheDocument();
    });

    it('does not render mod mode button when user is not a moderator', () => {
      render(
        <ChatDisplay
          {...defaultProps}
          isModerator={false}
          modModeActive={false}
          onToggleModMode={vi.fn()}
        />
      );
      expect(screen.queryByTitle('Enable Mod Mode')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Disable Mod Mode')).not.toBeInTheDocument();
    });

    it('shows active state when mod mode is enabled', () => {
      render(
        <ChatDisplay
          {...defaultProps}
          isModerator={true}
          modModeActive={true}
          onToggleModMode={vi.fn()}
        />
      );
      expect(screen.getByTitle('Disable Mod Mode')).toBeInTheDocument();
      expect(screen.queryByTitle('Enable Mod Mode')).not.toBeInTheDocument();
    });

    it('calls onToggleModMode when mod mode button is clicked', async () => {
      const onToggle = vi.fn();
      render(
        <ChatDisplay
          {...defaultProps}
          isModerator={true}
          modModeActive={false}
          onToggleModMode={onToggle}
        />
      );
      fireEvent.click(screen.getByTitle('Enable Mod Mode'));
      expect(onToggle).toHaveBeenCalledTimes(1);
    });
  });

  describe('ChatDisplay - Mod Actions (inline buttons)', () => {
    it('shows mod action buttons when isModerator and modModeActive', () => {
      render(
        <ChatDisplay
          messages={[baseMessage]}
          isLoading={false}
          selectedPlatforms={['twitch']}
          isModerator={true}
          modModeActive={true}
          onDeleteMessage={vi.fn()}
          onTimeoutUser={vi.fn()}
          onBanUser={vi.fn()}
          onWarnUser={vi.fn()}
        />
      );
      expect(screen.getByTitle('Delete message')).toBeInTheDocument();
      expect(screen.getByTitle('Timeout (10m) - Right-click for more')).toBeInTheDocument();
      expect(screen.getByTitle('Ban user')).toBeInTheDocument();
      expect(screen.getByTitle('Warn user')).toBeInTheDocument();
    });

    it('does not show mod action buttons when modModeActive is false', () => {
      render(
        <ChatDisplay
          messages={[baseMessage]}
          isLoading={false}
          selectedPlatforms={['twitch']}
          isModerator={true}
          modModeActive={false}
          onDeleteMessage={vi.fn()}
          onTimeoutUser={vi.fn()}
          onBanUser={vi.fn()}
          onWarnUser={vi.fn()}
        />
      );
      expect(screen.queryByTitle('Delete message')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Timeout (10m) - Right-click for more')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Ban user')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Warn user')).not.toBeInTheDocument();
    });

    it('does not show mod action buttons when isModerator is false', () => {
      render(
        <ChatDisplay
          messages={[baseMessage]}
          isLoading={false}
          selectedPlatforms={['twitch']}
          isModerator={false}
          modModeActive={true}
          onDeleteMessage={vi.fn()}
          onTimeoutUser={vi.fn()}
          onBanUser={vi.fn()}
          onWarnUser={vi.fn()}
        />
      );
      expect(screen.queryByTitle('Delete message')).not.toBeInTheDocument();
    });

    it('shows delete but not timeout/ban/warn for broadcaster messages', () => {
      render(
        <ChatDisplay
          messages={[broadcasterMessage]}
          isLoading={false}
          selectedPlatforms={['twitch']}
          isModerator={true}
          modModeActive={true}
          onDeleteMessage={vi.fn()}
          onTimeoutUser={vi.fn()}
          onBanUser={vi.fn()}
          onWarnUser={vi.fn()}
        />
      );
      expect(screen.getByTitle('Delete message')).toBeInTheDocument();
      expect(screen.queryByTitle('Timeout (10m) - Right-click for more')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Ban user')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Warn user')).not.toBeInTheDocument();
    });

    it('shows delete but not timeout/ban/warn for moderator messages', () => {
      render(
        <ChatDisplay
          messages={[moderatorMessage]}
          isLoading={false}
          selectedPlatforms={['twitch']}
          isModerator={true}
          modModeActive={true}
          onDeleteMessage={vi.fn()}
          onTimeoutUser={vi.fn()}
          onBanUser={vi.fn()}
          onWarnUser={vi.fn()}
        />
      );
      expect(screen.getByTitle('Delete message')).toBeInTheDocument();
      expect(screen.queryByTitle('Timeout (10m) - Right-click for more')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Ban user')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Warn user')).not.toBeInTheDocument();
    });

    it('shows delete but not timeout/ban/warn for current user messages', () => {
      render(
        <ChatDisplay
          messages={[ownMessage]}
          isLoading={false}
          selectedPlatforms={['twitch']}
          isModerator={true}
          modModeActive={true}
          onDeleteMessage={vi.fn()}
          onTimeoutUser={vi.fn()}
          onBanUser={vi.fn()}
          onWarnUser={vi.fn()}
        />
      );
      expect(screen.getByTitle('Delete message')).toBeInTheDocument();
      expect(screen.queryByTitle('Timeout (10m) - Right-click for more')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Ban user')).not.toBeInTheDocument();
    });

    it('calls onDeleteMessage when delete is clicked', () => {
      const onDelete = vi.fn();
      render(
        <ChatDisplay
          messages={[baseMessage]}
          isLoading={false}
          selectedPlatforms={['twitch']}
          isModerator={true}
          modModeActive={true}
          onDeleteMessage={onDelete}
          onTimeoutUser={vi.fn()}
          onBanUser={vi.fn()}
          onWarnUser={vi.fn()}
        />
      );
      fireEvent.click(screen.getByTitle('Delete message'));
      expect(onDelete).toHaveBeenCalledWith('msg-1');
    });

    it('calls onTimeoutUser when timeout is clicked', () => {
      const onTimeout = vi.fn();
      render(
        <ChatDisplay
          messages={[baseMessage]}
          isLoading={false}
          selectedPlatforms={['twitch']}
          isModerator={true}
          modModeActive={true}
          onDeleteMessage={vi.fn()}
          onTimeoutUser={onTimeout}
          onBanUser={vi.fn()}
          onWarnUser={vi.fn()}
        />
      );
      fireEvent.click(screen.getByTitle('Timeout (10m) - Right-click for more'));
      expect(onTimeout).toHaveBeenCalledWith('user-1', 600, 'TestUser');
    });

    it('calls onBanUser when ban is clicked', () => {
      const onBan = vi.fn();
      render(
        <ChatDisplay
          messages={[baseMessage]}
          isLoading={false}
          selectedPlatforms={['twitch']}
          isModerator={true}
          modModeActive={true}
          onDeleteMessage={vi.fn()}
          onTimeoutUser={vi.fn()}
          onBanUser={onBan}
          onWarnUser={vi.fn()}
        />
      );
      fireEvent.click(screen.getByTitle('Ban user'));
      expect(onBan).toHaveBeenCalledWith('user-1', 'TestUser');
    });
  });

  describe('ChatDisplay - Timeout/Ban message undo', () => {
    it('shows Undo button for timeout messages when user is moderator', () => {
      render(
        <ChatDisplay
          messages={[timeoutMessage]}
          isLoading={false}
          selectedPlatforms={['twitch']}
          isModerator={true}
          onUntimeoutUser={vi.fn()}
        />
      );
      expect(screen.getByTitle('Undo moderation action')).toBeInTheDocument();
    });

    it('shows Undo button for ban messages when user is moderator', () => {
      render(
        <ChatDisplay
          messages={[banMessage]}
          isLoading={false}
          selectedPlatforms={['twitch']}
          isModerator={true}
          onUntimeoutUser={vi.fn()}
        />
      );
      expect(screen.getByTitle('Undo moderation action')).toBeInTheDocument();
    });

    it('calls onUntimeoutUser with targetUsername when Undo is clicked', () => {
      const onUntimeout = vi.fn();
      render(
        <ChatDisplay
          messages={[timeoutMessage]}
          isLoading={false}
          selectedPlatforms={['twitch']}
          isModerator={true}
          onUntimeoutUser={onUntimeout}
        />
      );
      fireEvent.click(screen.getByTitle('Undo moderation action'));
      expect(onUntimeout).toHaveBeenCalledWith('TimedOutUser');
    });

    it('does not show Undo button when user is not a moderator', () => {
      const { container } = render(
        <ChatDisplay
          messages={[timeoutMessage]}
          isLoading={false}
          selectedPlatforms={['twitch']}
          isModerator={false}
        />
      );
      expect(screen.queryByTitle('Undo moderation action')).not.toBeInTheDocument();
    });
  });

  describe('ChatDisplay - Context Menu Mod Actions', () => {
    it('shows mod actions in context menu when isModerator and modModeActive', () => {
      const { container } = render(
        <ChatDisplay
          messages={[baseMessage]}
          isLoading={false}
          selectedPlatforms={['twitch']}
          isModerator={true}
          modModeActive={true}
          onDeleteMessage={vi.fn()}
          onTimeoutUser={vi.fn()}
          onBanUser={vi.fn()}
          onWarnUser={vi.fn()}
        />
      );

      const messageEl = container.querySelector('[data-message-id="msg-1"]');
      expect(messageEl).toBeTruthy();
      fireEvent.contextMenu(messageEl!);

      expect(screen.getByText('Delete')).toBeInTheDocument();
      expect(screen.getByText('Timeout (10m)')).toBeInTheDocument();
      expect(screen.getByText('Ban')).toBeInTheDocument();
      expect(screen.getByText('Warn')).toBeInTheDocument();
    });

    it('does not show mod actions in context menu when modModeActive is false', () => {
      const { container } = render(
        <ChatDisplay
          messages={[baseMessage]}
          isLoading={false}
          selectedPlatforms={['twitch']}
          isModerator={true}
          modModeActive={false}
          onDeleteMessage={vi.fn()}
          onTimeoutUser={vi.fn()}
          onBanUser={vi.fn()}
          onWarnUser={vi.fn()}
        />
      );

      const messageEl = container.querySelector('[data-message-id="msg-1"]');
      expect(messageEl).toBeTruthy();
      fireEvent.contextMenu(messageEl!);

      expect(screen.queryByText('Delete')).not.toBeInTheDocument();
      expect(screen.queryByText('Timeout (10m)')).not.toBeInTheDocument();
      expect(screen.queryByText('Ban')).not.toBeInTheDocument();
      expect(screen.queryByText('Warn')).not.toBeInTheDocument();
    });

    it('hides all mod actions for broadcaster in context menu', () => {
      const { container } = render(
        <ChatDisplay
          messages={[broadcasterMessage]}
          isLoading={false}
          selectedPlatforms={['twitch']}
          isModerator={true}
          modModeActive={true}
          onDeleteMessage={vi.fn()}
          onTimeoutUser={vi.fn()}
          onBanUser={vi.fn()}
          onWarnUser={vi.fn()}
        />
      );

      const messageEl = container.querySelector('[data-message-id="msg-bc"]');
      expect(messageEl).toBeTruthy();
      fireEvent.contextMenu(messageEl!);

      expect(screen.queryByText('Delete')).not.toBeInTheDocument();
      expect(screen.queryByText('Timeout (10m)')).not.toBeInTheDocument();
      expect(screen.queryByText('Ban')).not.toBeInTheDocument();
    });

    it('calls onDeleteMessage from context menu', () => {
      const onDelete = vi.fn();
      const { container } = render(
        <ChatDisplay
          messages={[baseMessage]}
          isLoading={false}
          selectedPlatforms={['twitch']}
          isModerator={true}
          modModeActive={true}
          onDeleteMessage={onDelete}
          onTimeoutUser={vi.fn()}
          onBanUser={vi.fn()}
          onWarnUser={vi.fn()}
        />
      );

      const messageEl = container.querySelector('[data-message-id="msg-1"]');
      fireEvent.contextMenu(messageEl!);
      fireEvent.click(screen.getByText('Delete'));
      expect(onDelete).toHaveBeenCalledWith('msg-1');
    });

    it('calls onTimeoutUser from context menu', () => {
      const onTimeout = vi.fn();
      const { container } = render(
        <ChatDisplay
          messages={[baseMessage]}
          isLoading={false}
          selectedPlatforms={['twitch']}
          isModerator={true}
          modModeActive={true}
          onDeleteMessage={vi.fn()}
          onTimeoutUser={onTimeout}
          onBanUser={vi.fn()}
          onWarnUser={vi.fn()}
        />
      );

      const messageEl = container.querySelector('[data-message-id="msg-1"]');
      fireEvent.contextMenu(messageEl!);
      fireEvent.click(screen.getByText('Timeout (10m)'));
      expect(onTimeout).toHaveBeenCalledWith('user-1', 600, 'TestUser');
    });

    it('calls onBanUser from context menu', () => {
      const onBan = vi.fn();
      const { container } = render(
        <ChatDisplay
          messages={[baseMessage]}
          isLoading={false}
          selectedPlatforms={['twitch']}
          isModerator={true}
          modModeActive={true}
          onDeleteMessage={vi.fn()}
          onTimeoutUser={vi.fn()}
          onBanUser={onBan}
          onWarnUser={vi.fn()}
        />
      );

      const messageEl = container.querySelector('[data-message-id="msg-1"]');
      fireEvent.contextMenu(messageEl!);
      fireEvent.click(screen.getByText('Ban'));
      expect(onBan).toHaveBeenCalledWith('user-1', 'TestUser');
    });

    it('calls onWarnUser from context menu', () => {
      const onWarn = vi.fn();
      const { container } = render(
        <ChatDisplay
          messages={[baseMessage]}
          isLoading={false}
          selectedPlatforms={['twitch']}
          isModerator={true}
          modModeActive={true}
          onDeleteMessage={vi.fn()}
          onTimeoutUser={vi.fn()}
          onBanUser={vi.fn()}
          onWarnUser={onWarn}
        />
      );

      const messageEl = container.querySelector('[data-message-id="msg-1"]');
      fireEvent.contextMenu(messageEl!);
      fireEvent.click(screen.getByText('Warn'));
      expect(onWarn).toHaveBeenCalledWith('TestUser');
    });
  });

  describe('UnifiedChat - Mod Actions', () => {
    const baseYtMessage = {
      id: 'yt-1',
      author: 'YTUser',
      parts: [{ type: 'text' as const, text: 'Hello from YouTube' }],
      timestamp: new Date(),
    };

    it('shows mod action buttons on Twitch messages when isModerator and modModeActive', () => {
      render(
        <UnifiedChat
          twitchMessages={[baseMessage]}
          ytMessages={[baseYtMessage]}
          isModerator={true}
          modModeActive={true}
          onDeleteMessage={vi.fn()}
          onTimeoutUser={vi.fn()}
          onBanUser={vi.fn()}
          onWarnUser={vi.fn()}
        />
      );
      expect(screen.getByTitle('Delete message')).toBeInTheDocument();
      expect(screen.getByTitle('Timeout (10m) - Right-click for more')).toBeInTheDocument();
      expect(screen.getByTitle('Ban user')).toBeInTheDocument();
      expect(screen.getByTitle('Warn user')).toBeInTheDocument();
    });

    it('does not show mod action buttons when modModeActive is false', () => {
      render(
        <UnifiedChat
          twitchMessages={[baseMessage]}
          ytMessages={[baseYtMessage]}
          isModerator={true}
          modModeActive={false}
          onDeleteMessage={vi.fn()}
          onTimeoutUser={vi.fn()}
          onBanUser={vi.fn()}
          onWarnUser={vi.fn()}
        />
      );
      expect(screen.queryByTitle('Delete message')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Timeout (10m) - Right-click for more')).not.toBeInTheDocument();
    });

    it('shows delete but not timeout/ban/warn for broadcaster messages', () => {
      render(
        <UnifiedChat
          twitchMessages={[broadcasterMessage]}
          ytMessages={[]}
          isModerator={true}
          modModeActive={true}
          onDeleteMessage={vi.fn()}
          onTimeoutUser={vi.fn()}
          onBanUser={vi.fn()}
          onWarnUser={vi.fn()}
        />
      );
      expect(screen.getByTitle('Delete message')).toBeInTheDocument();
      expect(screen.queryByTitle('Timeout (10m) - Right-click for more')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Ban user')).not.toBeInTheDocument();
    });

    it('shows Undo button for timeout messages when isModerator', () => {
      render(
        <UnifiedChat
          twitchMessages={[timeoutMessage]}
          ytMessages={[]}
          isModerator={true}
          onUntimeoutUser={vi.fn()}
        />
      );
      expect(screen.getByTitle('Undo moderation action')).toBeInTheDocument();
    });

    it('calls onDeleteMessage from inline button', () => {
      const onDelete = vi.fn();
      render(
        <UnifiedChat
          twitchMessages={[baseMessage]}
          ytMessages={[]}
          isModerator={true}
          modModeActive={true}
          onDeleteMessage={onDelete}
          onTimeoutUser={vi.fn()}
          onBanUser={vi.fn()}
          onWarnUser={vi.fn()}
        />
      );
      fireEvent.click(screen.getByTitle('Delete message'));
      expect(onDelete).toHaveBeenCalledWith('msg-1');
    });
  });

  describe('MessageInput - Mod Commands', () => {
    it('shows command menu when isModerator and typing /', () => {
      render(
        <MessageInput
          onSendMessage={vi.fn()}
          isLoading={false}
          isConnected={{ twitch: true }}
          isModerator={true}
          chatMessages={[baseMessage]}
          currentUsername="TestUser"
        />
      );

      const textarea = screen.getByPlaceholderText('Type your message');
      fireEvent.change(textarea, { target: { value: '/' } });
      fireEvent.change(textarea, { target: { value: '/ban' } });

      expect(screen.getByText('/ban <username> [reason]')).toBeInTheDocument();
    });

    it('does not show command menu when isModerator is false', () => {
      render(
        <MessageInput
          onSendMessage={vi.fn()}
          isLoading={false}
          isConnected={{ twitch: true }}
          isModerator={false}
          chatMessages={[baseMessage]}
          currentUsername="TestUser"
        />
      );

      const textarea = screen.getByPlaceholderText('Type your message');
      fireEvent.change(textarea, { target: { value: '/ban' } });

      expect(screen.queryByText('Permanently ban a user')).not.toBeInTheDocument();
    });
  });
});