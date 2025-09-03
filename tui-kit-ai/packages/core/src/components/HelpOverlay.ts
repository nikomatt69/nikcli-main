import blessed, { Widgets } from 'blessed';
import { BaseProps, Component } from './BaseComponent';

export type HelpOverlayProps = BaseProps & { content: string; onClose?: () => void };

export class HelpOverlay implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private overlay: Widgets.BoxElement;

  constructor(props: HelpOverlayProps) {
    const overlay = blessed.box({ parent: props.parent, top: 0, left: 0, right: 0, bottom: 0, style: { bg: 'black' } });
    const el = blessed.box({ parent: overlay, width: '80%', height: '80%', top: 'center', left: 'center', border: { type: 'line' }, content: props.content, scrollable: true, alwaysScroll: true, label: ' Help ' });
    overlay.key(['escape', 'q'], () => { props.onClose?.(); this.destroy(); });
    this.overlay = overlay;
    this.el = el;
    this.theme = {};
    this.destroy = () => { el.destroy(); overlay.destroy(); };
  }
}
