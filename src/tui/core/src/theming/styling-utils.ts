import { Theme, StyleProps, colorPalettes } from './theme';

// Advanced styling utilities for dynamic component customization

export interface ComputedStyles {
  bg: string | number;
  fg: string | number;
  border: any;
  padding: any;
  margin: any;
  width?: string | number;
  height?: string | number;
  shadow?: string;
  glow?: string;
  opacity?: number;
}

// Size mappings for different component sizes
export const sizeMap = {
  xs: { padding: [0, 1], height: 1, fontSize: 'small' },
  sm: { padding: [1, 2], height: 2, fontSize: 'normal' },
  md: { padding: [1, 3], height: 3, fontSize: 'normal' },
  lg: { padding: [2, 4], height: 4, fontSize: 'large' },
  xl: { padding: [3, 6], height: 5, fontSize: 'large' },
};

// Variant color mappings
export function getVariantColors(variant: string, theme: Theme) {
  switch (variant) {
    case 'primary':
      return { bg: theme.accent, fg: theme.background };
    case 'secondary':
      return { bg: theme.secondary, fg: theme.foreground };
    case 'success':
      return { bg: theme.success, fg: theme.background };
    case 'warning':
      return { bg: theme.warning, fg: theme.background };
    case 'error':
      return { bg: theme.error, fg: theme.background };
    case 'info':
      return { bg: theme.info, fg: theme.background };
    case 'ghost':
      return { bg: 'transparent', fg: theme.accent };
    case 'outline':
      return { bg: 'transparent', fg: theme.accent, border: { fg: theme.accent } };
    case 'minimal':
      return { bg: theme.surface, fg: theme.muted };
    default:
      return { bg: theme.background, fg: theme.foreground };
  }
}

// Animation frame interpolation for smooth transitions
export function createAnimationFrames(animation: string, duration: number = 1000) {
  const frames: any[] = [];
  const steps = 10;

  switch (animation) {
    case 'pulse':
      for (let i = 0; i <= steps; i++) {
        const progress = i / steps;
        const opacity = 0.5 + (Math.sin(progress * Math.PI * 2) * 0.3);
        frames.push({ opacity, delay: (duration / steps) * i });
      }
      break;
    case 'glow':
      for (let i = 0; i <= steps; i++) {
        const progress = i / steps;
        const intensity = 0.3 + (Math.sin(progress * Math.PI * 2) * 0.4);
        frames.push({ glowIntensity: intensity, delay: (duration / steps) * i });
      }
      break;
    case 'shake':
      for (let i = 0; i <= steps; i++) {
        const progress = i / steps;
        const offset = Math.sin(progress * Math.PI * 8) * 2;
        frames.push({ offsetX: offset, delay: (duration / steps) * i });
      }
      break;
    case 'bounce':
      for (let i = 0; i <= steps; i++) {
        const progress = i / steps;
        const scale = 1 + (Math.sin(progress * Math.PI) * 0.1);
        frames.push({ scale, delay: (duration / steps) * i });
      }
      break;
  }

  return frames;
}

// Advanced gradient generation
export function createGradient(gradient: { from: string; to: string; direction?: string }) {
  const { from, to, direction = 'horizontal' } = gradient;

  // For terminal applications, we simulate gradients with color transitions
  const steps = 10;
  const colors = [];

  for (let i = 0; i <= steps; i++) {
    const ratio = i / steps;
    // Simple color blending (would need proper color interpolation in real implementation)
    colors.push(ratio < 0.5 ? from : to);
  }

  return colors;
}

// Dynamic style computation with all advanced features
export function computeAdvancedStyle(props: StyleProps, theme: Theme): ComputedStyles {
  let computedStyle: ComputedStyles = {
    bg: props.bg || theme.background,
    fg: props.fg || theme.foreground,
    border: { fg: props.borderColor || theme.border },
    padding: normalizePadding(props.padding),
    margin: normalizeMargin(props.margin),
  };

  // Apply palette colors if specified
  if (props.palette && colorPalettes[props.palette as keyof typeof colorPalettes]) {
    const palette = colorPalettes[props.palette as keyof typeof colorPalettes];
    computedStyle.bg = props.bg || palette.accent;
    if (props.glow) {
      computedStyle.glow = palette.glow;
    }
  }

  // Apply variant styling
  if (props.variant) {
    const variantColors = getVariantColors(props.variant, theme);
    computedStyle = { ...computedStyle, ...variantColors };
  }

  // Apply size-based styling
  if (props.size) {
    const sizeStyle = sizeMap[props.size as keyof typeof sizeMap];
    if (sizeStyle) {
      computedStyle.padding = sizeStyle.padding;
      computedStyle.height = sizeStyle.height;
    }
  }

  // Apply advanced effects
  if (props.shadow) {
    computedStyle.shadow = theme.shadow;
  }

  if (props.glow) {
    computedStyle.glow = theme.glow;
  }

  if (props.opacity !== undefined) {
    computedStyle.opacity = props.opacity;
  }

  // Apply gradient background
  if (props.gradient) {
    // In a real implementation, this would create a gradient effect
    computedStyle.bg = props.gradient.from;
  }

  // Apply border styling
  if (props.borderStyle && props.borderStyle !== 'none') {
    computedStyle.border = {
      type: props.borderStyle,
      fg: props.borderColor || theme.border,
      width: props.borderWidth || 1,
    };
  }

  return computedStyle;
}

// Helper functions for padding/margin normalization with 4-value support
export function normalizePadding(p?: number | [number, number] | [number, number, number, number] | { top?: number; right?: number; bottom?: number; left?: number }) {
  if (!p && p !== 0) return undefined;

  if (typeof p === 'number') {
    return { top: p, bottom: p, left: p, right: p };
  }

  if (Array.isArray(p)) {
    if (p.length === 2) {
      const [v, h] = p;
      return { top: v, bottom: v, left: h, right: h };
    }
    if (p.length === 4) {
      const [top, right, bottom, left] = p;
      return { top, right, bottom, left };
    }
  }

  return undefined;
}

export function normalizeMargin(m?: number | [number, number] | [number, number, number, number] | { top?: number; right?: number; bottom?: number; left?: number }) {
  return normalizePadding(m); // Same logic as padding
}

// Responsive utilities for terminal applications
export interface ResponsiveValue<T> {
  xs?: T;
  sm?: T;
  md?: T;
  lg?: T;
  xl?: T;
  default: T;
}

export function resolveResponsiveValue<T>(value: T | ResponsiveValue<T>, screenWidth: number): T {
  if (typeof value !== 'object' || value === null) {
    return value;
  }

  const responsive = value as ResponsiveValue<T>;

  if (screenWidth >= 120 && responsive.xl) return responsive.xl;
  if (screenWidth >= 100 && responsive.lg) return responsive.lg;
  if (screenWidth >= 80 && responsive.md) return responsive.md;
  if (screenWidth >= 60 && responsive.sm) return responsive.sm;
  if (screenWidth >= 40 && responsive.xs) return responsive.xs;

  return responsive.default;
}

// State management for interactive components
export interface ComponentState {
  focused: boolean;
  hovered: boolean;
  pressed: boolean;
  disabled: boolean;
  loading: boolean;
  error: boolean;
}

export function getStateStyles(state: Partial<ComponentState>, theme: Theme, baseStyle: ComputedStyles): ComputedStyles {
  let stateStyle = { ...baseStyle };

  if (state.focused) {
    stateStyle.border = { ...stateStyle.border, fg: theme.borderFocus };
    if (stateStyle.glow) {
      stateStyle.glow = theme.glow;
    }
  }

  if (state.hovered) {
    stateStyle.bg = theme.hover;
  }

  if (state.pressed) {
    stateStyle.bg = theme.active;
  }

  if (state.disabled) {
    stateStyle.fg = theme.disabled;
    stateStyle.opacity = 0.6;
  }

  if (state.error) {
    stateStyle.border = { ...stateStyle.border, fg: theme.error };
  }

  return stateStyle;
}

// Component composition utilities
export interface CompositeComponent {
  type: string;
  props: any;
  children?: CompositeComponent[];
}

export function createCompositeComponent(type: string, props: any, children?: CompositeComponent[]): CompositeComponent {
  return { type, props, children };
}

// Plugin system for custom styling extensions
export interface StylePlugin {
  name: string;
  apply: (props: StyleProps, theme: Theme) => Partial<ComputedStyles>;
}

export class StylePluginManager {
  private plugins: StylePlugin[] = [];

  registerPlugin(plugin: StylePlugin) {
    this.plugins.push(plugin);
  }

  applyPlugins(props: StyleProps, theme: Theme): Partial<ComputedStyles> {
    return this.plugins.reduce((acc, plugin) => {
      return { ...acc, ...plugin.apply(props, theme) };
    }, {});
  }
}

export const stylePluginManager = new StylePluginManager();

// Export everything for easy use
export {
  Theme,
  StyleProps,
  colorPalettes,
} from './theme';
