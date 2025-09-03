import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, computeBlessedStyle } from './BaseComponent';
import { resolveTheme } from '../theming/theme';

export type MenuItem = { label: string; onSelect?: () => void };
export type MenuProps = BaseProps & { items: MenuItem[] };

export class Menu implements Component<Widgets.ListbarElement> {
  el: Widgets.ListbarElement;
  theme: any;
  destroy: () => void;

  constructor(props: MenuProps) {
    const theme = resolveTheme(props.theme);
    const commands: Record<string, () => void> = {};
    props.items.forEach((it, i) => {
      commands[`f${i + 1}`] = () => it.onSelect?.();
    });
    const el = blessed.listbar({
      parent: props.parent,
      commands,
      autoCommandKeys: true,
      style: { ...computeBlessedStyle(theme, props), item: { bg: theme.border, fg: theme.foreground }, selected: { bg: theme.accent, fg: theme.background } },
      top: props.top,
      left: props.left,
      right: props.right,
      bottom: props.bottom,
      width: props.width,
      height: props.height,
      label: props.label,
      border: props.borderStyle && props.borderStyle !== 'none' ? { type: props.borderStyle } : undefined,
    });
    this.el = el;
    this.theme = theme;
    this.destroy = () => el.destroy();
  }
}
