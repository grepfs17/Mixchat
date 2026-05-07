import type { ChatMessage } from '../../../lib/types';

export interface MessageMenuState {
  x: number;
  y: number;
  message: ChatMessage;
}

export interface TimeoutMenuState {
  x: number;
  y: number;
  userId: string;
  username: string;
}

export interface EmoteTooltipState {
  url: string;
  name: string;
  x: number;
  y: number;
}

export interface CategoryResult {
  id: string;
  name: string;
}
