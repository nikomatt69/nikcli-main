import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, computeBlessedStyle } from './BaseComponent';
import { resolveTheme } from '../theming/theme';

export type Tab = { id: string; label: string; render: (parent: Widgets.Node) => void };
export type TabsProps = BaseProps & { tabs: Tab[]; activeId?: string; onChange?: (id: string) => void };

export class Tabs implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private header: Widgets.ListElement;
  private body: Widgets.BoxElement;
  private tabs: Tab[];
  private activeId: string;

  constructor(props: TabsProps) {
    const theme = resolveTheme(props.theme);
    const el = blessed.box({ parent: props.parent, border: props.borderStyle && props.borderStyle !== 'none' ? 'line' : undefined, style: computeBlessedStyle(theme, props), top: props.top, left: props.left, right: props.right, bottom: props.bottom, width: props.width, height: props.height, label: props.label });
    this.header = blessed.list({ parent: el, top: 0, left: 0, right: 0, height: 3, keys: true, mouse: true, items: [] });
    this.body = blessed.box({ parent: el, top: 3, left: 0, right: 0, bottom: 0 });
    this.el = el;
    this.theme = theme;
    this.destroy = () => el.destroy();
    this.tabs = props.tabs;
    this.activeId = props.activeId || props.tabs[0]?.id || '';
    this.renderTabs(props.onChange);
  }

  private renderTabs(onChange?: (id: string) => void) {
    this.header.setItems(this.tabs.map(t => t.label));
    const idx = Math.max(0, this.tabs.findIndex(t => t.id === this.activeId));
    this.header.select(idx);
    this.body.children.forEach(ch => ch.detach());
    this.tabs[idx]?.render(this.body);
    this.el.screen.render();
    this.header.on('select', (_item, index) => {
      const tab = this.tabs[index];
      if (!tab) return;
      this.activeId = tab.id;
      this.body.children.forEach(ch => ch.detach());
      tab.render(this.body);
      this.el.screen.render();
      onChange?.(tab.id);
    });
  }
}
