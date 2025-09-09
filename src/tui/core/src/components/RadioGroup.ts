import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';
import { ComponentVariant, ComponentSize, ComponentState } from '../theming/design-tokens';
import { resolveTheme } from '../theming/theme';

export type RadioGroupProps = BaseProps & {
  options: string[];
  value?: number; // index
  onChange?: (index: number, value: string) => void;
  orientation?: 'vertical' | 'horizontal';
  spacing?: number;
};

export class RadioGroup implements Component<Widgets.RadioSetElement> {
  el: Widgets.RadioSetElement;
  theme: any;
  destroy: () => void;
  private baseComponent: any;
  private props: RadioGroupProps;
  private buttons: Widgets.RadioButtonElement[] = [];
  private options: string[];
  private selectedIndex: number;

  constructor(props: RadioGroupProps) {
    this.props = props;
    this.options = props.options;
    this.selectedIndex = props.value ?? -1;
    
    const comp = createBoxBase<Widgets.BoxElement>({
      ...props,
      borderStyle: 'none',
    }, 'radio-group');

    // Create radio set
    const el = blessed.radioset({
      parent: comp.el,
      style: { fg: comp.theme.foreground },
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: props.width,
      height: props.height,
      label: props.label,
    });

    this.el = el;
    this.theme = comp.theme;
    this.destroy = () => {
      el.destroy();
      comp.destroy();
    };
    this.baseComponent = comp;

    this.createRadioButtons();
  }

  // Implement required methods by delegating to base component
  setVariant = (variant: ComponentVariant) => this.baseComponent.setVariant(variant);
  setSize = (size: ComponentSize) => this.baseComponent.setSize(size);
  setState = (state: ComponentState) => this.baseComponent.setState(state);
  getConfig = () => this.baseComponent.getConfig();
  update = (props: Partial<BaseProps>) => this.baseComponent.update(props);

  private createRadioButtons() {
    const { orientation = 'vertical', spacing = 1 } = this.props;
    
    // Clear existing buttons
    this.buttons.forEach(btn => btn.destroy());
    this.buttons = [];

    this.options.forEach((opt, i) => {
      const rb = blessed.radiobutton({
        parent: this.el,
        content: opt,
        checked: i === this.selectedIndex,
        style: { fg: this.theme.foreground },
      });

      // Position buttons based on orientation
      if (orientation === 'horizontal') {
        rb.top = 0;
        rb.left = i * (opt.length + spacing + 3); // +3 for radio button
      } else {
        rb.top = i * (1 + spacing);
        rb.left = 0;
      }

      // Setup event handler
      rb.on('check', () => {
        this.handleSelection(i, opt);
      });

      this.buttons.push(rb);
    });
  }

  private handleSelection(index: number, value: string) {
    // Uncheck all other buttons
    this.buttons.forEach((btn, i) => {
      if (i !== index) {
        btn.checked = false;
      }
    });

    this.selectedIndex = index;
    
    if (this.props.onChange) {
      this.props.onChange(index, value);
    }
  }

  // Method to set options
  setOptions(options: string[]) {
    this.options = options;
    this.selectedIndex = -1;
    this.createRadioButtons();
    this.el.screen.render();
  }

  // Method to add option
  addOption(option: string) {
    this.options.push(option);
    this.createRadioButtons();
    this.el.screen.render();
  }

  // Method to remove option by index
  removeOption(index: number) {
    if (index >= 0 && index < this.options.length) {
      this.options.splice(index, 1);
      
      // Adjust selected index
      if (this.selectedIndex === index) {
        this.selectedIndex = -1;
      } else if (this.selectedIndex > index) {
        this.selectedIndex--;
      }
      
      this.createRadioButtons();
      this.el.screen.render();
    }
  }

  // Method to set selected value
  setValue(index: number) {
    if (index >= 0 && index < this.options.length) {
      this.selectedIndex = index;
      this.buttons.forEach((btn, i) => {
        btn.checked = i === index;
      });
      this.el.screen.render();
    }
  }

  // Method to get selected value
  getValue(): { index: number; value: string } | null {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.options.length) {
      return {
        index: this.selectedIndex,
        value: this.options[this.selectedIndex],
      };
    }
    return null;
  }

  // Method to get selected index
  getSelectedIndex(): number {
    return this.selectedIndex;
  }

  // Method to get selected text
  getSelectedText(): string | null {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.options.length) {
      return this.options[this.selectedIndex];
    }
    return null;
  }

  // Method to set orientation
  setOrientation(orientation: 'vertical' | 'horizontal') {
    this.props.orientation = orientation;
    this.createRadioButtons();
    this.el.screen.render();
  }

  // Method to set spacing
  setSpacing(spacing: number) {
    this.props.spacing = spacing;
    this.createRadioButtons();
    this.el.screen.render();
  }

  // Method to enable/disable option
  setOptionDisabled(index: number, disabled: boolean) {
    if (index >= 0 && index < this.buttons.length) {
      this.buttons[index].style.fg = disabled ? 'gray' : this.theme.foreground;
      this.el.screen.render();
    }
  }

  // Method to clear selection
  clearSelection() {
    this.selectedIndex = -1;
    this.buttons.forEach(btn => {
      btn.checked = false;
    });
    this.el.screen.render();
  }

  // Method to check if option is selected
  isOptionSelected(index: number): boolean {
    return index === this.selectedIndex;
  }

  // Method to get option count
  getOptionCount(): number {
    return this.options.length;
  }

  // Static method to create radio group with specific configuration
  static create(props: RadioGroupProps): RadioGroup {
    return new RadioGroup(props);
  }
}


