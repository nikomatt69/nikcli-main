import blessed, { Widgets } from 'blessed';

export type ToolOutputProps = { parent: Widgets.Node; title?: string };

export class ToolOutput {
  el: Widgets.BoxElement;
  constructor(props: ToolOutputProps) {
    this.el = blessed.box({ parent: props.parent, label: ` ${props.title || 'Tool Output'} `, border: 'line', scrollable: true, alwaysScroll: true });
  }
  append(line: string) {
    const prev = this.el.getContent() || '';
    this.el.setContent(prev ? prev + '\n' + line : line);
    this.el.setScrollPerc(100);
    this.el.screen.render();
  }
}


