import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, computeBlessedStyle } from './BaseComponent';
import { resolveTheme } from '../theming/theme';

export type SelectProps = BaseProps & {
  options: string[];
  onSelect?: (index: number, value: string) => void;
};

export class Select implements Component<Widgets.ListElement> {
  el: Widgets.ListElement;
  theme: any;
  destroy: () => void;

  constructor(props: SelectProps) {
    const theme = resolveTheme(props.theme);
    const el = blessed.list({
      parent: props.parent,
      items: props.options,
      keys: props.keys ?? true,
      mouse: props.mouse ?? true,
      interactive: true,
      style: {
        ...computeBlessedStyle(theme, props),
        selected: { bg: theme.accent, fg: theme.background },
      },
      top: props.top,
      left: props.left,
      right: props.right,
      bottom: props.bottom,
      width: props.width,
      height: props.height,
      label: props.label,
      border: props.borderStyle && props.borderStyle !== 'none' ? 'line' : undefined,
    });
    if (props.onSelect) el.on('select', (item, index) => props.onSelect!(index, item.getText()));
    this.el = el;
    this.theme = theme;
    this.destroy = () => el.destroy();
  }
}
