import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, computeBlessedStyle } from './BaseComponent';
import { resolveTheme } from '../theming/theme';

export type TableProps = BaseProps & {
  headers: string[];
  rows: (string | number)[][];
};

export class Table implements Component<Widgets.TableElement> {
  el: Widgets.TableElement;
  theme: any;
  destroy: () => void;

  constructor(props: TableProps) {
    const theme = resolveTheme(props.theme);
    const el = blessed.table({
      parent: props.parent,
      data: [props.headers, ...props.rows.map(r => r.map(String))],
      keys: props.keys ?? true,
      mouse: props.mouse ?? true,
      style: {
        ...computeBlessedStyle(theme, props),
        header: { fg: theme.accent, bold: true },
        cell: { fg: theme.foreground },
      },
      border: props.borderStyle && props.borderStyle !== 'none' ? { type: props.borderStyle } : undefined,
      top: props.top,
      left: props.left,
      right: props.right,
      bottom: props.bottom,
      width: props.width,
      height: props.height,
      label: props.label,
    });
    this.el = el;
    this.theme = theme;
    this.destroy = () => el.destroy();
  }
}
