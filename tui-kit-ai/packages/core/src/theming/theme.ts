export type Theme = {
  background: string;
  foreground: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
  border: string;
  muted: string;
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
};

export type StyleProps = {
  theme?: Partial<Theme> & { __base?: 'light' | 'dark' };
  padding?: number | [number, number];
  margin?: number | [number, number];
  borderStyle?: 'line' | 'double' | 'round' | 'bold' | 'classic' | 'none';
  borderColor?: string;
  bg?: string;
  fg?: string;
  align?: 'left' | 'center' | 'right';
};

export function resolveTheme(overrides?: StyleProps['theme']): Theme {
  const base = overrides?.__base === 'light' ? lightTheme : darkTheme;
  const { __base, ...rest } = overrides || {};
  return { ...base, ...rest } as Theme;
}
