import { UITheme } from '../types';

export const defaultTheme: UITheme = {
  primary: '#3B82F6',      // blue
  secondary: '#06B6D4',    // cyan
  success: '#10B981',      // green
  warning: '#F59E0B',      // yellow
  error: '#EF4444',        // red
  info: '#6B7280',         // gray
  muted: '#9CA3AF',        // dim gray
  background: '#000000',   // black
  foreground: '#FFFFFF',   // white
  border: '#374151',       // gray-700
};

export const themes = {
  default: defaultTheme,
  dark: {
    ...defaultTheme,
    background: '#0F172A',
    foreground: '#F1F5F9',
    border: '#334155',
  },
  light: {
    ...defaultTheme,
    background: '#FFFFFF',
    foreground: '#0F172A',
    border: '#E2E8F0',
  },
  cyberpunk: {
    primary: '#FF00FF',
    secondary: '#00FFFF',
    success: '#00FF00',
    warning: '#FFFF00',
    error: '#FF0000',
    info: '#8A2BE2',
    muted: '#696969',
    background: '#000000',
    foreground: '#00FF00',
    border: '#FF00FF',
  },
  retro: {
    primary: '#FFA500',
    secondary: '#FFD700',
    success: '#32CD32',
    warning: '#FF6347',
    error: '#DC143C',
    info: '#87CEEB',
    muted: '#808080',
    background: '#000000',
    foreground: '#00FF00',
    border: '#FFA500',
  }
};

export function getTheme(name: keyof typeof themes = 'default'): UITheme {
  return themes[name] || themes.default;
}

export function createCustomTheme(overrides: Partial<UITheme>): UITheme {
  return { ...defaultTheme, ...overrides };
}