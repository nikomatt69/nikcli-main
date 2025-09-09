/**
 * Type-safe theming system for TUI-Kit-AI
 * Inspired by shadcn/ui's CSS variables approach adapted for terminal
 */

import type { 
  ColorValue, 
  ComponentVariant, 
  ComponentSize, 
  ThemeMode 
} from '../types/core-types';

// ===== DESIGN TOKENS =====

/**
 * Core color palette - semantic colors that adapt to theme mode
 */
export interface ColorTokens {
  readonly background: ColorValue;
  readonly foreground: ColorValue;
  readonly card: ColorValue;
  readonly cardForeground: ColorValue;
  readonly popover: ColorValue;
  readonly popoverForeground: ColorValue;
  readonly primary: ColorValue;
  readonly primaryForeground: ColorValue;
  readonly secondary: ColorValue;
  readonly secondaryForeground: ColorValue;
  readonly muted: ColorValue;
  readonly mutedForeground: ColorValue;
  readonly accent: ColorValue;
  readonly accentForeground: ColorValue;
  readonly destructive: ColorValue;
  readonly destructiveForeground: ColorValue;
  readonly border: ColorValue;
  readonly input: ColorValue;
  readonly ring: ColorValue;
  readonly success: ColorValue;
  readonly successForeground: ColorValue;
  readonly warning: ColorValue;
  readonly warningForeground: ColorValue;
  readonly info: ColorValue;
  readonly infoForeground: ColorValue;
}

/**
 * Extended color palette for richer theming
 */
export interface ExtendedColorTokens {
  // Base semantic colors
  readonly background: ColorValue;
  readonly foreground: ColorValue;
  readonly card: ColorValue;
  readonly cardForeground: ColorValue;
  readonly popover: ColorValue;
  readonly popoverForeground: ColorValue;
  readonly primary: ColorValue;
  readonly primaryForeground: ColorValue;
  readonly secondary: ColorValue;
  readonly secondaryForeground: ColorValue;
  readonly muted: ColorValue;
  readonly mutedForeground: ColorValue;
  readonly accent: ColorValue;
  readonly accentForeground: ColorValue;
  readonly destructive: ColorValue;
  readonly destructiveForeground: ColorValue;
  readonly border: ColorValue;
  readonly input: ColorValue;
  readonly ring: ColorValue;
  readonly success: ColorValue;
  readonly successForeground: ColorValue;
  readonly warning: ColorValue;
  readonly warningForeground: ColorValue;
  readonly info: ColorValue;
  readonly infoForeground: ColorValue;

  // Extended color scales
  readonly neutral: Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950, ColorValue>;
  readonly primaryScale: Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950, ColorValue>;
  readonly secondaryScale: Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950, ColorValue>;
  readonly accentScale: Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950, ColorValue>;
  readonly destructiveScale: Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950, ColorValue>;
  readonly successScale: Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950, ColorValue>;
  readonly warningScale: Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950, ColorValue>;
  readonly infoScale: Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950, ColorValue>;
}

/**
 * Spacing tokens for consistent layout
 */
export interface SpacingTokens {
  readonly px: number;
  readonly 0: number;
  readonly 0.5: number;
  readonly 1: number;
  readonly 1.5: number;
  readonly 2: number;
  readonly 2.5: number;
  readonly 3: number;
  readonly 3.5: number;
  readonly 4: number;
  readonly 5: number;
  readonly 6: number;
  readonly 7: number;
  readonly 8: number;
  readonly 9: number;
  readonly 10: number;
  readonly 11: number;
  readonly 12: number;
  readonly 14: number;
  readonly 16: number;
  readonly 20: number;
  readonly 24: number;
  readonly 28: number;
  readonly 32: number;
  readonly 36: number;
  readonly 40: number;
  readonly 44: number;
  readonly 48: number;
  readonly 52: number;
  readonly 56: number;
  readonly 60: number;
  readonly 64: number;
  readonly 72: number;
  readonly 80: number;
  readonly 96: number;
}

/**
 * Border radius tokens
 */
export interface BorderRadiusTokens {
  readonly none: string;
  readonly sm: string;
  readonly md: string;
  readonly lg: string;
  readonly xl: string;
  readonly '2xl': string;
  readonly '3xl': string;
  readonly full: string;
}

/**
 * Typography tokens
 */
export interface TypographyTokens {
  readonly fontFamily: {
    readonly sans: readonly string[];
    readonly serif: readonly string[];
    readonly mono: readonly string[];
  };
  readonly fontSize: Record<ComponentSize, { size: number; lineHeight: number }>;
  readonly fontWeight: {
    readonly thin: number;
    readonly extralight: number;
    readonly light: number;
    readonly normal: number;
    readonly medium: number;
    readonly semibold: number;
    readonly bold: number;
    readonly extrabold: number;
    readonly black: number;
  };
  readonly letterSpacing: {
    readonly tighter: string;
    readonly tight: string;
    readonly normal: string;
    readonly wide: string;
    readonly wider: string;
    readonly widest: string;
  };
}

/**
 * Animation tokens for consistent motion
 */
export interface AnimationTokens {
  readonly duration: {
    readonly fastest: number;
    readonly faster: number;
    readonly fast: number;
    readonly normal: number;
    readonly slow: number;
    readonly slower: number;
    readonly slowest: number;
  };
  readonly easing: {
    readonly linear: string;
    readonly easeIn: string;
    readonly easeOut: string;
    readonly easeInOut: string;
    readonly bounce: string;
    readonly elastic: string;
  };
}

/**
 * Complete design token system
 */
export interface DesignTokens {
  readonly colors: ExtendedColorTokens;
  readonly spacing: SpacingTokens;
  readonly borderRadius: BorderRadiusTokens;
  readonly typography: TypographyTokens;
  readonly animation: AnimationTokens;
}

// ===== THEME CONFIGURATION =====

/**
 * Component style tokens
 */
export interface ComponentStyleTokens {
  readonly bg: ColorValue;
  readonly fg: ColorValue;
  readonly border: ColorValue;
  readonly borderRadius: keyof BorderRadiusTokens;
  readonly padding: {
    readonly x: keyof SpacingTokens;
    readonly y: keyof SpacingTokens;
  };
  readonly states: {
    readonly hover: Partial<ComponentStyleTokens>;
    readonly focus: Partial<ComponentStyleTokens>;
    readonly active: Partial<ComponentStyleTokens>;
    readonly disabled: Partial<ComponentStyleTokens>;
  };
}

/**
 * Component size tokens
 */
export interface ComponentSizeTokens {
  readonly height: number;
  readonly fontSize: keyof TypographyTokens['fontSize'];
  readonly padding: {
    readonly x: keyof SpacingTokens;
    readonly y: keyof SpacingTokens;
  };
}

/**
 * Variant configuration for components
 */
export interface ComponentVariantConfig {
  readonly variants: Record<ComponentVariant, ComponentStyleTokens>;
  readonly sizes: Record<ComponentSize, ComponentSizeTokens>;
  readonly defaultVariant: ComponentVariant;
  readonly defaultSize: ComponentSize;
}

/**
 * Component-specific theme configuration
 */
export interface ComponentThemeConfig {
  readonly button: ComponentVariantConfig;
  readonly input: ComponentVariantConfig;
  readonly badge: ComponentVariantConfig;
  readonly card: ComponentVariantConfig;
  readonly alert: ComponentVariantConfig;
}

/**
 * Theme configuration interface
 */
export interface ThemeSystemConfig {
  readonly name: string;
  readonly mode: ThemeMode;
  readonly tokens: DesignTokens;
  readonly components: ComponentThemeConfig;
}

// ===== DEFAULT THEME DEFINITIONS =====

/**
 * Default spacing tokens
 */
export const defaultSpacing: SpacingTokens = {
  px: 1,
  0: 0,
  0.5: 1,
  1: 1,
  1.5: 1,
  2: 2,
  2.5: 2,
  3: 3,
  3.5: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9,
  10: 10,
  11: 11,
  12: 12,
  14: 14,
  16: 16,
  20: 20,
  24: 24,
  28: 28,
  32: 32,
  36: 36,
  40: 40,
  44: 44,
  48: 48,
  52: 52,
  56: 56,
  60: 60,
  64: 64,
  72: 72,
  80: 80,
  96: 96
} as const;

/**
 * Default border radius tokens (adapted for terminal)
 */
export const defaultBorderRadius: BorderRadiusTokens = {
  none: 'none',
  sm: 'sm',
  md: 'md', 
  lg: 'lg',
  xl: 'xl',
  '2xl': '2xl',
  '3xl': '3xl',
  full: 'full'
} as const;

/**
 * Default typography tokens
 */
export const defaultTypography: TypographyTokens = {
  fontFamily: {
    sans: ['ui-sans-serif', 'system-ui'],
    serif: ['ui-serif', 'Georgia'],
    mono: ['ui-monospace', 'SFMono-Regular']
  },
  fontSize: {
    xs: { size: 12, lineHeight: 16 },
    sm: { size: 14, lineHeight: 20 },
    md: { size: 16, lineHeight: 24 },
    lg: { size: 18, lineHeight: 28 },
    xl: { size: 20, lineHeight: 32 }
  },
  fontWeight: {
    thin: 100,
    extralight: 200,
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
    black: 900
  },
  letterSpacing: {
    tighter: '-0.05em',
    tight: '-0.025em',
    normal: '0em',
    wide: '0.025em',
    wider: '0.05em',
    widest: '0.1em'
  }
} as const;

/**
 * Default animation tokens
 */
export const defaultAnimation: AnimationTokens = {
  duration: {
    fastest: 50,
    faster: 100,
    fast: 150,
    normal: 200,
    slow: 300,
    slower: 400,
    slowest: 500
  },
  easing: {
    linear: 'linear',
    easeIn: 'ease-in',
    easeOut: 'ease-out',
    easeInOut: 'ease-in-out',
    bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
    elastic: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)'
  }
} as const;

/**
 * Light theme color tokens
 */
export const lightColorTokens: ExtendedColorTokens = {
  // Base semantic colors
  background: 'white',
  foreground: 'black',
  card: '#f8f9fa',
  cardForeground: 'black',
  popover: 'white',
  popoverForeground: 'black',
  primary: '#0070f3',
  primaryForeground: 'white',
  secondary: '#6c757d',
  secondaryForeground: 'white',
  muted: '#f8f9fa',
  mutedForeground: '#6c757d',
  accent: '#007bff',
  accentForeground: 'white',
  destructive: '#dc3545',
  destructiveForeground: 'white',
  border: '#e9ecef',
  input: '#e9ecef',
  ring: '#007bff',
  success: '#28a745',
  successForeground: 'white',
  warning: '#ffc107',
  warningForeground: 'black',
  info: '#17a2b8',
  infoForeground: 'white',

  // Extended color scales
  neutral: {
    50: '#f8f9fa',
    100: '#f1f3f4',
    200: '#e9ecef',
    300: '#dee2e6',
    400: '#ced4da',
    500: '#adb5bd',
    600: '#6c757d',
    700: '#495057',
    800: '#343a40',
    900: '#212529',
    950: '#0d1117'
  },
  primaryScale: {
    50: '#eff6ff',
    100: '#dbeafe', 
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
    950: '#172554'
  },
  secondaryScale: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
    950: '#020617'
  },
  accentScale: {
    50: '#fef7ff',
    100: '#fdf2ff',
    200: '#fae5ff',
    300: '#f5d0fe',
    400: '#e9a3fc',
    500: '#d946ef',
    600: '#c026d3',
    700: '#a21caf',
    800: '#86198f',
    900: '#701a75',
    950: '#4a044e'
  },
  destructiveScale: {
    50: '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    300: '#fca5a5',
    400: '#f87171',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
    800: '#991b1b',
    900: '#7f1d1d',
    950: '#450a0a'
  },
  successScale: {
    50: '#f0fdf4',
    100: '#dcfce7',
    200: '#bbf7d0',
    300: '#86efac',
    400: '#4ade80',
    500: '#22c55e',
    600: '#16a34a',
    700: '#15803d',
    800: '#166534',
    900: '#14532d',
    950: '#052e16'
  },
  warningScale: {
    50: '#fffbeb',
    100: '#fef3c7',
    200: '#fde68a',
    300: '#fcd34d',
    400: '#fbbf24',
    500: '#f59e0b',
    600: '#d97706',
    700: '#b45309',
    800: '#92400e',
    900: '#78350f',
    950: '#451a03'
  },
  infoScale: {
    50: '#f0f9ff',
    100: '#e0f2fe',
    200: '#bae6fd',
    300: '#7dd3fc',
    400: '#38bdf8',
    500: '#0ea5e9',
    600: '#0284c7',
    700: '#0369a1',
    800: '#075985',
    900: '#0c4a6e',
    950: '#082f49'
  }
} as const;

/**
 * Dark theme color tokens
 */
export const darkColorTokens: ExtendedColorTokens = {
  // Base semantic colors  
  background: '#0d1117',
  foreground: '#f0f6fc',
  card: '#161b22',
  cardForeground: '#f0f6fc',
  popover: '#161b22',
  popoverForeground: '#f0f6fc',
  primary: '#2f81f7',
  primaryForeground: '#0d1117',
  secondary: '#21262d',
  secondaryForeground: '#f0f6fc',
  muted: '#21262d',
  mutedForeground: '#8b949e',
  accent: '#388bfd',
  accentForeground: '#0d1117',
  destructive: '#f85149',
  destructiveForeground: '#0d1117',
  border: '#30363d',
  input: '#21262d',
  ring: '#2f81f7',
  success: '#3fb950',
  successForeground: '#0d1117',
  warning: '#d29922',
  warningForeground: '#0d1117',
  info: '#58a6ff',
  infoForeground: '#0d1117',

  // Extended color scales (dark theme optimized)
  neutral: {
    50: '#0d1117',
    100: '#161b22',
    200: '#21262d',
    300: '#30363d',
    400: '#484f58',
    500: '#6e7681',
    600: '#8b949e',
    700: '#b1bac4',
    800: '#c9d1d9',
    900: '#f0f6fc',
    950: '#ffffff'
  },
  primaryScale: {
    50: '#0d1117',
    100: '#0969da',
    200: '#1f6feb',
    300: '#2f81f7',
    400: '#388bfd',
    500: '#58a6ff',
    600: '#79c0ff',
    700: '#a5d6ff',
    800: '#c9d1d9',
    900: '#f0f6fc',
    950: '#ffffff'
  },
  secondaryScale: {
    50: '#0d1117',
    100: '#161b22',
    200: '#21262d',
    300: '#30363d',
    400: '#484f58',
    500: '#6e7681',
    600: '#8b949e',
    700: '#b1bac4',
    800: '#c9d1d9',
    900: '#f0f6fc',
    950: '#ffffff'
  },
  accentScale: {
    50: '#0d1117',
    100: '#1a1e2e',
    200: '#2d2d2d',
    300: '#484f58',
    400: '#6e7681',
    500: '#8b949e',
    600: '#b1bac4',
    700: '#c9d1d9',
    800: '#e6edf3',
    900: '#f0f6fc',
    950: '#ffffff'
  },
  destructiveScale: {
    50: '#0d1117',
    100: '#4c1a1a',
    200: '#86181d',
    300: '#da3633',
    400: '#f85149',
    500: '#ff6166',
    600: '#ff7b81',
    700: '#ffa198',
    800: '#ffc1bf',
    900: '#ffe0df',
    950: '#fff5f5'
  },
  successScale: {
    50: '#0d1117',
    100: '#0f2419',
    200: '#033a16',
    300: '#0f5132',
    400: '#238636',
    500: '#2ea043',
    600: '#3fb950',
    700: '#56d364',
    800: '#7ee787',
    900: '#aff5b4',
    950: '#d3f5d3'
  },
  warningScale: {
    50: '#0d1117',
    100: '#341a00',
    200: '#4d2d00',
    300: '#9e6a03',
    400: '#bf8700',
    500: '#d29922',
    600: '#e3b341',
    700: '#f0cc5e',
    800: '#ffdf5d',
    900: '#fff8dc',
    950: '#fffef7'
  },
  infoScale: {
    50: '#0d1117',
    100: '#0c1929',
    200: '#0969da',
    300: '#1f6feb',
    400: '#388bfd',
    500: '#58a6ff',
    600: '#79c0ff',
    700: '#a5d6ff',
    800: '#c9d1d9',
    900: '#f0f6fc',
    950: '#ffffff'
  }
} as const;

// ===== THEME UTILITIES =====

/**
 * Create a complete theme configuration
 */
export function createTheme(config: {
  name: string;
  mode: ThemeMode;
  colors?: Partial<ExtendedColorTokens>;
  spacing?: Partial<SpacingTokens>;
  borderRadius?: Partial<BorderRadiusTokens>;
  typography?: Partial<TypographyTokens>;
  animation?: Partial<AnimationTokens>;
}): ThemeSystemConfig {
  const baseColors = config.mode === 'light' ? lightColorTokens : darkColorTokens;
  
  return {
    name: config.name,
    mode: config.mode,
    tokens: {
      colors: { ...baseColors, ...config.colors },
      spacing: { ...defaultSpacing, ...config.spacing },
      borderRadius: { ...defaultBorderRadius, ...config.borderRadius },
      typography: { ...defaultTypography, ...config.typography },
      animation: { ...defaultAnimation, ...config.animation }
    },
    components: createDefaultComponentThemes(config.mode)
  };
}

/**
 * Default light theme
 */
export const defaultLightTheme = createTheme({
  name: 'Default Light',
  mode: 'light'
});

/**
 * Default dark theme
 */
export const defaultDarkTheme = createTheme({
  name: 'Default Dark',
  mode: 'dark'
});

/**
 * Get theme based on mode preference
 */
export function getDefaultTheme(mode: ThemeMode = 'dark'): ThemeSystemConfig {
  return mode === 'light' ? defaultLightTheme : defaultDarkTheme;
}

/**
 * Resolve color value from theme tokens
 */
export function resolveColorToken(colorValue: ColorValue, tokens: ExtendedColorTokens): string {
  // Handle token references like 'primaryScale.500' or 'neutral.800'
  if (typeof colorValue === 'string' && colorValue.includes('.')) {
    const parts = colorValue.split('.');
    if (parts.length === 2) {
      const [namespace, variant] = parts;
      const colorScale = (tokens as any)[namespace];
      if (colorScale && typeof colorScale === 'object' && variant in colorScale) {
        return colorScale[variant as keyof typeof colorScale] as string;
      }
    }
  }
  
  // Return as-is for direct color values
  return colorValue as string;
}

/**
 * Get component theme configuration
 */
export function getComponentTheme<T extends keyof ComponentThemeConfig>(
  theme: ThemeSystemConfig,
  componentName: T
): ComponentThemeConfig[T] {
  return theme.components[componentName];
}

/**
 * Get component variant styles
 */
export function getComponentVariantStyles<T extends keyof ComponentThemeConfig>(
  theme: ThemeSystemConfig,
  componentName: T,
  variant: ComponentVariant,
  size: ComponentSize
): { styles: ComponentStyleTokens; sizeTokens: ComponentSizeTokens } {
  const componentTheme = getComponentTheme(theme, componentName);
  const styles = componentTheme.variants[variant] || componentTheme.variants[componentTheme.defaultVariant];
  const sizeTokens = componentTheme.sizes[size] || componentTheme.sizes[componentTheme.defaultSize];
  
  return { styles, sizeTokens };
}

/**
 * Create component styles with resolved colors
 */
export function createComponentStyles<T extends keyof ComponentThemeConfig>(
  theme: ThemeSystemConfig,
  componentName: T,
  variant: ComponentVariant = 'default',
  size: ComponentSize = 'md'
): {
  bg: string;
  fg: string;
  border: string;
  height: number;
  fontSize: keyof TypographyTokens['fontSize'];
  padding: { x: number; y: number };
} {
  const { styles, sizeTokens } = getComponentVariantStyles(theme, componentName, variant, size);
  
  return {
    bg: resolveColorToken(styles.bg, theme.tokens.colors),
    fg: resolveColorToken(styles.fg, theme.tokens.colors), 
    border: resolveColorToken(styles.border, theme.tokens.colors),
    height: sizeTokens.height,
    fontSize: sizeTokens.fontSize,
    padding: {
      x: theme.tokens.spacing[sizeTokens.padding.x],
      y: theme.tokens.spacing[sizeTokens.padding.y]
    }
  };
}

/**
 * Create default component theme configurations
 */
function createDefaultComponentThemes(mode: ThemeMode): ComponentThemeConfig {
  const colors = mode === 'light' ? lightColorTokens : darkColorTokens;
  
  return {
    button: {
      defaultVariant: 'default',
      defaultSize: 'md',
      variants: {
        default: {
          bg: colors.background,
          fg: colors.foreground,
          border: colors.border,
          borderRadius: 'md',
          padding: { x: 4, y: 2 },
          states: {
            hover: { bg: colors.muted },
            focus: { border: colors.ring },
            active: { bg: colors.accent, fg: colors.accentForeground },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        primary: {
          bg: 'primaryScale.600',
          fg: 'primaryScale.50',
          border: 'primaryScale.600',
          borderRadius: 'md',
          padding: { x: 4, y: 2 },
          states: {
            hover: { bg: 'primaryScale.700' },
            focus: { border: colors.ring },
            active: { bg: 'primaryScale.800' },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        secondary: {
          bg: 'secondaryScale.200',
          fg: 'secondaryScale.800',
          border: 'secondaryScale.200',
          borderRadius: 'md',
          padding: { x: 4, y: 2 },
          states: {
            hover: { bg: 'secondaryScale.300' },
            focus: { border: colors.ring },
            active: { bg: 'secondaryScale.400' },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        destructive: {
          bg: 'destructiveScale.600',
          fg: 'destructiveScale.50',
          border: 'destructiveScale.600',
          borderRadius: 'md',
          padding: { x: 4, y: 2 },
          states: {
            hover: { bg: 'destructiveScale.700' },
            focus: { border: colors.ring },
            active: { bg: 'destructiveScale.800' },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        outline: {
          bg: 'transparent',
          fg: colors.foreground,
          border: colors.border,
          borderRadius: 'md',
          padding: { x: 4, y: 2 },
          states: {
            hover: { bg: colors.muted },
            focus: { border: colors.ring },
            active: { bg: colors.accent, fg: colors.accentForeground },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        ghost: {
          bg: 'transparent',
          fg: colors.foreground,
          border: 'transparent',
          borderRadius: 'md',
          padding: { x: 4, y: 2 },
          states: {
            hover: { bg: colors.muted },
            focus: { border: colors.ring },
            active: { bg: colors.accent, fg: colors.accentForeground },
            disabled: { fg: colors.mutedForeground }
          }
        },
        link: {
          bg: 'transparent',
          fg: 'primaryScale.600',
          border: 'transparent',
          borderRadius: 'none',
          padding: { x: 0, y: 0 },
          states: {
            hover: { fg: 'primaryScale.700' },
            focus: { border: colors.ring },
            active: { fg: 'primaryScale.800' },
            disabled: { fg: colors.mutedForeground }
          }
        },
        success: {
          bg: 'successScale.600',
          fg: 'successScale.50',
          border: 'successScale.600',
          borderRadius: 'md',
          padding: { x: 4, y: 2 },
          states: {
            hover: { bg: 'successScale.700' },
            focus: { border: colors.ring },
            active: { bg: 'successScale.800' },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        warning: {
          bg: 'warningScale.600',
          fg: 'warningScale.50',
          border: 'warningScale.600',
          borderRadius: 'md',
          padding: { x: 4, y: 2 },
          states: {
            hover: { bg: 'warningScale.700' },
            focus: { border: colors.ring },
            active: { bg: 'warningScale.800' },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        error: {
          bg: 'destructiveScale.600',
          fg: 'destructiveScale.50',
          border: 'destructiveScale.600',
          borderRadius: 'md',
          padding: { x: 4, y: 2 },
          states: {
            hover: { bg: 'destructiveScale.700' },
            focus: { border: colors.ring },
            active: { bg: 'destructiveScale.800' },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        info: {
          bg: 'infoScale.600',
          fg: 'infoScale.50',
          border: 'infoScale.600',
          borderRadius: 'md',
          padding: { x: 4, y: 2 },
          states: {
            hover: { bg: 'infoScale.700' },
            focus: { border: colors.ring },
            active: { bg: 'infoScale.800' },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        }
      },
      sizes: {
        xs: { height: 6, fontSize: 'xs', padding: { x: 2, y: 1 } },
        sm: { height: 8, fontSize: 'sm', padding: { x: 3, y: 1.5 } },
        md: { height: 10, fontSize: 'md', padding: { x: 4, y: 2 } },
        lg: { height: 12, fontSize: 'lg', padding: { x: 6, y: 2.5 } },
        xl: { height: 14, fontSize: 'xl', padding: { x: 8, y: 3 } }
      }
    },
    input: {
      defaultVariant: 'default',
      defaultSize: 'md',
      variants: {
        default: {
          bg: colors.input,
          fg: colors.foreground,
          border: colors.border,
          borderRadius: 'md',
          padding: { x: 3, y: 2 },
          states: {
            hover: { border: colors.ring },
            focus: { border: colors.ring },
            active: { border: colors.ring },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        primary: {
          bg: colors.input,
          fg: colors.foreground,
          border: 'primaryScale.300',
          borderRadius: 'md',
          padding: { x: 3, y: 2 },
          states: {
            hover: { border: 'primaryScale.400' },
            focus: { border: 'primaryScale.500' },
            active: { border: 'primaryScale.500' },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        secondary: {
          bg: colors.input,
          fg: colors.foreground,
          border: colors.border,
          borderRadius: 'md',
          padding: { x: 3, y: 2 },
          states: {
            hover: { border: colors.ring },
            focus: { border: colors.ring },
            active: { border: colors.ring },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        destructive: {
          bg: colors.input,
          fg: colors.foreground,
          border: 'destructiveScale.300',
          borderRadius: 'md',
          padding: { x: 3, y: 2 },
          states: {
            hover: { border: 'destructiveScale.400' },
            focus: { border: 'destructiveScale.500' },
            active: { border: 'destructiveScale.500' },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        outline: {
          bg: 'transparent',
          fg: colors.foreground,
          border: colors.border,
          borderRadius: 'md',
          padding: { x: 3, y: 2 },
          states: {
            hover: { border: colors.ring },
            focus: { border: colors.ring },
            active: { border: colors.ring },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        ghost: {
          bg: 'transparent',
          fg: colors.foreground,
          border: 'transparent',
          borderRadius: 'md',
          padding: { x: 3, y: 2 },
          states: {
            hover: { bg: colors.muted },
            focus: { border: colors.ring },
            active: { bg: colors.muted },
            disabled: { fg: colors.mutedForeground }
          }
        },
        link: {
          bg: 'transparent',
          fg: colors.foreground,
          border: 'transparent',
          borderRadius: 'none',
          padding: { x: 0, y: 0 },
          states: {
            hover: { fg: colors.ring },
            focus: { border: colors.ring },
            active: { fg: colors.ring },
            disabled: { fg: colors.mutedForeground }
          }
        },
        success: {
          bg: colors.input,
          fg: colors.foreground,
          border: 'successScale.300',
          borderRadius: 'md',
          padding: { x: 3, y: 2 },
          states: {
            hover: { border: 'successScale.400' },
            focus: { border: 'successScale.500' },
            active: { border: 'successScale.500' },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        warning: {
          bg: colors.input,
          fg: colors.foreground,
          border: 'warningScale.300',
          borderRadius: 'md',
          padding: { x: 3, y: 2 },
          states: {
            hover: { border: 'warningScale.400' },
            focus: { border: 'warningScale.500' },
            active: { border: 'warningScale.500' },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        error: {
          bg: colors.input,
          fg: colors.foreground,
          border: 'destructiveScale.300',
          borderRadius: 'md',
          padding: { x: 3, y: 2 },
          states: {
            hover: { border: 'destructiveScale.400' },
            focus: { border: 'destructiveScale.500' },
            active: { border: 'destructiveScale.500' },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        info: {
          bg: colors.input,
          fg: colors.foreground,
          border: 'infoScale.300',
          borderRadius: 'md',
          padding: { x: 3, y: 2 },
          states: {
            hover: { border: 'infoScale.400' },
            focus: { border: 'infoScale.500' },
            active: { border: 'infoScale.500' },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        }
      },
      sizes: {
        xs: { height: 6, fontSize: 'xs', padding: { x: 2, y: 1 } },
        sm: { height: 8, fontSize: 'sm', padding: { x: 2.5, y: 1.5 } },
        md: { height: 10, fontSize: 'md', padding: { x: 3, y: 2 } },
        lg: { height: 12, fontSize: 'lg', padding: { x: 4, y: 2.5 } },
        xl: { height: 14, fontSize: 'xl', padding: { x: 5, y: 3 } }
      }
    },
    badge: {
      defaultVariant: 'default',
      defaultSize: 'md',
      variants: {
        default: {
          bg: colors.muted,
          fg: colors.foreground,
          border: 'transparent',
          borderRadius: 'full',
          padding: { x: 2, y: 0.5 },
          states: {
            hover: { bg: colors.accent, fg: colors.accentForeground },
            focus: { border: colors.ring },
            active: { bg: colors.accent },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        primary: {
          bg: 'primaryScale.600',
          fg: 'primaryScale.50',
          border: 'transparent',
          borderRadius: 'full',
          padding: { x: 2, y: 0.5 },
          states: {
            hover: { bg: 'primaryScale.700' },
            focus: { border: colors.ring },
            active: { bg: 'primaryScale.800' },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        secondary: {
          bg: 'secondaryScale.200',
          fg: 'secondaryScale.800',
          border: 'transparent',
          borderRadius: 'full',
          padding: { x: 2, y: 0.5 },
          states: {
            hover: { bg: 'secondaryScale.300' },
            focus: { border: colors.ring },
            active: { bg: 'secondaryScale.400' },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        destructive: {
          bg: 'destructiveScale.600',
          fg: 'destructiveScale.50',
          border: 'transparent',
          borderRadius: 'full',
          padding: { x: 2, y: 0.5 },
          states: {
            hover: { bg: 'destructiveScale.700' },
            focus: { border: colors.ring },
            active: { bg: 'destructiveScale.800' },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        outline: {
          bg: 'transparent',
          fg: colors.foreground,
          border: colors.border,
          borderRadius: 'full',
          padding: { x: 2, y: 0.5 },
          states: {
            hover: { bg: colors.muted },
            focus: { border: colors.ring },
            active: { bg: colors.accent, fg: colors.accentForeground },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        ghost: {
          bg: 'transparent',
          fg: colors.foreground,
          border: 'transparent',
          borderRadius: 'full',
          padding: { x: 2, y: 0.5 },
          states: {
            hover: { bg: colors.muted },
            focus: { border: colors.ring },
            active: { bg: colors.accent, fg: colors.accentForeground },
            disabled: { fg: colors.mutedForeground }
          }
        },
        link: {
          bg: 'transparent',
          fg: 'primaryScale.600',
          border: 'transparent',
          borderRadius: 'none',
          padding: { x: 0, y: 0 },
          states: {
            hover: { fg: 'primaryScale.700' },
            focus: { border: colors.ring },
            active: { fg: 'primaryScale.800' },
            disabled: { fg: colors.mutedForeground }
          }
        },
        success: {
          bg: 'successScale.600',
          fg: 'successScale.50',
          border: 'transparent',
          borderRadius: 'full',
          padding: { x: 2, y: 0.5 },
          states: {
            hover: { bg: 'successScale.700' },
            focus: { border: colors.ring },
            active: { bg: 'successScale.800' },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        warning: {
          bg: 'warningScale.600',
          fg: 'warningScale.50',
          border: 'transparent',
          borderRadius: 'full',
          padding: { x: 2, y: 0.5 },
          states: {
            hover: { bg: 'warningScale.700' },
            focus: { border: colors.ring },
            active: { bg: 'warningScale.800' },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        error: {
          bg: 'destructiveScale.600',
          fg: 'destructiveScale.50',
          border: 'transparent',
          borderRadius: 'full',
          padding: { x: 2, y: 0.5 },
          states: {
            hover: { bg: 'destructiveScale.700' },
            focus: { border: colors.ring },
            active: { bg: 'destructiveScale.800' },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        info: {
          bg: 'infoScale.600',
          fg: 'infoScale.50',
          border: 'transparent',
          borderRadius: 'full',
          padding: { x: 2, y: 0.5 },
          states: {
            hover: { bg: 'infoScale.700' },
            focus: { border: colors.ring },
            active: { bg: 'infoScale.800' },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        }
      },
      sizes: {
        xs: { height: 4, fontSize: 'xs', padding: { x: 1.5, y: 0 } },
        sm: { height: 5, fontSize: 'xs', padding: { x: 2, y: 0.5 } },
        md: { height: 6, fontSize: 'sm', padding: { x: 2.5, y: 0.5 } },
        lg: { height: 7, fontSize: 'sm', padding: { x: 3, y: 1 } },
        xl: { height: 8, fontSize: 'md', padding: { x: 4, y: 1 } }
      }
    },
    card: {
      defaultVariant: 'default',
      defaultSize: 'md',
      variants: {
        default: {
          bg: colors.card,
          fg: colors.cardForeground,
          border: colors.border,
          borderRadius: 'lg',
          padding: { x: 6, y: 6 },
          states: {
            hover: { border: colors.ring },
            focus: { border: colors.ring },
            active: { border: colors.ring },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        primary: {
          bg: 'primaryScale.50',
          fg: 'primaryScale.900',
          border: 'primaryScale.200',
          borderRadius: 'lg',
          padding: { x: 6, y: 6 },
          states: {
            hover: { border: 'primaryScale.300' },
            focus: { border: 'primaryScale.400' },
            active: { border: 'primaryScale.400' },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        secondary: {
          bg: 'secondaryScale.50',
          fg: 'secondaryScale.900',
          border: 'secondaryScale.200',
          borderRadius: 'lg',
          padding: { x: 6, y: 6 },
          states: {
            hover: { border: 'secondaryScale.300' },
            focus: { border: 'secondaryScale.400' },
            active: { border: 'secondaryScale.400' },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        destructive: {
          bg: 'destructiveScale.50',
          fg: 'destructiveScale.900',
          border: 'destructiveScale.200',
          borderRadius: 'lg',
          padding: { x: 6, y: 6 },
          states: {
            hover: { border: 'destructiveScale.300' },
            focus: { border: 'destructiveScale.400' },
            active: { border: 'destructiveScale.400' },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        outline: {
          bg: 'transparent',
          fg: colors.foreground,
          border: colors.border,
          borderRadius: 'lg',
          padding: { x: 6, y: 6 },
          states: {
            hover: { bg: colors.muted },
            focus: { border: colors.ring },
            active: { bg: colors.muted },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        ghost: {
          bg: 'transparent',
          fg: colors.foreground,
          border: 'transparent',
          borderRadius: 'lg',
          padding: { x: 6, y: 6 },
          states: {
            hover: { bg: colors.muted },
            focus: { border: colors.ring },
            active: { bg: colors.muted },
            disabled: { fg: colors.mutedForeground }
          }
        },
        link: {
          bg: 'transparent',
          fg: colors.foreground,
          border: 'transparent',
          borderRadius: 'none',
          padding: { x: 0, y: 0 },
          states: {
            hover: { fg: colors.ring },
            focus: { border: colors.ring },
            active: { fg: colors.ring },
            disabled: { fg: colors.mutedForeground }
          }
        },
        success: {
          bg: 'successScale.50',
          fg: 'successScale.900',
          border: 'successScale.200',
          borderRadius: 'lg',
          padding: { x: 6, y: 6 },
          states: {
            hover: { border: 'successScale.300' },
            focus: { border: 'successScale.400' },
            active: { border: 'successScale.400' },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        warning: {
          bg: 'warningScale.50',
          fg: 'warningScale.900',
          border: 'warningScale.200',
          borderRadius: 'lg',
          padding: { x: 6, y: 6 },
          states: {
            hover: { border: 'warningScale.300' },
            focus: { border: 'warningScale.400' },
            active: { border: 'warningScale.400' },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        error: {
          bg: 'destructiveScale.50',
          fg: 'destructiveScale.900',
          border: 'destructiveScale.200',
          borderRadius: 'lg',
          padding: { x: 6, y: 6 },
          states: {
            hover: { border: 'destructiveScale.300' },
            focus: { border: 'destructiveScale.400' },
            active: { border: 'destructiveScale.400' },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        info: {
          bg: 'infoScale.50',
          fg: 'infoScale.900',
          border: 'infoScale.200',
          borderRadius: 'lg',
          padding: { x: 6, y: 6 },
          states: {
            hover: { border: 'infoScale.300' },
            focus: { border: 'infoScale.400' },
            active: { border: 'infoScale.400' },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        }
      },
      sizes: {
        xs: { height: 16, fontSize: 'xs', padding: { x: 3, y: 3 } },
        sm: { height: 20, fontSize: 'sm', padding: { x: 4, y: 4 } },
        md: { height: 24, fontSize: 'md', padding: { x: 6, y: 6 } },
        lg: { height: 32, fontSize: 'lg', padding: { x: 8, y: 8 } },
        xl: { height: 40, fontSize: 'xl', padding: { x: 10, y: 10 } }
      }
    },
    alert: {
      defaultVariant: 'default',
      defaultSize: 'md',
      variants: {
        default: {
          bg: colors.background,
          fg: colors.foreground,
          border: colors.border,
          borderRadius: 'lg',
          padding: { x: 4, y: 3 },
          states: {
            hover: { bg: colors.muted },
            focus: { border: colors.ring },
            active: { bg: colors.muted },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        primary: {
          bg: 'primaryScale.50',
          fg: 'primaryScale.900',
          border: 'primaryScale.200',
          borderRadius: 'lg',
          padding: { x: 4, y: 3 },
          states: {
            hover: { bg: 'primaryScale.100' },
            focus: { border: 'primaryScale.400' },
            active: { bg: 'primaryScale.100' },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        secondary: {
          bg: 'secondaryScale.50',
          fg: 'secondaryScale.900',
          border: 'secondaryScale.200',
          borderRadius: 'lg',
          padding: { x: 4, y: 3 },
          states: {
            hover: { bg: 'secondaryScale.100' },
            focus: { border: 'secondaryScale.400' },
            active: { bg: 'secondaryScale.100' },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        destructive: {
          bg: 'destructiveScale.50',
          fg: 'destructiveScale.900',
          border: 'destructiveScale.200',
          borderRadius: 'lg',
          padding: { x: 4, y: 3 },
          states: {
            hover: { bg: 'destructiveScale.100' },
            focus: { border: 'destructiveScale.400' },
            active: { bg: 'destructiveScale.100' },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        outline: {
          bg: 'transparent',
          fg: colors.foreground,
          border: colors.border,
          borderRadius: 'lg',
          padding: { x: 4, y: 3 },
          states: {
            hover: { bg: colors.muted },
            focus: { border: colors.ring },
            active: { bg: colors.muted },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        ghost: {
          bg: 'transparent',
          fg: colors.foreground,
          border: 'transparent',
          borderRadius: 'lg',
          padding: { x: 4, y: 3 },
          states: {
            hover: { bg: colors.muted },
            focus: { border: colors.ring },
            active: { bg: colors.muted },
            disabled: { fg: colors.mutedForeground }
          }
        },
        link: {
          bg: 'transparent',
          fg: colors.foreground,
          border: 'transparent',
          borderRadius: 'none',
          padding: { x: 0, y: 0 },
          states: {
            hover: { fg: colors.ring },
            focus: { border: colors.ring },
            active: { fg: colors.ring },
            disabled: { fg: colors.mutedForeground }
          }
        },
        success: {
          bg: 'successScale.50',
          fg: 'successScale.900',
          border: 'successScale.200',
          borderRadius: 'lg',
          padding: { x: 4, y: 3 },
          states: {
            hover: { bg: 'successScale.100' },
            focus: { border: 'successScale.400' },
            active: { bg: 'successScale.100' },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        warning: {
          bg: 'warningScale.50',
          fg: 'warningScale.900',
          border: 'warningScale.200',
          borderRadius: 'lg',
          padding: { x: 4, y: 3 },
          states: {
            hover: { bg: 'warningScale.100' },
            focus: { border: 'warningScale.400' },
            active: { bg: 'warningScale.100' },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        error: {
          bg: 'destructiveScale.50',
          fg: 'destructiveScale.900',
          border: 'destructiveScale.200',
          borderRadius: 'lg',
          padding: { x: 4, y: 3 },
          states: {
            hover: { bg: 'destructiveScale.100' },
            focus: { border: 'destructiveScale.400' },
            active: { bg: 'destructiveScale.100' },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        },
        info: {
          bg: 'infoScale.50',
          fg: 'infoScale.900',
          border: 'infoScale.200',
          borderRadius: 'lg',
          padding: { x: 4, y: 3 },
          states: {
            hover: { bg: 'infoScale.100' },
            focus: { border: 'infoScale.400' },
            active: { bg: 'infoScale.100' },
            disabled: { bg: colors.muted, fg: colors.mutedForeground }
          }
        }
      },
      sizes: {
        xs: { height: 8, fontSize: 'xs', padding: { x: 2, y: 2 } },
        sm: { height: 10, fontSize: 'sm', padding: { x: 3, y: 2.5 } },
        md: { height: 12, fontSize: 'md', padding: { x: 4, y: 3 } },
        lg: { height: 16, fontSize: 'lg', padding: { x: 6, y: 4 } },
        xl: { height: 20, fontSize: 'xl', padding: { x: 8, y: 5 } }
      }
    }
  };
}
