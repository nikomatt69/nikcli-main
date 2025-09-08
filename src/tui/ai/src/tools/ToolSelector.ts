import blessed, { Widgets } from 'blessed';
import { BaseProps } from '@tui-kit-ai/core';

export type ToolItem = { name: string; description?: string };
export type ToolSelectorProps = BaseProps & {
  tools: ToolItem[];
  onSelect?: (tool: ToolItem) => void;
};

export class ToolSelector {
  el: Widgets.ListElement;
  constructor(props: ToolSelectorProps) {
    this.el = blessed.list({
      parent: props.parent,
      top: props.top,
      left: props.left,
      right: props.right,
      bottom: props.bottom,
      width: props.width,
      height: props.height,
      items: props.tools.map((t: ToolItem) => t.name),
      keys: props.keys ?? true,
      mouse: props.mouse ?? true,
      scrollable: props.scrollable ?? true,
      focusable: props.focusable ?? true,
      border:
        props.borderStyle && props.borderStyle !== 'none' ? 'line' : undefined,
      label: props.label || ' Tools ',
      style: {
        bg: props.bg as string,
        fg: props.fg as string,
      },
      padding: props.padding as any,
    });
    // blessed emits 'select' with (item, index) where index may be undefined - guard access
    this.el.on('select', (item: any, index?: number) => {
      if (typeof index === 'number') {
        props.onSelect?.(props.tools[index]);
      }
    });
  }
}
