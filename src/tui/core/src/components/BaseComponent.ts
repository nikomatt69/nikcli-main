import blessed, { Widgets } from "blessed";
import {
  ComponentSize,
  ComponentState,
  ComponentVariant,
} from "../theming/design-tokens";
import { StyleProps, Theme, resolveTheme } from "../theming/theme";
import { getComponentTokens, mergeComponentStyles } from "../utils/variants";

// Centralized union types for consistency across all components
export type Variant = 'default' | 'muted' | 'ghost' | 'destructive' | 'primary' | 'secondary' | 'outline' | 'link' | 'success' | 'warning' | 'error' | 'info';
export type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

// Default values for consistent behavior
export const COMPONENT_DEFAULTS = {
  variant: 'default' as Variant,
  size: 'md' as Size,
  tone: 'neutral' as Tone,
  padding: 2,
  radius: 1,
  focus: false,
  disabled: false,
};

export type PositionProps = {
  top?: number | string;
  left?: number | string;
  right?: number | string;
  bottom?: number | string;
  width?: number | string;
  height?: number | string;
};

export type BaseProps = StyleProps &
  PositionProps & {
    parent?: Widgets.Node;
    label?: string;
    keys?: boolean;
    mouse?: boolean;
    scrollable?: boolean;
    focusable?: boolean;
    // Unified shadcn-style props API
    variant?: Variant;
    size?: Size;
    tone?: Tone;
    padding?: number | [number, number] | [number, number, number, number] | { top?: number; right?: number; bottom?: number; left?: number };
    radius?: number;
    focus?: boolean; // Force focus state for testing
    disabled?: boolean;
    // Legacy variant system props (for backward compatibility)
    state?: ComponentState;
    // Advanced styling props
    borderRadius?: string;
    shadow?: string;
    animation?: string;
    text?: string;
    // Responsive props
    responsive?: Record<string, Partial<BaseProps>>;
    // Blessed-specific props
    blessedProps?: {
      style?: Record<string, any>;
      [key: string]: any;
    };
  };

export type Component<
  T extends Widgets.BlessedElement = Widgets.BlessedElement
> = {
  el: T;
  theme: Theme;
  destroy: () => void;
  // New methods for variant system
  setVariant: (variant: ComponentVariant) => void;
  setSize: (size: ComponentSize) => void;
  setState: (state: ComponentState) => void;
  getConfig: () => ComponentConfig;
  update: (props: Partial<BaseProps>) => void;
};

export type ComponentConfig = {
  variant: ComponentVariant;
  size: ComponentSize;
  state: ComponentState;
  theme: Theme;
  responsive?: Record<string, Partial<BaseProps>>;
};

// Enhanced style computation with unified props API
export function computeBlessedStyle(
  theme: Theme,
  props: BaseProps,
  componentName?: string,
  variant?: ComponentVariant,
  size?: ComponentSize
) {
  // Import tokens for unified styling
  const { tokens } = require('../theming/design-tokens');
  
  const baseStyle: any = {
    bg: props.bg || theme.background,
    fg: props.fg || theme.foreground,
    border: {
      fg: props.borderColor || theme.border,
    },
  };

  // Apply unified variant mapping
  if (props.variant) {
    switch (props.variant) {
      case 'muted':
        baseStyle.fg = tokens.color.muted;
        baseStyle.bg = tokens.color.bg;
        break;
      case 'ghost':
        baseStyle.bg = 'transparent';
        baseStyle.fg = tokens.color.fg;
        break;
      case 'destructive':
        baseStyle.fg = tokens.color.error;
        baseStyle.bg = tokens.color.bg;
        break;
      case 'primary':
        baseStyle.fg = tokens.color.bg;
        baseStyle.bg = tokens.color.info;
        break;
      case 'secondary':
        baseStyle.fg = tokens.color.fg;
        baseStyle.bg = tokens.color.muted;
        break;
      case 'outline':
        baseStyle.bg = 'transparent';
        baseStyle.fg = tokens.color.info;
        baseStyle.border = { fg: tokens.color.info };
        break;
      case 'success':
        baseStyle.fg = tokens.color.bg;
        baseStyle.bg = tokens.color.success;
        break;
      case 'warning':
        baseStyle.fg = tokens.color.bg;
        baseStyle.bg = tokens.color.warning;
        break;
      case 'error':
        baseStyle.fg = tokens.color.bg;
        baseStyle.bg = tokens.color.error;
        break;
      case 'info':
        baseStyle.fg = tokens.color.bg;
        baseStyle.bg = tokens.color.info;
        break;
    }
  }

  // Apply tone-based styling
  if (props.tone) {
    switch (props.tone) {
      case 'info':
        baseStyle.fg = tokens.color.info;
        break;
      case 'success':
        baseStyle.fg = tokens.color.success;
        break;
      case 'warning':
        baseStyle.fg = tokens.color.warning;
        break;
      case 'error':
        baseStyle.fg = tokens.color.error;
        break;
    }
  }

  // Apply size-based padding
  if (props.size && tokens.space) {
    const sizeIndex = ['xs', 'sm', 'md', 'lg', 'xl'].indexOf(props.size);
    if (sizeIndex >= 0 && tokens.space[sizeIndex]) {
      baseStyle.padding = tokens.space[sizeIndex];
    }
  }

  // Apply custom padding
  if (props.padding !== undefined) {
    baseStyle.padding = props.padding;
  }

  // Apply radius
  if (props.radius !== undefined && tokens.radius) {
    const radiusIndex = Math.min(props.radius, tokens.radius.length - 1);
    baseStyle.borderRadius = tokens.radius[radiusIndex];
  }

  // Apply focus state
  if (props.focus) {
    baseStyle.border = { fg: tokens.color.focus, type: 'line' };
  }

  // Apply disabled state
  if (props.disabled) {
    baseStyle.fg = tokens.color.muted;
    baseStyle.dim = true;
  }

  // Apply component-specific tokens if available (legacy)
  if (componentName && variant && size) {
    const componentTokens = getComponentTokens(componentName, variant, size);
    Object.assign(baseStyle, componentTokens);
  }

  // Apply custom styling props (legacy)
  if (props.borderRadius) {
    baseStyle.borderRadius = props.borderRadius;
  }

  if (props.shadow) {
    baseStyle.shadow = props.shadow;
  }

  if (props.animation) {
    baseStyle.animation = props.animation;
  }

  return baseStyle;
}

// Enhanced padding normalization
export function normalizePadding(
  p?: number | [number, number] | [number, number, number, number] | { top?: number; right?: number; bottom?: number; left?: number }
) {
  if (!p && p !== 0) return undefined as unknown as Widgets.Padding;

  if (Array.isArray(p)) {
    if (p.length === 2) {
      const [v, h] = p;
      return { top: v, bottom: v, left: h, right: h } as Widgets.Padding;
    } else if (p.length === 4) {
      const [top, right, bottom, left] = p;
      return { top, right, bottom, left } as Widgets.Padding;
    }
  }

  if (typeof p === "object" && !Array.isArray(p)) {
    return p as Widgets.Padding;
  }

  return {
    top: p as number,
    bottom: p as number,
    left: p as number,
    right: p as number,
  } as Widgets.Padding;
}

// Enhanced box creation with variants
export function createBoxBase<
  T extends Widgets.BoxElement = Widgets.BoxElement
>(props: BaseProps, componentName?: string): Component<T> {
  // Handle deprecated props with soft deprecation warnings
  const processedProps = { ...props };
  
  // Deprecation warnings (only in debug mode)
  if (process.env.TUI_DEBUG === '1') {
    if ('rounded' in props && !('radius' in props)) {
      console.warn(`[core/${componentName || 'Component'}] "rounded" is deprecated: use "radius".`);
      processedProps.radius = (props as any).rounded;
    }
    if ('p' in props && !('padding' in props)) {
      console.warn(`[core/${componentName || 'Component'}] "p" is deprecated: use "padding".`);
      processedProps.padding = (props as any).p;
    }
    if ('color' in props && !('tone' in props)) {
      console.warn(`[core/${componentName || 'Component'}] "color" is deprecated: use "tone".`);
      processedProps.tone = (props as any).color;
    }
  }

  // Apply defaults with proper precedence
  const opts = { ...COMPONENT_DEFAULTS, ...processedProps };

  const theme = resolveTheme(opts.theme);
  const variant = opts.variant;
  const size = opts.size;
  const state = opts.state || "default";

  // Get component-specific styling
  const componentTokens = componentName
    ? getComponentTokens(componentName, variant, size)
    : {};
  const baseStyle = computeBlessedStyle(
    theme,
    opts,
    componentName,
    variant,
    size
  );

  // Merge styles
  const mergedStyle = mergeComponentStyles(
    baseStyle,
    componentTokens,
    {},
    opts.blessedProps?.style || {}
  );

  const el = blessed.box({
    parent: opts.parent,
    label: opts.label,
    keys: opts.keys ?? true,
    mouse: opts.mouse ?? true,
    scrollable: opts.scrollable ?? false,
    focusable: opts.focusable ?? true,
    top: opts.top,
    left: opts.left,
    right: opts.right,
    bottom: opts.bottom,
    width: opts.width,
    height: opts.height,
    border: opts.border
      ? typeof opts.border === "string"
        ? opts.border
        : (opts.border as any).type || "line"
      : opts.borderStyle && opts.borderStyle !== "none"
      ? "line"
      : undefined,
    padding: normalizePadding(opts.padding) as any,
    style: mergedStyle as any,
  }) as T;

  // Memory cleanup utility
  const disposers: (() => void)[] = [];
  function onDispose(fn: () => void) { disposers.push(fn); }

  const component: Component<T> = {
    el,
    theme,
    destroy: () => {
      // Clean up all registered disposers
      disposers.splice(0).forEach(fn => fn());
      el.destroy();
    },
    setVariant: (newVariant: ComponentVariant) => {
      if (componentName) {
        const newTokens = getComponentTokens(componentName, newVariant, size);
        const newStyle = mergeComponentStyles(baseStyle, newTokens, {});
        el.style = newStyle as any;
        el.screen.render();
      }
    },
    setSize: (newSize: ComponentSize) => {
      if (componentName) {
        const newTokens = getComponentTokens(componentName, variant, newSize);
        const newStyle = mergeComponentStyles(baseStyle, newTokens, {});
        el.style = newStyle as any;
        el.screen.render();
      }
    },
    setState: (newState: ComponentState) => {
      // Apply state-specific styling
      const stateStyle = getStateStyle(newState, theme);
      Object.assign(el.style, stateStyle);
      el.screen.render();
    },
    getConfig: () => ({
      variant,
      size,
      state,
      theme,
      responsive: props.responsive,
    }),
    update: (newProps: Partial<BaseProps>) => {
      // Update component properties
      Object.assign(props, newProps);

      // Recompute styles if needed
      if (newProps.variant || newProps.size || newProps.state) {
        const newVariant = newProps.variant || variant;
        const newSize = newProps.size || size;
        const newState = newProps.state || state;

        if (componentName) {
          const newTokens = getComponentTokens(
            componentName,
            newVariant,
            newSize
          );
          const newStyle = mergeComponentStyles(baseStyle, newTokens, {});
          el.style = newStyle as any;
        }

        // Apply state styling
        const stateStyle = getStateStyle(newState, theme);
        Object.assign(el.style, stateStyle);
      }

      // Update element properties
      if (newProps.width !== undefined) el.width = newProps.width;
      if (newProps.height !== undefined) el.height = newProps.height;
      if (newProps.top !== undefined) el.top = newProps.top;
      if (newProps.left !== undefined) el.left = newProps.left;
      if (newProps.right !== undefined) el.right = newProps.right;
      if (newProps.bottom !== undefined) el.bottom = newProps.bottom;
      if (newProps.label !== undefined) el.setLabel(newProps.label);

      el.screen.render();
    },
  };

  return component;
}

// State-specific styling
function getStateStyle(
  state: ComponentState,
  theme: Theme
): Record<string, any> {
  switch (state) {
    case "hover":
      return {
        bg: theme.accent,
        fg: theme.background,
      };
    case "focus":
      return {
        border: { fg: theme.accent, type: "line" },
      };
    case "active":
      return {
        bg: theme.accent, // Use accent instead of primary
        fg: theme.background,
      };
    case "disabled":
      return {
        bg: theme.muted,
        fg: theme.foreground,
      };
    case "loading":
      return {
        bg: theme.muted,
        fg: theme.foreground,
      };
    default:
      return {};
  }
}

// Enhanced theme update with variants
export function updateBoxTheme(
  component: Component,
  themeOverrides?: StyleProps["theme"],
  variant?: ComponentVariant,
  size?: ComponentSize
) {
  const newTheme = resolveTheme(themeOverrides);
  component.theme = newTheme;

  const config = component.getConfig();
  const newVariant = variant || config.variant;
  const newSize = size || config.size;

  // Recompute styles with new theme and variants
  const baseStyle = computeBlessedStyle(
    newTheme,
    {},
    undefined,
    newVariant,
    newSize
  );
  component.el.style = baseStyle as any;

  component.el.screen.render();
}

// Utility function to create responsive components
export function createResponsiveComponent<
  T extends Widgets.BlessedElement = Widgets.BlessedElement
>(
  createFn: (props: BaseProps) => Component<T>,
  props: BaseProps,
  breakpoints: Record<string, Partial<BaseProps>>
): Component<T> {
  const component = createFn(props);

  // Store responsive configuration
  const responsiveConfig = {
    breakpoints,
    currentBreakpoint: "default",
  };

  // Add responsive methods
  (component as any).setBreakpoint = (breakpoint: string) => {
    if (breakpoints[breakpoint]) {
      responsiveConfig.currentBreakpoint = breakpoint;
      component.update(breakpoints[breakpoint]);
    }
  };

  (component as any).getResponsiveConfig = () => responsiveConfig;

  return component;
}

// Utility function to create compound components
export function createCompoundComponent<
  T extends Widgets.BlessedElement = Widgets.BlessedElement
>(
  components: Component<T>[],
  layout: "horizontal" | "vertical" | "grid",
  options?: {
    spacing?: number;
    alignment?: "start" | "center" | "end";
    distribution?:
      | "start"
      | "center"
      | "end"
      | "space-between"
      | "space-around";
  }
) {
  const {
    spacing = 1,
    alignment = "start",
    distribution = "start",
  } = options || {};

  // Layout logic based on type
  switch (layout) {
    case "horizontal":
      layoutComponentsHorizontally(
        components,
        spacing,
        alignment,
        distribution
      );
      break;
    case "vertical":
      layoutComponentsVertically(components, spacing, alignment, distribution);
      break;
    case "grid":
      layoutComponentsInGrid(components, spacing, alignment);
      break;
  }

  return components;
}

function layoutComponentsHorizontally<
  T extends Widgets.BlessedElement = Widgets.BlessedElement
>(
  components: Component<T>[],
  spacing: number,
  alignment: string,
  distribution: string
) {
  let currentLeft = 0;

  components.forEach((component, index) => {
    component.el.left = currentLeft;

    if (distribution === "space-between" && index < components.length - 1) {
      currentLeft += (component.el.width as number) + spacing;
    } else if (distribution === "space-around") {
      currentLeft += (component.el.width as number) + spacing;
    } else {
      currentLeft += (component.el.width as number) + spacing;
    }
  });
}

function layoutComponentsVertically<
  T extends Widgets.BlessedElement = Widgets.BlessedElement
>(
  components: Component<T>[],
  spacing: number,
  alignment: string,
  distribution: string
) {
  let currentTop = 0;

  components.forEach((component, index) => {
    component.el.top = currentTop;

    if (distribution === "space-between" && index < components.length - 1) {
      currentTop += (component.el.height as number) + spacing;
    } else if (distribution === "space-around") {
      currentTop += (component.el.height as number) + spacing;
    } else {
      currentTop += (component.el.height as number) + spacing;
    }
  });
}

function layoutComponentsInGrid<
  T extends Widgets.BlessedElement = Widgets.BlessedElement
>(components: Component<T>[], spacing: number, alignment: string) {
  // Simple grid layout - can be enhanced
  const cols = Math.ceil(Math.sqrt(components.length));
  const rows = Math.ceil(components.length / cols);

  components.forEach((component, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);

    component.el.left = col * ((component.el.width as number) + spacing);
    component.el.top = row * ((component.el.height as number) + spacing);
  });
}
