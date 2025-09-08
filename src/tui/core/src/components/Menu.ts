import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';
import { ComponentVariant, ComponentSize, ComponentState } from '../theming/design-tokens';
import { resolveTheme } from '../theming/theme';

export type MenuItem = {
  label: string;
  onSelect?: () => void;
  disabled?: boolean;
  shortcut?: string;
};

export type MenuProps = BaseProps & {
  items: MenuItem[];
  selectedIndex?: number;
  onSelect?: (index: number, item: MenuItem) => void;
};

export class Menu implements Component<Widgets.ListElement> {
  el: Widgets.ListElement;
  theme: any;
  destroy: () => void;
  private baseComponent: any;
  private props: MenuProps;
  private items: MenuItem[];

  constructor(props: MenuProps) {
    this.props = props;
    this.items = props.items;

    const comp = createBoxBase<Widgets.BoxElement>({
      ...props,
      borderStyle: props.borderStyle && props.borderStyle !== 'none' ? 'line' : undefined,
    }, 'menu');

    // Create menu list
    const el = blessed.list({
      parent: comp.el,
      items: this.renderMenuItems(),
      keys: true,
      mouse: true,
      interactive: true,
      style: {
        selected: { bg: comp.theme.accent, fg: comp.theme.background },
        item: { fg: comp.theme.foreground },
      },
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: props.width,
      height: props.height,
      label: props.label,
      border: props.borderStyle && props.borderStyle !== 'none' ? 'line' : undefined,
    });

    // Setup event handlers
    el.on('select', (_item, index) => {
      const item = this.items[index];
      if (item && !item.disabled) {
        item.onSelect?.();
        props.onSelect?.(index, item);
      }
    });

    // Set initial selection
    if (props.selectedIndex !== undefined && props.selectedIndex >= 0 && props.selectedIndex < this.items.length) {
      el.select(props.selectedIndex);
    }

    this.el = el;
    this.theme = comp.theme;
    this.destroy = () => {
      el.destroy();
      comp.destroy();
    };
    this.baseComponent = comp;
  }

  // Implement required methods by delegating to base component
  setVariant = (variant: ComponentVariant) => this.baseComponent.setVariant(variant);
  setSize = (size: ComponentSize) => this.baseComponent.setSize(size);
  setState = (state: ComponentState) => this.baseComponent.setState(state);
  getConfig = () => this.baseComponent.getConfig();
  update = (props: Partial<BaseProps>) => this.baseComponent.update(props);

  private renderMenuItems(): string[] {
    return this.items.map((item, index) => {
      let label = item.label;

      if (item.disabled) {
        label = `[${label}]`;
      }

      if (item.shortcut) {
        label += ` (${item.shortcut})`;
      }

      return label;
    });
  }

  // Method to set menu items
  setItems(items: MenuItem[]) {
    this.items = items;
    this.el.setItems(this.renderMenuItems());
    this.el.screen.render();
  }

  // Method to add item
  addItem(item: MenuItem) {
    this.items.push(item);
    this.el.setItems(this.renderMenuItems());
    this.el.screen.render();
  }

  // Method to remove item by index
  removeItem(index: number) {
    if (index >= 0 && index < this.items.length) {
      this.items.splice(index, 1);
      this.el.setItems(this.renderMenuItems());
      this.el.screen.render();
    }
  }

  // Method to update item
  updateItem(index: number, item: MenuItem) {
    if (index >= 0 && index < this.items.length) {
      this.items[index] = item;
      this.el.setItems(this.renderMenuItems());
      this.el.screen.render();
    }
  }

  // Method to select item
  selectItem(index: number) {
    if (index >= 0 && index < this.items.length) {
      this.el.select(index);
      this.el.screen.render();
    }
  }

  // Method to get selected index
  getSelectedIndex(): number {
    return (this.el as any).selected || 0;
  }

  // Method to get selected item
  getSelectedItem(): MenuItem | undefined {
    const index = this.getSelectedIndex();
    return this.items[index];
  }

  // Method to enable/disable item
  setItemDisabled(index: number, disabled: boolean) {
    if (index >= 0 && index < this.items.length) {
      this.items[index].disabled = disabled;
      this.el.setItems(this.renderMenuItems());
      this.el.screen.render();
    }
  }

  // Method to clear all items
  clearItems() {
    this.items = [];
    this.el.setItems([]);
    this.el.screen.render();
  }

  // Static method to create menu with specific configuration
  static create(props: MenuProps): Menu {
    return new Menu(props);
  }
}


