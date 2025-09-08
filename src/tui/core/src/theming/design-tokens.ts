// Design Tokens System - Inspired by shadcn/ui but adapted for TUI
export type ColorToken = {
    DEFAULT: string;
    50?: string;
    100?: string;
    200?: string;
    300?: string;
    400?: string;
    500?: string;
    600?: string;
    700?: string;
    800?: string;
    900?: string;
    950?: string;
    secondary?: string;
    muted?: string;
    input?: string;
    accent?: string;
    ring?: string;
};

export type SpacingToken = {
    px: string;
    0: string;
    0.5: string;
    1: string;
    1.5: string;
    2: string;
    2.5: string;
    3: string;
    3.5: string;
    4: string;
    5: string;
    6: string;
    7: string;
    8: string;
    9: string;
    10: string;
    11: string;
    12: string;
    14: string;
    16: string;
    20: string;
    24: string;
    28: string;
    32: string;
    36: string;
    40: string;
    44: string;
    48: string;
    52: string;
    56: string;
    60: string;
    64: string;
    72: string;
    80: string;
    96: string;
};

export type TypographyToken = {
    fontFamily: {
        sans: string;
        mono: string;
        serif: string;
    };
    fontSize: {
        xs: string;
        sm: string;
        base: string;
        lg: string;
        xl: string;
        '2xl': string;
        '3xl': string;
        '4xl': string;
        '5xl': string;
        '6xl': string;
        '7xl': string;
        '8xl': string;
        '9xl': string;
    };
    fontWeight: {
        thin: string;
        extralight: string;
        light: string;
        normal: string;
        medium: string;
        semibold: string;
        bold: string;
        extrabold: string;
        black: string;
    };
    lineHeight: {
        none: string;
        tight: string;
        snug: string;
        normal: string;
        relaxed: string;
        loose: string;
    };
};

export type BorderRadiusToken = {
    none: string;
    sm: string;
    DEFAULT: string;
    md: string;
    lg: string;
    xl: string;
    '2xl': string;
    '3xl': string;
    full: string;
};

export type ShadowToken = {
    sm: string;
    DEFAULT: string;
    md: string;
    lg: string;
    xl: string;
    '2xl': string;
    inner: string;
    none: string;
};

export type AnimationToken = {
    duration: {
        75: string;
        100: string;
        150: string;
        200: string;
        300: string;
        500: string;
        700: string;
        1000: string;
    };
    easing: {
        linear: string;
        in: string;
        out: string;
        'in-out': string;
    };
};

export type ComponentVariant =
    | 'default'
    | 'primary'
    | 'secondary'
    | 'destructive'
    | 'outline'
    | 'ghost'
    | 'link'
    | 'success'
    | 'warning'
    | 'error'
    | 'info'
    | 'muted';

export type ComponentSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export type ComponentState = 'default' | 'hover' | 'focus' | 'active' | 'disabled' | 'loading';

// Base Design Tokens
export const colors: Record<string, ColorToken> = {
    // Semantic colors
    primary: {
        DEFAULT: '#4f46e5',
        50: '#eef2ff',
        100: '#e0e7ff',
        200: '#c7d2fe',
        300: '#a5b4fc',
        400: '#818cf8',
        500: '#6366f1',
        600: '#4f46e5',
        700: '#4338ca',
        800: '#3730a3',
        900: '#312e81',
        950: '#1e1b4b',
    },
    secondary: {
        DEFAULT: '#6b7280',
        50: '#f9fafb',
        100: '#f3f4f6',
        200: '#e5e7eb',
        300: '#d1d5db',
        400: '#9ca3af',
        500: '#6b7280',
        600: '#4b5563',
        700: '#374151',
        800: '#1f2937',
        900: '#111827',
        950: '#030712',
    },
    success: {
        DEFAULT: '#16a34a',
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
        950: '#052e16',
    },
    warning: {
        DEFAULT: '#f59e0b',
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
        950: '#451a03',
    },
    error: {
        DEFAULT: '#dc2626',
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
        950: '#450a0a',
    },
    info: {
        DEFAULT: '#0ea5e9',
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
        950: '#082f49',
    },
    // Neutral colors
    gray: {
        DEFAULT: '#6b7280',
        50: '#f9fafb',
        100: '#f3f4f6',
        200: '#e5e7eb',
        300: '#d1d5db',
        400: '#9ca3af',
        500: '#6b7280',
        600: '#4b5563',
        700: '#374151',
        800: '#1f2937',
        900: '#111827',
        950: '#030712',
    },
    // Background colors
    background: {
        DEFAULT: '#ffffff',
        secondary: '#f9fafb',
        muted: '#f3f4f6',
        accent: '#f8fafc',
    },
    // Foreground colors
    foreground: {
        DEFAULT: '#0f172a',
        secondary: '#475569',
        muted: '#64748b',
        accent: '#0f172a',
    },
    // Border colors
    border: {
        DEFAULT: '#e2e8f0',
        input: '#e2e8f0',
        ring: '#3b82f6',
    },
};

export const spacing: SpacingToken = {
    px: '1px',
    0: '0',
    0.5: '0.125rem',
    1: '0.25rem',
    1.5: '0.375rem',
    2: '0.5rem',
    2.5: '0.625rem',
    3: '0.75rem',
    3.5: '0.875rem',
    4: '1rem',
    5: '1.25rem',
    6: '1.5rem',
    7: '1.75rem',
    8: '2rem',
    9: '2.25rem',
    10: '2.5rem',
    11: '2.75rem',
    12: '3rem',
    14: '3.5rem',
    16: '4rem',
    20: '5rem',
    24: '6rem',
    28: '7rem',
    32: '8rem',
    36: '9rem',
    40: '10rem',
    44: '11rem',
    48: '12rem',
    52: '13rem',
    56: '14rem',
    60: '15rem',
    64: '16rem',
    72: '18rem',
    80: '20rem',
    96: '24rem',
};

export const borderRadius: BorderRadiusToken = {
    none: '0',
    sm: '0.125rem',
    DEFAULT: '0.25rem',
    md: '0.375rem',
    lg: '0.5rem',
    xl: '0.75rem',
    '2xl': '1rem',
    '3xl': '1.5rem',
    full: '9999px',
};

export const typography: TypographyToken = {
    fontFamily: {
        sans: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
        mono: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
        serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
    },
    fontSize: {
        xs: '0.75rem',
        sm: '0.875rem',
        base: '1rem',
        lg: '1.125rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
        '3xl': '1.875rem',
        '4xl': '2.25rem',
        '5xl': '3rem',
        '6xl': '3.75rem',
        '7xl': '4.5rem',
        '8xl': '6rem',
        '9xl': '8rem',
    },
    fontWeight: {
        thin: '100',
        extralight: '200',
        light: '300',
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
        extrabold: '800',
        black: '900',
    },
    lineHeight: {
        none: '1',
        tight: '1.25',
        snug: '1.375',
        normal: '1.5',
        relaxed: '1.625',
        loose: '2',
    },
};

export const shadows: ShadowToken = {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
    none: 'none',
};

export const animations: AnimationToken = {
    duration: {
        75: '75ms',
        100: '100ms',
        150: '150ms',
        200: '200ms',
        300: '300ms',
        500: '500ms',
        700: '700ms',
        1000: '1000ms',
    },
    easing: {
        linear: 'linear',
        in: 'cubic-bezier(0.4, 0, 1, 1)',
        out: 'cubic-bezier(0, 0, 0.2, 1)',
        'in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
    },
};

// Component-specific tokens
export const componentTokens = {
    button: {
        variants: {
            default: {
                bg: colors.primary.DEFAULT,
                fg: colors.background.DEFAULT,
                border: colors.primary.DEFAULT,
            },
            primary: {
                bg: colors.primary.DEFAULT,
                fg: colors.background.DEFAULT,
                border: colors.primary.DEFAULT,
            },
            destructive: {
                bg: colors.error.DEFAULT,
                fg: colors.background.DEFAULT,
                border: colors.error.DEFAULT,
            },
            outline: {
                bg: 'transparent',
                fg: colors.primary.DEFAULT,
                border: colors.primary.DEFAULT,
            },
            secondary: {
                bg: colors.secondary.DEFAULT,
                fg: colors.background.DEFAULT,
                border: colors.secondary.DEFAULT,
            },
            ghost: {
                bg: 'transparent',
                fg: colors.foreground.DEFAULT,
                border: 'transparent',
            },
            link: {
                bg: 'transparent',
                fg: colors.primary.DEFAULT,
                border: 'transparent',
            },
            success: {
                bg: colors.success.DEFAULT,
                fg: colors.background.DEFAULT,
                border: colors.success.DEFAULT,
            },
            warning: {
                bg: colors.warning.DEFAULT,
                fg: colors.background.DEFAULT,
                border: colors.warning.DEFAULT,
            },
            error: {
                bg: colors.error.DEFAULT,
                fg: colors.background.DEFAULT,
                border: colors.error.DEFAULT,
            },
            info: {
                bg: colors.info.DEFAULT,
                fg: colors.background.DEFAULT,
                border: colors.info.DEFAULT,
            },
        },
        sizes: {
            xs: { width: 8, height: 1, padding: [0, 1] },
            sm: { width: 12, height: 2, padding: [0, 2] },
            md: { width: 16, height: 3, padding: [0, 3] },
            lg: { width: 20, height: 4, padding: [0, 4] },
            xl: { width: 24, height: 5, padding: [0, 5] },
        },
    },
    input: {
        variants: {
            default: {
                bg: colors.background.DEFAULT,
                fg: colors.foreground.DEFAULT,
                border: colors.border.DEFAULT,
            },
            error: {
                bg: colors.background.DEFAULT,
                fg: colors.foreground.DEFAULT,
                border: colors.error.DEFAULT,
            },
            success: {
                bg: colors.background.DEFAULT,
                fg: colors.foreground.DEFAULT,
                border: colors.success.DEFAULT,
            },
        },
        sizes: {
            xs: { height: 1, padding: [0, 1] },
            sm: { height: 2, padding: [0, 2] },
            md: { height: 3, padding: [0, 3] },
            lg: { height: 4, padding: [0, 4] },
            xl: { height: 5, padding: [0, 5] },
        },
    },
};

// Unified token system for terminal (shadcn-style)
export const tokens = {
    // Spacing scale in terminal "cells"
    space: [0, 1, 2, 3, 4, 6, 8, 12, 16, 20, 24, 32],
    // Border radius scale
    radius: [0, 1, 2, 3, 4],
    // Color palette with semantic tokens
    color: {
        // Base colors
        fg: '#E6E6E6',
        bg: '#101010',
        muted: '#A1A1A1',
        // Semantic colors
        info: '#3BA3FF',
        success: '#22C55E', 
        warning: '#F59E0B',
        error: '#EF4444',
        // Terminal-specific
        border: '#404040',
        focus: '#3BA3FF',
    },
    // Typography for terminal
    typography: {
        bold: true,
        dim: true,
        underline: true,
    },
    // Legacy compatibility
    colors,
    spacing,
    borderRadius,
    shadows,
    animations,
    componentTokens,
};

export type Tokens = typeof tokens;

// Contrast helper for accessibility
export function ensureContrast(fg: string, bg: string, minRatio = 3.0): { fg: string; bg: string } {
  // Simple contrast check - in a real implementation, use proper WCAG contrast calculation
  const fgLuminance = getLuminance(fg);
  const bgLuminance = getLuminance(bg);
  const contrast = (Math.max(fgLuminance, bgLuminance) + 0.05) / (Math.min(fgLuminance, bgLuminance) + 0.05);
  
  // If contrast is too low, adjust colors
  if (contrast < minRatio) {
    if (fgLuminance > bgLuminance) {
      // Light text on dark background - make text lighter
      return { fg: '#FFFFFF', bg };
    } else {
      // Dark text on light background - make text darker
      return { fg: '#000000', bg };
    }
  }
  
  return { fg, bg };
}

// Simple luminance calculation (approximation)
function getLuminance(color: string): number {
  // Remove # if present
  const hex = color.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16) / 255;
  const g = parseInt(hex.substr(2, 2), 16) / 255;
  const b = parseInt(hex.substr(4, 2), 16) / 255;
  
  // Apply gamma correction
  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

// Logging levels (muted by default)
const LVL = process.env.TUI_LOG ?? 'error'; // 'silent'|'error'|'warn'|'info'|'debug'
export function log(level: 'error' | 'warn' | 'info' | 'debug', ...args: any[]) {
  const order = ['silent', 'error', 'warn', 'info', 'debug'];
  if (order.indexOf(level) <= order.indexOf(LVL as any)) {
    console[level === 'debug' ? 'log' : level](...args);
  }
}

// Terminal capability detection
export const CAP = {
  truecolor: !!process.env.COLORTERM?.includes('truecolor'),
  unicode: !!process.stdout && (process.stdout as any).hasColors?.() !== false,
  width: process.stdout?.columns ?? 80,
  height: process.stdout?.rows ?? 24
};

// Color mapping for non-truecolor terminals
export function mapTo256Color(hex: string): number {
  if (CAP.truecolor) return parseInt(hex.replace('#', ''), 16);
  
  // Simple mapping to 256-color palette
  const colorMap: Record<string, number> = {
    '#E6E6E6': 253, // light gray
    '#101010': 16,  // dark gray
    '#A1A1A1': 247, // medium gray
    '#3BA3FF': 75,  // blue
    '#22C55E': 76,  // green
    '#F59E0B': 214, // yellow
    '#EF4444': 196, // red
    '#404040': 238, // border gray
  };
  
  return colorMap[hex] || 7; // fallback to white
}

// Theme presets
export const themes = {
  dark: {
    ...tokens,
    color: {
      ...tokens.color,
      fg: '#E6E6E6',
      bg: '#101010',
      muted: '#A1A1A1',
    }
  },
  dim: {
    ...tokens,
    color: {
      ...tokens.color,
      fg: '#D0D0D0',
      bg: '#0c0c0c',
      muted: '#808080',
    }
  }
};
