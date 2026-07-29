import type { TwitchMessage } from "../../../lib/types";

export interface MessageMenuState {
  x: number;
  y: number;
  message: TwitchMessage;
}

interface TimeoutMenuState {
  x: number;
  y: number;
  userId: string;
  username: string;
}

export interface EmoteTooltipState {
  url: string;
  name: string;
  source: string;
  author?: string;
  x: number;
  y: number;
}

export interface CategoryResult {
  id: string;
  name: string;
}
