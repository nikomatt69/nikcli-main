import blessed, { Widgets } from 'blessed';

export type StreamingTextProps = { parent: Widgets.Node; prefix?: string };

export class StreamingText {
  el: Widgets.BoxElement;
  private buffer = '';
  private prefix = '';
  constructor(props: StreamingTextProps) {
    this.el = blessed.box({ parent: props.parent, tags: false, scrollable: true, alwaysScroll: true });
    this.prefix = props.prefix || '';
  }
  append(chunk: string) {
    this.buffer += chunk;
    this.el.setContent(`${this.prefix}${this.buffer}`);
    this.el.setScrollPerc(100);
    this.el.screen.render();
  }
  reset() { this.buffer = ''; this.el.setContent(''); this.el.screen.render(); }
}
