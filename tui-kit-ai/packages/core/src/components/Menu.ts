import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, computeBlessedStyle } from './BaseComponent';
import { resolveTheme } from '../theming/theme';

export type MenuItem = { label: string; onSelect?: () => void };
export type MenuProps = BaseProps & { items: MenuItem[] };

export class Menu implements Component<Widgets.ListElement> {
  el: Widgets.ListElement;
  theme: any;
  destroy: () => void;

  constructor(props: MenuProps) {
    const theme = resolveTheme(props.theme);
    const el = blessed.list({
      parent: props.parent,
      items: props.items.map(i => i.label),
      keys: true,
      mouse: true,
      interactive: true,
      style: { ...computeBlessedStyle(theme, props), selected: { bg: theme.accent, fg: theme.background } },
      top: props.top,
      left: props.left,
      right: props.right,
      bottom: props.bottom,
      width: props.width,
      height: props.height,
      label: props.label,
      border: props.borderStyle && props.borderStyle !== 'none' ? 'line' : undefined,
    });
    el.on('select', (_item, index) => props.items[index]?.onSelect?.());
    this.el = el;
    this.theme = theme;
    this.destroy = () => el.destroy();
  }
}
