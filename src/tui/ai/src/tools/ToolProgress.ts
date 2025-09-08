import blessed, { Widgets } from 'blessed';

export type ToolProgressProps = { parent: Widgets.Node; label?: string };

export class ToolProgress {
  el: Widgets.BoxElement;
  private bar: Widgets.ProgressBarElement;
  constructor(props: ToolProgressProps) {
    this.el = blessed.box({ parent: props.parent, label: ` ${props.label || 'Progress'} `, border: 'line' });
    this.bar = blessed.progressbar({ parent: this.el, left: 1, right: 1, top: 1, height: 1 });
  }
  setValue(v: number) { this.bar.setProgress(Math.max(0, Math.min(100, v))); this.el.screen.render(); }
}


