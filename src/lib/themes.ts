import type { ChatTheme } from '../lib/types';
import { setThemeBackgroundColor } from './chatColors';

export interface ThemeColors {
  '--color-bg-primary': string;
  '--color-bg-secondary': string;
  '--color-bg-tertiary': string;
  '--color-bg-hover': string;
  '--color-bg-message-hover': string;
  '--color-bg-bot': string;
  '--color-border-dark': string;
  '--color-border-medium': string;
  '--color-border-light': string;
  '--color-border-lighter': string;
  '--color-text-primary': string;
  '--color-text-secondary': string;
  '--color-text-muted': string;
  '--color-text-chat': string;
  '--color-text-timestamp': string;
  '--color-autocomplete-bg': string;
  '--color-autocomplete-border': string;
  '--color-autocomplete-selected': string;
  '--color-autocomplete-hover': string;
  '--color-bg-mention': string;
  '--color-border-mention': string;
  '--color-bg-twitch-event': string;
  '--color-border-twitch-event': string;
  '--color-bg-cheer-event': string;
  '--color-border-cheer-event': string;
  '--color-warning-bg': string;
  '--color-warning-border': string;
  '--color-warning-text': string;
  '--color-accent': string;
  '--color-accent-hover': string;
  '--color-indigo': string;
  '--color-indigo-hover': string;
  '--shadow-accent-sm': string;
  '--shadow-accent-md': string;
  '--shadow-accent-lg': string;
  '--shadow-glow-accent': string;
  '--shadow-glow-indigo': string;
}

export const THEME_COLORS: Record<Exclude<ChatTheme, 'default'>, ThemeColors> = {
  'one-dark': {
    '--color-bg-primary': '#282c34',
    '--color-bg-secondary': '#21252b',
    '--color-bg-tertiary': '#181a1f',
    '--color-bg-hover': '#3e4452',
    '--color-bg-message-hover': '#3e4452',
    '--color-bg-bot': '#1e2227',
    '--color-border-dark': '#181a1f',
    '--color-border-medium': '#3e4452',
    '--color-border-light': '#5c6370',
    '--color-border-lighter': '#6b7280',
    '--color-text-primary': '#abb2bf',
    '--color-text-secondary': '#828997',
    '--color-text-muted': '#5c6370',
    '--color-text-chat': '#abb2bf',
    '--color-text-timestamp': '#828997',
    '--color-autocomplete-bg': '#21252b',
    '--color-autocomplete-border': '#3e4452',
    '--color-autocomplete-selected': '#3e4452',
    '--color-autocomplete-hover': '#4b5263',
    '--color-bg-mention': 'rgba(97, 175, 239, 0.2)',
    '--color-border-mention': '#61afef',
    '--color-bg-twitch-event': 'rgba(198, 120, 221, 0.3)',
    '--color-border-twitch-event': '#c678dd',
    '--color-bg-cheer-event': 'rgba(229, 192, 123, 0.3)',
    '--color-border-cheer-event': '#e5c07b',
    '--color-warning-bg': '#3d2817',
    '--color-warning-border': '#e5c07b',
    '--color-warning-text': '#e5c07b',
    '--color-accent': '#56b6c2',
    '--color-accent-hover': '#47a3b0',
    '--color-indigo': '#61afef',
    '--color-indigo-hover': '#4e9cdd',
    '--shadow-accent-sm': '0 0 0 3px rgba(86, 182, 194, 0.15)',
    '--shadow-accent-md': '0 4px 16px rgba(86, 182, 194, 0.25)',
    '--shadow-accent-lg': '0 10px 40px rgba(86, 182, 194, 0.2)',
    '--shadow-glow-accent': '0 0 20px rgba(86, 182, 194, 0.4)',
    '--shadow-glow-indigo': '0 0 12px rgba(97, 175, 239, 0.35)',
  },
  'catppuccin': {
    '--color-bg-primary': '#1e1e2e',
    '--color-bg-secondary': '#181825',
    '--color-bg-tertiary': '#11111b',
    '--color-bg-hover': '#313244',
    '--color-bg-message-hover': '#313244',
    '--color-bg-bot': '#181825',
    '--color-border-dark': '#181825',
    '--color-border-medium': '#313244',
    '--color-border-light': '#45475a',
    '--color-border-lighter': '#585b70',
    '--color-text-primary': '#cdd6f4',
    '--color-text-secondary': '#a6adc8',
    '--color-text-muted': '#6c7086',
    '--color-text-chat': '#cdd6f4',
    '--color-text-timestamp': '#a6adc8',
    '--color-autocomplete-bg': '#181825',
    '--color-autocomplete-border': '#45475a',
    '--color-autocomplete-selected': '#313244',
    '--color-autocomplete-hover': '#45475a',
    '--color-bg-mention': 'rgba(137, 180, 250, 0.2)',
    '--color-border-mention': '#89b4fa',
    '--color-bg-twitch-event': 'rgba(203, 166, 247, 0.3)',
    '--color-border-twitch-event': '#cba6f7',
    '--color-bg-cheer-event': 'rgba(249, 226, 175, 0.3)',
    '--color-border-cheer-event': '#f9e2af',
    '--color-warning-bg': '#3d2817',
    '--color-warning-border': '#f9e2af',
    '--color-warning-text': '#f9e2af',
    '--color-accent': '#74c7ec',
    '--color-accent-hover': '#5fb3d8',
    '--color-indigo': '#89b4fa',
    '--color-indigo-hover': '#6fa1f0',
    '--shadow-accent-sm': '0 0 0 3px rgba(116, 199, 236, 0.15)',
    '--shadow-accent-md': '0 4px 16px rgba(116, 199, 236, 0.25)',
    '--shadow-accent-lg': '0 10px 40px rgba(116, 199, 236, 0.2)',
    '--shadow-glow-accent': '0 0 20px rgba(116, 199, 236, 0.4)',
    '--shadow-glow-indigo': '0 0 12px rgba(137, 180, 250, 0.35)',
  },
  'night-owl': {
    '--color-bg-primary': '#011627',
    '--color-bg-secondary': '#00131f',
    '--color-bg-tertiary': '#000f18',
    '--color-bg-hover': '#0b2942',
    '--color-bg-message-hover': '#0b2942',
    '--color-bg-bot': '#00131f',
    '--color-border-dark': '#000f18',
    '--color-border-medium': '#0b2942',
    '--color-border-light': '#1d3b53',
    '--color-border-lighter': '#2a4a63',
    '--color-text-primary': '#d6deeb',
    '--color-text-secondary': '#8892b0',
    '--color-text-muted': '#4a5568',
    '--color-text-chat': '#d6deeb',
    '--color-text-timestamp': '#8892b0',
    '--color-autocomplete-bg': '#00131f',
    '--color-autocomplete-border': '#1d3b53',
    '--color-autocomplete-selected': '#0b2942',
    '--color-autocomplete-hover': '#1d3b53',
    '--color-bg-mention': 'rgba(130, 170, 255, 0.2)',
    '--color-border-mention': '#82aaff',
    '--color-bg-twitch-event': 'rgba(199, 146, 234, 0.3)',
    '--color-border-twitch-event': '#c792ea',
    '--color-bg-cheer-event': 'rgba(255, 203, 107, 0.3)',
    '--color-border-cheer-event': '#ffcb6b',
    '--color-warning-bg': '#3d2817',
    '--color-warning-border': '#ffcb6b',
    '--color-warning-text': '#ffcb6b',
    '--color-accent': '#21c7a8',
    '--color-accent-hover': '#1bae92',
    '--color-indigo': '#82aaff',
    '--color-indigo-hover': '#6b94eb',
    '--shadow-accent-sm': '0 0 0 3px rgba(33, 199, 168, 0.15)',
    '--shadow-accent-md': '0 4px 16px rgba(33, 199, 168, 0.25)',
    '--shadow-accent-lg': '0 10px 40px rgba(33, 199, 168, 0.2)',
    '--shadow-glow-accent': '0 0 20px rgba(33, 199, 168, 0.4)',
    '--shadow-glow-indigo': '0 0 12px rgba(130, 170, 255, 0.35)',
  },
  'monokai': {
    '--color-bg-primary': '#272822',
    '--color-bg-secondary': '#1e1f1c',
    '--color-bg-tertiary': '#181916',
    '--color-bg-hover': '#3e3d32',
    '--color-bg-message-hover': '#3e3d32',
    '--color-bg-bot': '#1e1f1c',
    '--color-border-dark': '#181916',
    '--color-border-medium': '#3e3d32',
    '--color-border-light': '#575647',
    '--color-border-lighter': '#75715e',
    '--color-text-primary': '#f8f8f2',
    '--color-text-secondary': '#a1a094',
    '--color-text-muted': '#75715e',
    '--color-text-chat': '#f8f8f2',
    '--color-text-timestamp': '#a1a094',
    '--color-autocomplete-bg': '#1e1f1c',
    '--color-autocomplete-border': '#575647',
    '--color-autocomplete-selected': '#3e3d32',
    '--color-autocomplete-hover': '#49483e',
    '--color-bg-mention': 'rgba(102, 217, 239, 0.2)',
    '--color-border-mention': '#66d9ef',
    '--color-bg-twitch-event': 'rgba(174, 129, 255, 0.3)',
    '--color-border-twitch-event': '#ae81ff',
    '--color-bg-cheer-event': 'rgba(230, 219, 116, 0.3)',
    '--color-border-cheer-event': '#e6db74',
    '--color-warning-bg': '#3d2817',
    '--color-warning-border': '#e6db74',
    '--color-warning-text': '#e6db74',
    '--color-accent': '#f92672',
    '--color-accent-hover': '#d91f63',
    '--color-indigo': '#ae81ff',
    '--color-indigo-hover': '#966be6',
    '--shadow-accent-sm': '0 0 0 3px rgba(249, 38, 114, 0.15)',
    '--shadow-accent-md': '0 4px 16px rgba(249, 38, 114, 0.25)',
    '--shadow-accent-lg': '0 10px 40px rgba(249, 38, 114, 0.2)',
    '--shadow-glow-accent': '0 0 20px rgba(249, 38, 114, 0.4)',
    '--shadow-glow-indigo': '0 0 12px rgba(174, 129, 255, 0.35)',
  },
  'sublime-material': {
    '--color-bg-primary': '#263238',
    '--color-bg-secondary': '#1e282d',
    '--color-bg-tertiary': '#1a2327',
    '--color-bg-hover': '#37474f',
    '--color-bg-message-hover': '#37474f',
    '--color-bg-bot': '#1e282d',
    '--color-border-dark': '#1a2327',
    '--color-border-medium': '#37474f',
    '--color-border-light': '#546e7a',
    '--color-border-lighter': '#607d8b',
    '--color-text-primary': '#eeffff',
    '--color-text-secondary': '#b0bec5',
    '--color-text-muted': '#546e7a',
    '--color-text-chat': '#eeffff',
    '--color-text-timestamp': '#b0bec5',
    '--color-autocomplete-bg': '#1e282d',
    '--color-autocomplete-border': '#546e7a',
    '--color-autocomplete-selected': '#37474f',
    '--color-autocomplete-hover': '#455a64',
    '--color-bg-mention': 'rgba(130, 170, 255, 0.2)',
    '--color-border-mention': '#82aaff',
    '--color-bg-twitch-event': 'rgba(199, 146, 234, 0.3)',
    '--color-border-twitch-event': '#c792ea',
    '--color-bg-cheer-event': 'rgba(255, 203, 107, 0.3)',
    '--color-border-cheer-event': '#ffcb6b',
    '--color-warning-bg': '#3d2817',
    '--color-warning-border': '#ffcb6b',
    '--color-warning-text': '#ffcb6b',
    '--color-accent': '#ff5370',
    '--color-accent-hover': '#e04058',
    '--color-indigo': '#82aaff',
    '--color-indigo-hover': '#6b94eb',
    '--shadow-accent-sm': '0 0 0 3px rgba(255, 83, 112, 0.15)',
    '--shadow-accent-md': '0 4px 16px rgba(255, 83, 112, 0.25)',
    '--shadow-accent-lg': '0 10px 40px rgba(255, 83, 112, 0.2)',
    '--shadow-glow-accent': '0 0 20px rgba(255, 83, 112, 0.4)',
    '--shadow-glow-indigo': '0 0 12px rgba(130, 170, 255, 0.35)',
  },
  'mushu': {
    '--color-bg-primary': '#1a1111',
    '--color-bg-secondary': '#140d0d',
    '--color-bg-tertiary': '#0f0909',
    '--color-bg-hover': '#3d1c1c',
    '--color-bg-message-hover': '#3d1c1c',
    '--color-bg-bot': '#140d0d',
    '--color-border-dark': '#0f0909',
    '--color-border-medium': '#3d1c1c',
    '--color-border-light': '#5c2b2b',
    '--color-border-lighter': '#7a3a3a',
    '--color-text-primary': '#f5e0e0',
    '--color-text-secondary': '#c9a0a0',
    '--color-text-muted': '#8a5a5a',
    '--color-text-chat': '#f5e0e0',
    '--color-text-timestamp': '#c9a0a0',
    '--color-autocomplete-bg': '#140d0d',
    '--color-autocomplete-border': '#5c2b2b',
    '--color-autocomplete-selected': '#3d1c1c',
    '--color-autocomplete-hover': '#4d2424',
    '--color-bg-mention': 'rgba(220, 50, 50, 0.2)',
    '--color-border-mention': '#dc3232',
    '--color-bg-twitch-event': 'rgba(180, 40, 80, 0.3)',
    '--color-border-twitch-event': '#b42850',
    '--color-bg-cheer-event': 'rgba(200, 100, 40, 0.3)',
    '--color-border-cheer-event': '#c86428',
    '--color-warning-bg': '#3d1a11',
    '--color-warning-border': '#c86428',
    '--color-warning-text': '#ff9050',
    '--color-accent': '#e83333',
    '--color-accent-hover': '#c22828',
    '--color-indigo': '#c97070',
    '--color-indigo-hover': '#b05a5a',
    '--shadow-accent-sm': '0 0 0 3px rgba(232, 51, 51, 0.15)',
    '--shadow-accent-md': '0 4px 16px rgba(232, 51, 51, 0.25)',
    '--shadow-accent-lg': '0 10px 40px rgba(232, 51, 51, 0.2)',
    '--shadow-glow-accent': '0 0 20px rgba(232, 51, 51, 0.4)',
    '--shadow-glow-indigo': '0 0 12px rgba(201, 112, 112, 0.35)',
  },
  'lunita': {
    '--color-bg-primary': '#1e2a1e',
    '--color-bg-secondary': '#182218',
    '--color-bg-tertiary': '#131c13',
    '--color-bg-hover': '#2d4a2d',
    '--color-bg-message-hover': '#2d4a2d',
    '--color-bg-bot': '#182218',
    '--color-border-dark': '#131c13',
    '--color-border-medium': '#2d4a2d',
    '--color-border-light': '#3d6b3d',
    '--color-border-lighter': '#5a8a5a',
    '--color-text-primary': '#e8dcc8',
    '--color-text-secondary': '#b8a88a',
    '--color-text-muted': '#7a6b52',
    '--color-text-chat': '#e8dcc8',
    '--color-text-timestamp': '#b8a88a',
    '--color-autocomplete-bg': '#182218',
    '--color-autocomplete-border': '#3d6b3d',
    '--color-autocomplete-selected': '#2d4a2d',
    '--color-autocomplete-hover': '#3a5a3a',
    '--color-bg-mention': 'rgba(144, 190, 109, 0.2)',
    '--color-border-mention': '#90be6d',
    '--color-bg-twitch-event': 'rgba(160, 120, 180, 0.3)',
    '--color-border-twitch-event': '#a078b4',
    '--color-bg-cheer-event': 'rgba(200, 170, 100, 0.3)',
    '--color-border-cheer-event': '#c8aa64',
    '--color-warning-bg': '#2d2218',
    '--color-warning-border': '#c8aa64',
    '--color-warning-text': '#e8d490',
    '--color-accent': '#d4a54a',
    '--color-accent-hover': '#b8903e',
    '--color-indigo': '#8aba6a',
    '--color-indigo-hover': '#72a152',
    '--shadow-accent-sm': '0 0 0 3px rgba(212, 165, 74, 0.15)',
    '--shadow-accent-md': '0 4px 16px rgba(212, 165, 74, 0.25)',
    '--shadow-accent-lg': '0 10px 40px rgba(212, 165, 74, 0.2)',
    '--shadow-glow-accent': '0 0 20px rgba(212, 165, 74, 0.4)',
    '--shadow-glow-indigo': '0 0 12px rgba(138, 186, 106, 0.35)',
  },
};

export function applyTheme(theme: ChatTheme) {
  const root = document.documentElement;
  if (theme === 'default') {
    for (const key of Object.keys(THEME_COLORS['one-dark'])) {
      root.style.removeProperty(key);
    }
    root.removeAttribute('data-theme');
  } else {
    const colors = THEME_COLORS[theme as Exclude<ChatTheme, 'default'>];
    for (const [key, value] of Object.entries(colors)) {
      root.style.setProperty(key, value);
    }
    root.setAttribute('data-theme', theme);
  }
  // Keep the username-contrast helper in sync with the new background
  const bg = getComputedStyle(root).getPropertyValue('--color-bg-primary').trim();
  if (bg) setThemeBackgroundColor(bg);
}
