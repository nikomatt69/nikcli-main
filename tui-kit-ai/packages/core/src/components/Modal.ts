import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, computeBlessedStyle } from './BaseComponent';
import { resolveTheme } from '../theming/theme';

export type ModalProps = BaseProps & { title?: string; content?: string; onClose?: () => void };

export class Modal implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private overlay: Widgets.BoxElement;

  constructor(props: ModalProps) {
    const theme = resolveTheme(props.theme);
    const overlay = blessed.box({ parent: props.parent, top: 0, left: 0, right: 0, bottom: 0, style: { bg: 'black', transparent: false }, clickable: true });
    const el = blessed.box({ parent: overlay, width: '70%', height: '60%', top: 'center', left: 'center', border: { type: 'line' }, style: computeBlessedStyle(theme, props), label: props.title || ' Modal ' });
    if (props.content) el.setContent(props.content);
    overlay.key(['escape', 'q'], () => { props.onClose?.(); this.destroy(); });
    this.overlay = overlay;
    this.el = el;
    this.theme = theme;
    this.destroy = () => { el.destroy(); overlay.destroy(); };
  }
}
