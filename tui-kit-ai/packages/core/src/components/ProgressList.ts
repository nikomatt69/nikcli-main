import blessed, { Widgets } from 'blessed';
import { BaseProps, Component } from './BaseComponent';

export type ProgressItem = { label: string; value: number };
export type ProgressListProps = BaseProps & { items: ProgressItem[] };

export class ProgressList implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private bars: Widgets.ProgressBarElement[] = [];

  constructor(props: ProgressListProps) {
    const el = blessed.box({ parent: props.parent, border: { type: 'line' }, label: props.label || ' Progress ' });
    props.items.forEach((it, i) => {
      blessed.text({ parent: el, top: i * 2, left: 2, content: it.label });
      const bar = blessed.progressbar({ parent: el, top: i * 2, left: 20, right: 2 });
      bar.setProgress(it.value);
      this.bars.push(bar);
    });
    this.el = el;
    this.theme = {};
    this.destroy = () => el.destroy();
  }

  update(index: number, value: number) {
    this.bars[index]?.setProgress(Math.max(0, Math.min(100, value)));
    this.el.screen.render();
  }
}
