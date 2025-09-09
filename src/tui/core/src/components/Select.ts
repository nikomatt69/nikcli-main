import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';
import { ComponentVariant, ComponentSize, ComponentState } from '../theming/design-tokens';
import { resolveTheme } from '../theming/theme';

export type SelectProps = BaseProps & {
  options: string[];
  onSelect?: (index: number, value: string) => void;
  placeholder?: string;
  selectedIndex?: number;
  searchable?: boolean;
  maxHeight?: number;
};

export class Select implements Component<Widgets.ListElement> {
  el: Widgets.ListElement;
  theme: any;
  destroy: () => void;
  private baseComponent: any;
  private props: SelectProps;
  private options: string[];
  private selectedIndex: number;
  private filteredOptions: string[];
  private searchMode: boolean = false;

  constructor(props: SelectProps) {
    this.props = props;
    this.options = props.options;
    this.selectedIndex = props.selectedIndex ?? -1;
    this.filteredOptions = [...this.options];

    const comp = createBoxBase<Widgets.BoxElement>({
      ...props,
      borderStyle: props.borderStyle && props.borderStyle !== 'none' ? 'line' : undefined,
    }, 'select');

    // Create select list
    const el = blessed.list({
      parent: comp.el,
      items: this.renderOptions(),
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
      height: props.height || props.maxHeight || 10,
      label: props.label,
      border: props.borderStyle && props.borderStyle !== 'none' ? 'line' : undefined,
    });

    this.el = el;
    this.theme = comp.theme;
    this.destroy = () => {
      el.destroy();
      comp.destroy();
    };
    this.baseComponent = comp;

    this.setupEventHandlers();
    this.updateDisplay();
  }

  // Implement required methods by delegating to base component
  setVariant = (variant: ComponentVariant) => this.baseComponent.setVariant(variant);
  setSize = (size: ComponentSize) => this.baseComponent.setSize(size);
  setState = (state: ComponentState) => this.baseComponent.setState(state);
  getConfig = () => this.baseComponent.getConfig();
  update = (props: Partial<BaseProps>) => this.baseComponent.update(props);

  private setupEventHandlers() {
    const { onSelect, searchable } = this.props;

    // Handle selection
    if (onSelect) {
      this.el.on('select', (_item, index) => {
        const actualIndex = this.getActualIndex(index);
        if (actualIndex >= 0 && actualIndex < this.options.length) {
          this.selectedIndex = actualIndex;
          onSelect(actualIndex, this.options[actualIndex]);
          this.updateDisplay();
        }
      });
    }

    // Handle search mode if searchable
    if (searchable) {
      this.el.key(['/'], () => {
        this.enterSearchMode();
      });

      this.el.key(['escape'], () => {
        this.exitSearchMode();
      });
    }
  }

  private renderOptions(): string[] {
    if (this.props.placeholder && this.selectedIndex === -1) {
      return [this.props.placeholder, ...this.filteredOptions];
    }
    return this.filteredOptions;
  }

  private getActualIndex(displayIndex: number): number {
    if (this.props.placeholder && this.selectedIndex === -1) {
      return displayIndex - 1; // Adjust for placeholder
    }
    return displayIndex;
  }

  private updateDisplay() {
    this.el.setItems(this.renderOptions());

    if (this.selectedIndex >= 0) {
      const displayIndex = this.props.placeholder && this.selectedIndex === -1 ?
        this.selectedIndex + 1 : this.selectedIndex;
      this.el.select(displayIndex);
    }

    this.el.screen.render();
  }

  private enterSearchMode() {
    if (!this.props.searchable) return;

    this.searchMode = true;
    // Note: In a real implementation, you might want to show a search input
    // For now, we'll just highlight that search mode is active
    this.el.style.border = { type: 'line', fg: this.theme.accent };
    this.el.screen.render();
  }

  private exitSearchMode() {
    this.searchMode = false;
    this.el.style.border = { type: 'line', fg: this.theme.border };
    this.el.screen.render();
  }

  // Method to set options
  setOptions(options: string[]) {
    this.options = options;
    this.filteredOptions = [...options];
    this.selectedIndex = -1;
    this.updateDisplay();
  }

  // Method to add option
  addOption(option: string) {
    this.options.push(option);
    this.filteredOptions.push(option);
    this.updateDisplay();
  }

  // Method to remove option by index
  removeOption(index: number) {
    if (index >= 0 && index < this.options.length) {
      this.options.splice(index, 1);
      this.filteredOptions = [...this.options];

      // Adjust selected index
      if (this.selectedIndex === index) {
        this.selectedIndex = -1;
      } else if (this.selectedIndex > index) {
        this.selectedIndex--;
      }

      this.updateDisplay();
    }
  }

  // Method to set selected index
  setSelectedIndex(index: number) {
    if (index >= -1 && index < this.options.length) {
      this.selectedIndex = index;
      this.updateDisplay();
    }
  }

  // Method to get selected index
  getSelectedIndex(): number {
    return this.selectedIndex;
  }

  // Method to get selected value
  getSelectedValue(): string | null {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.options.length) {
      return this.options[this.selectedIndex];
    }
    return null;
  }

  // Method to filter options
  filterOptions(filter: string) {
    if (!filter) {
      this.filteredOptions = [...this.options];
    } else {
      this.filteredOptions = this.options.filter(option =>
        option.toLowerCase().includes(filter.toLowerCase())
      );
    }
    this.updateDisplay();
  }

  // Method to clear filter
  clearFilter() {
    this.filteredOptions = [...this.options];
    this.updateDisplay();
  }

  // Method to set placeholder
  setPlaceholder(placeholder: string) {
    this.props.placeholder = placeholder;
    this.updateDisplay();
  }

  // Method to set searchable
  setSearchable(searchable: boolean) {
    this.props.searchable = searchable;
    if (!searchable) {
      this.searchMode = false;
      this.exitSearchMode();
    }
  }

  // Method to set max height
  setMaxHeight(height: number) {
    this.props.maxHeight = height;
    this.el.height = height;
    this.el.screen.render();
  }

  // Method to select next option
  selectNext() {
    if (this.filteredOptions.length === 0) return;

    let newIndex = this.selectedIndex + 1;
    if (newIndex >= this.filteredOptions.length) {
      newIndex = 0;
    }

    const actualIndex = this.options.indexOf(this.filteredOptions[newIndex]);
    this.setSelectedIndex(actualIndex);
  }

  // Method to select previous option
  selectPrevious() {
    if (this.filteredOptions.length === 0) return;

    let newIndex = this.selectedIndex - 1;
    if (newIndex < 0) {
      newIndex = this.filteredOptions.length - 1;
    }

    const actualIndex = this.options.indexOf(this.filteredOptions[newIndex]);
    this.setSelectedIndex(actualIndex);
  }

  // Method to check if option is selected
  isOptionSelected(index: number): boolean {
    return index === this.selectedIndex;
  }

  // Method to get option count
  getOptionCount(): number {
    return this.options.length;
  }

  // Method to get filtered option count
  getFilteredOptionCount(): number {
    return this.filteredOptions.length;
  }

  // Method to check if in search mode
  isInSearchMode(): boolean {
    return this.searchMode;
  }

  // Static method to create select with specific configuration
  static create(props: SelectProps): Select {
    return new Select(props);
  }

  // Static method to create simple select
  static simple(options: string[], onSelect?: (index: number, value: string) => void): Select {
    return new Select({ options, onSelect });
  }

  // Static method to create searchable select
  static searchable(options: string[], onSelect?: (index: number, value: string) => void): Select {
    return new Select({ options, onSelect, searchable: true });
  }
}


