import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';
import { ComponentVariant, ComponentSize, ComponentState } from '../theming/design-tokens';

export type ProgressItem = {
  label: string;
  value: number;
  maxValue?: number;
  color?: string;
};

export type ProgressListProps = BaseProps & {
  items: ProgressItem[];
  showPercentages?: boolean;
  showValues?: boolean;
  barWidth?: number;
  itemHeight?: number;
};

export class ProgressList implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private baseComponent: any;
  private props: ProgressListProps;
  private bars: Widgets.ProgressBarElement[] = [];
  private items: ProgressItem[];

  constructor(props: ProgressListProps) {
    this.props = props;
    this.items = props.items;

    const comp = createBoxBase<Widgets.BoxElement>({
      ...props,
      borderStyle: 'line',
      label: props.label || ' Progress ',
    }, 'progress-list');

    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = comp.destroy;
    this.baseComponent = comp;

    this.renderProgressItems();
  }

  // Implement required methods by delegating to base component
  setVariant = (variant: ComponentVariant) => this.baseComponent.setVariant(variant);
  setSize = (size: ComponentSize) => this.baseComponent.setSize(size);
  setState = (state: ComponentState) => this.baseComponent.setState(state);
  getConfig = () => this.baseComponent.getConfig();
  update = (props: Partial<BaseProps>) => this.baseComponent.update(props);


  private renderProgressItems() {
    // Clear existing bars
    this.bars.forEach(bar => bar.destroy());
    this.bars = [];

    const { showPercentages = true, showValues = true, barWidth = 20, itemHeight = 2 } = this.props;

    this.items.forEach((item, i) => {
      // Create label
      blessed.text({
        parent: this.el,
        top: i * itemHeight,
        left: 2,
        content: item.label,
        style: { fg: this.theme.foreground },
      });

      // Create progress bar
      const bar = blessed.progressbar({
        parent: this.el,
        top: i * itemHeight,
        left: 25,
        right: 2,
        height: 1,
        style: {
          bg: this.theme.background,
          fg: item.color || this.theme.accent,
        },
      });

      // Set progress value
      const maxValue = item.maxValue || 100;
      const percentage = Math.max(0, Math.min(100, (item.value / maxValue) * 100));
      bar.setProgress(percentage);

      // Add percentage/value text if enabled
      if (showPercentages || showValues) {
        let text = '';
        if (showPercentages) {
          text += `${Math.round(percentage)}%`;
        }
        if (showValues && showPercentages) {
          text += ' ';
        }
        if (showValues) {
          text += `${item.value}/${maxValue}`;
        }

        blessed.text({
          parent: this.el,
          top: i * itemHeight,
          left: 25 + barWidth + 2,
          content: text,
          style: { fg: this.theme.foreground },
        });
      }

      this.bars.push(bar);
    });
  }
  // Method to update progress item
  updateProgress(index: number, value: number, maxValue?: number) {
    if (index >= 0 && index < this.items.length) {
      this.items[index].value = value;
      if (maxValue !== undefined) {
        this.items[index].maxValue = maxValue;
      }

      const bar = this.bars[index];
      if (bar) {
        const maxVal = this.items[index].maxValue || 100;
        const percentage = Math.max(0, Math.min(100, (value / maxVal) * 100));
        bar.setProgress(percentage);
      }

      this.el.screen.render();
    }
  }

  // Method to set progress items
  setItems(items: ProgressItem[]) {
    this.items = items;
    this.renderProgressItems();
    this.el.screen.render();
  }

  // Method to add progress item
  addItem(item: ProgressItem) {
    this.items.push(item);
    this.renderProgressItems();
    this.el.screen.render();
  }

  // Method to remove progress item
  removeItem(index: number) {
    if (index >= 0 && index < this.items.length) {
      this.items.splice(index, 1);
      this.renderProgressItems();
      this.el.screen.render();
    }
  }

  // Method to update item label
  setItemLabel(index: number, label: string) {
    if (index >= 0 && index < this.items.length) {
      this.items[index].label = label;
      this.renderProgressItems();
      this.el.screen.render();
    }
  }

  // Method to set item color
  setItemColor(index: number, color: string) {
    if (index >= 0 && index < this.items.length) {
      this.items[index].color = color;
      this.renderProgressItems();
      this.el.screen.render();
    }
  }

  // Method to set all progress values
  setAllProgress(values: number[]) {
    values.forEach((value, index) => {
      if (index < this.items.length) {
        this.updateProgress(index, value);
      }
    });
  }

  // Method to reset all progress
  resetAll() {
    this.items.forEach((item, index) => {
      this.updateProgress(index, 0);
    });
  }

  // Method to get progress item
  getItem(index: number): ProgressItem | undefined {
    return this.items[index];
  }

  // Method to get all items
  getAllItems(): ProgressItem[] {
    return [...this.items];
  }

  // Method to get total progress
  getTotalProgress(): number {
    if (this.items.length === 0) return 0;

    const totalValue = this.items.reduce((sum, item) => sum + item.value, 0);
    const totalMax = this.items.reduce((sum, item) => sum + (item.maxValue || 100), 0);

    return (totalValue / totalMax) * 100;
  }

  // Method to toggle percentage display
  setShowPercentages(show: boolean) {
    this.props.showPercentages = show;
    this.renderProgressItems();
    this.el.screen.render();
  }

  // Method to toggle value display
  setShowValues(show: boolean) {
    this.props.showValues = show;
    this.renderProgressItems();
    this.el.screen.render();
  }

  // Method to set bar width
  setBarWidth(width: number) {
    this.props.barWidth = width;
    this.renderProgressItems();
    this.el.screen.render();
  }

  // Method to set item height
  setItemHeight(height: number) {
    this.props.itemHeight = height;
    this.renderProgressItems();
    this.el.screen.render();
  }

  // Static method to create progress list with specific configuration
  static create(props: ProgressListProps): ProgressList {
    return new ProgressList(props);
  }
}


