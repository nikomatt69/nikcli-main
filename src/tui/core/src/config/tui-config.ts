export interface TuiTokens {
  colors: {
    neutral: Record<string, string>;
    accent: Record<string, string>;
    success: Record<string, string>;
    warning: Record<string, string>;
    danger: Record<string, string>;
  };
  bg: Record<string, string>;
  fg: Record<string, string>;
  border: Record<string, string>;
  borderStyle: Record<string, string>;
  radius: Record<string, string>;
  space: Record<string, number>;
  effects: Record<string, string>;
  transition: Record<string, string>;
}

export interface TuiVariants {
  button: {
    variant: Record<string, any>;
    size: Record<string, any>;
    tone: Record<string, any>;
  };
  input: {
    variant: Record<string, any>;
    size: Record<string, any>;
  };
  [component: string]: Record<string, Record<string, any>>;
}

export interface TuiConfig {
  renderer: 'blessed' | 'ink';
  tokens: TuiTokens;
  variants: TuiVariants;
}

/**
 * Helper function to define TUI configuration with type safety
 */
export function defineConfig(config: TuiConfig): TuiConfig {
  return config;
}

/**
 * Default TUI configuration
 */
export const defaultConfig: TuiConfig = {
  renderer: 'blessed',
  
  tokens: {
    colors: {
      neutral: {
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
      },
      
      accent: {
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
      },
      
      success: {
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
      },
      
      warning: {
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
      },
      
      danger: {
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
      }
    },
    
    bg: {
      primary: '#0f172a',
      secondary: '#1e293b', 
      muted: '#334155',
      accent: '#0284c7',
    },
    
    fg: {
      primary: '#f8fafc',
      secondary: '#e2e8f0',
      muted: '#94a3b8',
      accent: '#38bdf8',
    },
    
    border: {
      primary: '#475569',
      secondary: '#334155',
      accent: '#0ea5e9',
    },
    
    borderStyle: {
      none: 'none',
      light: 'light',
      normal: 'line', 
      heavy: 'heavy',
      double: 'double'
    },
    
    radius: {
      none: 'none',
      xs: 'xs',
      sm: 'sm', 
      md: 'md',
      lg: 'lg',
      xl: 'xl'
    },
    
    space: {
      0: 0,
      1: 1,
      2: 2,
      3: 3,
      4: 4,
      6: 6,
      8: 8,
    },
    
    effects: {
      bold: 'bold',
      dim: 'dim', 
      italic: 'italic',
      underline: 'underline',
      inverse: 'inverse'
    },
    
    transition: {
      tick: '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏',
      pulse: '●○●○',
      dots: '⣾⣽⣻⢿⡿⣟⣯⣷',
    }
  },
  
  variants: {
    button: {
      variant: {
        primary: {
          bg: '#0284c7',
          fg: '#f8fafc',
          border: '#0ea5e9'
        },
        secondary: { 
          bg: '#334155',
          fg: '#e2e8f0',
          border: '#475569'
        },
        ghost: {
          bg: 'transparent',
          fg: '#38bdf8', 
          border: 'transparent'
        },
        destructive: {
          bg: '#dc2626',
          fg: '#f8fafc',
          border: '#ef4444'
        }
      },
      size: {
        sm: { height: 1, px: 2 },
        md: { height: 3, px: 4 },
        lg: { height: 5, px: 6 }
      },
      tone: {
        neutral: {},
        accent: { borderColor: '#38bdf8' },
        success: { borderColor: '#4ade80' },
        warning: { borderColor: '#fbbf24' },
        danger: { borderColor: '#f87171' }
      }
    },
    
    input: {
      variant: {
        default: {
          bg: '#1e293b',
          fg: '#f1f5f9', 
          border: '#475569'
        },
        filled: {
          bg: '#334155',
          fg: '#f1f5f9',
          border: 'transparent'
        }
      },
      size: {
        sm: { height: 1, px: 2 },
        md: { height: 3, px: 3 },
        lg: { height: 5, px: 4 }
      }
    }
  }
};
