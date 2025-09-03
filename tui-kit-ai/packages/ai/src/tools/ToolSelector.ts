import blessed, { Widgets } from 'blessed';

export type ToolItem = { name: string; description?: string };
export type ToolSelectorProps = { parent: Widgets.Node; tools: ToolItem[]; onSelect?: (tool: ToolItem) => void };

export class ToolSelector {
  el: Widgets.ListElement;
  constructor(props: ToolSelectorProps) {
    this.el = blessed.list({ parent: props.parent, items: props.tools.map(t => t.name), keys: true, mouse: true, border: 'line', label: ' Tools ' });
    this.el.on('select', (_item, index) => props.onSelect?.(props.tools[index]));
  }
}
