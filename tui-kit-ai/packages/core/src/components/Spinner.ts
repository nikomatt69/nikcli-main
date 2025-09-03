import { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';

const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];

export type SpinnerProps = BaseProps & {
  text?: string;
  intervalMs?: number;
};

export class Spinner implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private timer?: NodeJS.Timeout;
  private idx = 0;

  constructor(props: SpinnerProps) {
    const comp = createBoxBase<Widgets.BoxElement>({ ...props, borderStyle: 'none' });
    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = () => {
      if (this.timer) clearInterval(this.timer);
      comp.destroy();
    };
    this.start(props.text, props.intervalMs);
  }

  start(text?: string, intervalMs = 80) {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.el.setContent(`${frames[this.idx = (this.idx + 1) % frames.length]} ${text || ''}`);
      this.el.screen.render();
    }, intervalMs);
  }
}
