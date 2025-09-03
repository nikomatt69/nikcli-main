import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, computeBlessedStyle } from './BaseComponent';
import { resolveTheme } from '../theming/theme';

export type ToastProps = BaseProps & { text: string; durationMs?: number };

export class Toast implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private timer?: NodeJS.Timeout;

  constructor(props: ToastProps) {
    const theme = resolveTheme(props.theme);
    const el = blessed.box({ parent: props.parent, bottom: 1, left: 'center', width: 'shrink', height: 3, border: { type: 'line' }, style: computeBlessedStyle(theme, props) });
    el.setContent(` ${props.text} `);
    this.el = el;
    this.theme = theme;
    this.destroy = () => { if (this.timer) clearTimeout(this.timer); el.destroy(); };
    const d = props.durationMs ?? 2000;
    this.timer = setTimeout(() => this.destroy(), d);
  }
}
