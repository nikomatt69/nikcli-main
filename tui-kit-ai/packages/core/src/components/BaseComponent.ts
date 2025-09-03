import blessed, { Widgets } from 'blessed';
import { StyleProps, Theme, resolveTheme } from '../theming/theme';

export type PositionProps = {
  top?: number | string;
  left?: number | string;
  right?: number | string;
  bottom?: number | string;
  width?: number | string;
  height?: number | string;
};

export type BaseProps = StyleProps & PositionProps & {
  parent?: Widgets.Node;
  label?: string;
  keys?: boolean;
  mouse?: boolean;
  scrollable?: boolean;
};

export type Component<T extends Widgets.BlessedElement = Widgets.BlessedElement> = {
  el: T;
  theme: Theme;
  destroy: () => void;
};

export function computeBlessedStyle(theme: Theme, props: StyleProps) {
  const style: any = {
    bg: props.bg || theme.background,
    fg: props.fg || theme.foreground,
    border: {
      fg: props.borderColor || theme.border,
    },
  } as any;
  return style;
}

export function normalizePadding(p?: number | [number, number]) {
  if (!p && p !== 0) return undefined as unknown as Widgets.Padding;
  if (Array.isArray(p)) {
    const [v, h] = p;
    return { top: v, bottom: v, left: h, right: h } as Widgets.Padding;
  }
  return { top: p as number, bottom: p as number, left: p as number, right: p as number } as Widgets.Padding;
}

export function createBoxBase<T extends Widgets.BoxElement = Widgets.BoxElement>(props: BaseProps): Component<T> {
  const theme = resolveTheme(props.theme);
  const el = blessed.box({
    parent: props.parent,
    label: props.label,
    keys: props.keys ?? true,
    mouse: props.mouse ?? true,
    scrollable: props.scrollable ?? false,
    top: props.top,
    left: props.left,
    right: props.right,
    bottom: props.bottom,
    width: props.width,
    height: props.height,
    border: props.borderStyle && props.borderStyle !== 'none' ? 'line' : undefined,
    padding: normalizePadding(props.padding) as any,
    style: computeBlessedStyle(theme, props) as any,
  }) as T;

  return {
    el,
    theme,
    destroy: () => el.destroy(),
  };
}

export function updateBoxTheme(component: Component, themeOverrides?: StyleProps['theme']) {
  component.theme = resolveTheme(themeOverrides);
  component.el.style = computeBlessedStyle(component.theme, {});
  component.el.screen.render();
}
