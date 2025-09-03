import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, computeBlessedStyle } from './BaseComponent';
import { resolveTheme } from '../theming/theme';

export type TreeNode = { label: string; children?: TreeNode[] };
export type TreeProps = BaseProps & { data: TreeNode[]; onSelect?: (path: string[]) => void };

export class Tree implements Component<Widgets.ListElement> {
  el: Widgets.ListElement;
  theme: any;
  destroy: () => void;
  private flat: { text: string; path: string[] }[] = [];

  constructor(props: TreeProps) {
    const theme = resolveTheme(props.theme);
    const el = blessed.list({
      parent: props.parent,
      items: [],
      style: computeBlessedStyle(theme, props),
      keys: true,
      mouse: true,
      border: props.borderStyle && props.borderStyle !== 'none' ? { type: props.borderStyle } : undefined,
      top: props.top,
      left: props.left,
      right: props.right,
      bottom: props.bottom,
      width: props.width,
      height: props.height,
      label: props.label,
    });
    this.el = el;
    this.theme = theme;
    this.destroy = () => el.destroy();
    this.setData(props.data);
    if (props.onSelect) el.on('select', (_i, idx) => props.onSelect!(this.flat[idx].path));
  }

  setData(data: TreeNode[]) {
    this.flat = [];
    const items: string[] = [];
    const walk = (nodes: TreeNode[], depth: number, path: string[]) => {
      for (const n of nodes) {
        const text = `${'  '.repeat(depth)}${depth ? '└ ' : ''}${n.label}`;
        items.push(text);
        this.flat.push({ text, path: [...path, n.label] });
        if (n.children?.length) walk(n.children, depth + 1, [...path, n.label]);
      }
    };
    walk(data, 0, []);
    this.el.setItems(items);
    this.el.screen.render();
  }
}
