import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';
import { ComponentVariant, ComponentSize, ComponentState } from '../theming/design-tokens';
import { resolveTheme } from '../theming/theme';

export type MultiSelectProps = BaseProps & {
  options: string[];
  onChange?: (selectedIndices: number[], selectedValues: string[]) => void;
  selectedIndices?: number[];
  maxSelections?: number;
  allowDeselect?: boolean;
};

export class MultiSelect implements Component<Widgets.ListElement> {
  el: Widgets.ListElement;
  theme: any;
  destroy: () => void;
  private baseComponent: any;
  private props: MultiSelectProps;
  private selected = new Set<number>();
  private options: string[];

  constructor(props: MultiSelectProps) {
    this.props = props;
    this.options = props.options;

    if (props.selectedIndices) {
      props.selectedIndices.forEach(index => this.selected.add(index));
    }

    const comp = createBoxBase<Widgets.BoxElement>({
      ...props,
      borderStyle: props.borderStyle && props.borderStyle !== 'none' ? 'line' : undefined,
    }, 'multi-select');

    // Create multi-select list
    const el = blessed.list({
      parent: comp.el,
      items: this.renderSelections() as any,
      keys: props.keys ?? true,
      mouse: props.mouse ?? true,
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

    // Setup selection handler
    el.on('select', (_item, index) => {
      this.handleSelection(index);
    });

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

  private handleSelection(index: number) {
    if (this.selected.has(index)) {
      if (this.props.allowDeselect !== false) {
        this.selected.delete(index);
      }
    } else {
      if (!this.props.maxSelections || this.selected.size < this.props.maxSelections) {
        this.selected.add(index);
      }
    }

    this.renderSelections();
    this.notifyChange();
  }

  private renderSelections() {
    const items = this.options.map((text, idx) => {
      const isSelected = this.selected.has(idx);
      return `${isSelected ? '[x] ' : '[ ] '}${text}`;
    });

    this.el.setItems(items);
    this.el.screen.render();
  }

  private notifyChange() {
    if (this.props.onChange) {
      const selectedIndices = Array.from(this.selected).sort((a, b) => a - b);
      const selectedValues = selectedIndices.map(i => this.options[i]);
      this.props.onChange(selectedIndices, selectedValues);
    }
  }

  // Method to set options
  setOptions(options: string[]) {
    this.options = options;
    this.selected.clear();
    this.renderSelections();
  }

  // Method to add option
  addOption(option: string) {
    this.options.push(option);
    this.renderSelections();
  }

  // Method to remove option by index
  removeOption(index: number) {
    if (index >= 0 && index < this.options.length) {
      this.options.splice(index, 1);
      this.selected.delete(index);

      // Adjust selected indices after removal
      const newSelected = new Set<number>();
      this.selected.forEach(idx => {
        if (idx < index) {
          newSelected.add(idx);
        } else if (idx > index) {
          newSelected.add(idx - 1);
        }
      });
      this.selected = newSelected;

      this.renderSelections();
      this.notifyChange();
    }
  }

  // Method to set selected indices
  setSelectedIndices(indices: number[]) {
    this.selected.clear();
    indices.forEach(index => {
      if (index >= 0 && index < this.options.length) {
        this.selected.add(index);
      }
    });
    this.renderSelections();
    this.notifyChange();
  }

  // Method to get selected indices
  getSelectedIndices(): number[] {
    return Array.from(this.selected).sort((a, b) => a - b);
  }

  // Method to get selected values
  getSelectedValues(): string[] {
    return this.getSelectedIndices().map(i => this.options[i]);
  }

  // Method to select all
  selectAll() {
    this.options.forEach((_, index) => this.selected.add(index));
    this.renderSelections();
    this.notifyChange();
  }

  // Method to deselect all
  deselectAll() {
    this.selected.clear();
    this.renderSelections();
    this.notifyChange();
  }

  // Method to toggle selection
  toggleSelection(index: number) {
    if (index >= 0 && index < this.options.length) {
      this.handleSelection(index);
    }
  }

  // Method to check if option is selected
  isSelected(index: number): boolean {
    return this.selected.has(index);
  }

  // Method to get selection count
  getSelectionCount(): number {
    return this.selected.size;
  }

  // Static method to create multi-select with specific configuration
  static create(props: MultiSelectProps): MultiSelect {
    return new MultiSelect(props);
  }
}


