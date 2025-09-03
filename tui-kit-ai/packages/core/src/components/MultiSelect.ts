import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, computeBlessedStyle } from './BaseComponent';
import { resolveTheme } from '../theming/theme';

export type MultiSelectProps = BaseProps & {
  options: string[];
  onChange?: (selectedIndices: number[], selectedValues: string[]) => void;
};

export class MultiSelect implements Component<Widgets.ListElement> {
  el: Widgets.ListElement;
  theme: any;
  destroy: () => void;
  private selected = new Set<number>();

  constructor(props: MultiSelectProps) {
    const theme = resolveTheme(props.theme);
    const el = blessed.list({
      parent: props.parent,
      items: props.options,
      keys: props.keys ?? true,
      mouse: props.mouse ?? true,
      interactive: true,
      style: {
        ...computeBlessedStyle(theme, props),
        selected: { bg: theme.accent, fg: theme.background },
        item: { fg: theme.foreground },
      },
      top: props.top,
      left: props.left,
      right: props.right,
      bottom: props.bottom,
      width: props.width,
      height: props.height,
      label: props.label,
      border: props.borderStyle && props.borderStyle !== 'none' ? 'line' : undefined,
    });
    el.on('select', (_item, index) => {
      if (this.selected.has(index)) this.selected.delete(index); else this.selected.add(index);
      this.renderSelections(props.options);
      if (props.onChange) props.onChange(Array.from(this.selected).sort((a,b)=>a-b), Array.from(this.selected).sort((a,b)=>a-b).map(i => props.options[i]));
    });
    this.el = el;
    this.theme = theme;
    this.destroy = () => el.destroy();
  }

  private renderSelections(options: string[]) {
    const items = options.map((text, idx) => `${this.selected.has(idx) ? '[x] ' : '[ ] '}${text}`);
    this.el.setItems(items);
    this.el.screen.render();
  }
}
