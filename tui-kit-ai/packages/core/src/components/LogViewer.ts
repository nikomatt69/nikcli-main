import { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';

export type LogViewerProps = BaseProps & { maxLines?: number };

export class LogViewer implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private maxLines: number;

  constructor(props: LogViewerProps) {
    const comp = createBoxBase<Widgets.BoxElement>({ ...props, scrollable: true, label: props.label || ' Logs ' });
    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = comp.destroy;
    this.maxLines = props.maxLines ?? 500;
  }

  push(line: string) {
    const content = (this.el.getContent() || '').split('\n');
    content.push(line);
    const sliced = content.slice(-this.maxLines);
    this.el.setContent(sliced.join('\n'));
    this.el.setScrollPerc(100);
    this.el.screen.render();
  }
}
