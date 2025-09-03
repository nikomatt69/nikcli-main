import { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';

const bars = ['▁','▂','▃','▄','▅','▆','▇','█','▇','▆','▅','▄','▃','▂'];

export type ProgressSpinnerProps = BaseProps & { text?: string; intervalMs?: number };

export class ProgressSpinner implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private timer?: NodeJS.Timeout;
  private idx = 0;

  constructor(props: ProgressSpinnerProps) {
    const comp = createBoxBase<Widgets.BoxElement>({ ...props, borderStyle: 'none' });
    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = () => { if (this.timer) clearInterval(this.timer); comp.destroy(); };
    const interval = props.intervalMs ?? 80;
    this.timer = setInterval(() => {
      this.el.setContent(`${bars[this.idx = (this.idx + 1) % bars.length]} ${props.text || ''}`);
      this.el.screen.render();
    }, interval);
  }
}
