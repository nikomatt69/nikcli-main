export type Theme = {
  background: string;
  foreground: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
  border: string;
  muted: string;
  secondary: string;
  surface: string;
  hover: string;
  active: string;
  disabled: string;
  borderFocus: string;
  glow: string;
  shadow: string;
  info: string;
};

export const lightTheme: Theme = {
  background: '#ffffff',
  foreground: '#1f2937',
  accent: '#4f46e5',
  success: '#16a34a',
  warning: '#f59e0b',
  error: '#dc2626',
  border: '#d1d5db',
  muted: '#6b7280',
  secondary: '#6b7280',
  surface: '#f9fafb',
  hover: '#f3f4f6',
  active: '#e5e7eb',
  disabled: '#9ca3af',
  borderFocus: '#3b82f6',
  glow: '#3b82f6',
  shadow: '#000000',
  info: '#0ea5e9',
};

export const darkTheme: Theme = {
  background: '#0b1020',
  foreground: '#e5e7eb',
  accent: '#8b5cf6',
  success: '#22c55e',
  warning: '#fbbf24',
  error: '#ef4444',
  border: '#374151',
  muted: '#9ca3af',
  secondary: '#6b7280',
  surface: '#1f2937',
  hover: '#374151',
  active: '#4b5563',
  disabled: '#6b7280',
  borderFocus: '#8b5cf6',
  glow: '#8b5cf6',
  shadow: '#000000',
  info: '#0ea5e9',
};

export type StyleProps = {
  theme?: Partial<Theme> & { __base?: 'light' | 'dark' };
  padding?: number | [number, number] | [number, number, number, number] | { top?: number; right?: number; bottom?: number; left?: number };
  margin?: number | [number, number] | [number, number, number, number] | { top?: number; right?: number; bottom?: number; left?: number };
  borderStyle?: 'line' | 'double' | 'round' | 'bold' | 'classic' | 'none';
  borderColor?: string | number;
  // Keep in sync with Zod StylePropsSchema
  border?: any;
  bg?: string | number;
  fg?: string | number;
  align?: 'left' | 'center' | 'right';
  variant?: string;
  size?: string;
  palette?: string;
  glow?: boolean;
  shadow?: boolean;
  opacity?: number;
  gradient?: { from: string; to: string; direction?: string };
  borderWidth?: number;
  style?: any;
  animation?: string;
};

export function resolveTheme(overrides?: StyleProps['theme']): Theme {
  const base = overrides?.__base === 'light' ? lightTheme : darkTheme;
  const { __base, ...rest } = overrides || {};
  return { ...base, ...rest } as Theme;
}

// Color palettes for advanced styling
export const colorPalettes = {
  primary: {
    accent: '#4f46e5',
    glow: '#8b5cf6',
  },
  success: {
    accent: '#16a34a',
    glow: '#22c55e',
  },
  warning: {
    accent: '#f59e0b',
    glow: '#fbbf24',
  },
  error: {
    accent: '#dc2626',
    glow: '#ef4444',
  },
  info: {
    accent: '#0ea5e9',
    glow: '#38bdf8',
  },
};
