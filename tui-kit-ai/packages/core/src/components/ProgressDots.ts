import { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';

export type ProgressDotsProps = BaseProps & { text?: string; intervalMs?: number };

export class ProgressDots implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private timer?: NodeJS.Timeout;
  private idx = 0;

  constructor(props: ProgressDotsProps) {
    const comp = createBoxBase<Widgets.BoxElement>({ ...props, borderStyle: 'none' });
    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = () => { if (this.timer) clearInterval(this.timer); comp.destroy(); };
    const frames = ['', '.', '..', '...'];
    const interval = props.intervalMs ?? 300;
    this.timer = setInterval(() => {
      this.idx = (this.idx + 1) % frames.length;
      this.el.setContent(`${props.text || ''}${frames[this.idx]}`);
      this.el.screen.render();
    }, interval);
  }
}
