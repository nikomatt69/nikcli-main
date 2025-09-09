import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';
import { ComponentVariant, ComponentSize, ComponentState } from '../theming/design-tokens';

export type Step = {
  label: string;
  completed?: boolean;
  description?: string;
  icon?: string;
};

export type StepperProps = BaseProps & {
  steps: Step[];
  activeIndex?: number;
  orientation?: 'horizontal' | 'vertical';
  showDescriptions?: boolean;
  clickable?: boolean;
  onStepClick?: (index: number) => void;
};

export class Stepper implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private baseComponent: any;
  private props: StepperProps;
  private steps: Step[];
  private activeIndex: number;
  private stepElements: Widgets.TextElement[] = [];

  constructor(props: StepperProps) {
    this.props = props;
    this.steps = props.steps;
    this.activeIndex = props.activeIndex ?? 0;

    const comp = createBoxBase<Widgets.BoxElement>({
      ...props,
      borderStyle: 'line',
      label: props.label || ' Steps ',
    }, 'stepper');

    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = comp.destroy;
    this.baseComponent = comp;

    this.renderSteps();
  }

  // Implement required methods by delegating to base component
  setVariant = (variant: ComponentVariant) => this.baseComponent.setVariant(variant);
  setSize = (size: ComponentSize) => this.baseComponent.setSize(size);
  setState = (state: ComponentState) => this.baseComponent.setState(state);
  getConfig = () => this.baseComponent.getConfig();
  update = (props: Partial<BaseProps>) => this.baseComponent.update(props);

  private renderSteps() {
    // Clear existing step elements
    this.stepElements.forEach(el => el.destroy());
    this.stepElements = [];

    const { orientation = 'vertical', showDescriptions = false, clickable = false } = this.props;
    const isHorizontal = orientation === 'horizontal';

    this.steps.forEach((step, index) => {
      const isActive = index === this.activeIndex;
      const isCompleted = step.completed;
      const isClickable = clickable && this.props.onStepClick;

      let content = '';

      if (isHorizontal) {
        // Horizontal layout
        if (index > 0) {
          content += ' → ';
        }

        if (isActive) {
          content += `[${step.icon || '●'}] ${step.label}`;
        } else if (isCompleted) {
          content += `[${step.icon || '✔'}] ${step.label}`;
        } else {
          content += `[${step.icon || '○'}] ${step.label}`;
        }
      } else {
        // Vertical layout
        const prefix = isActive ? '>' : ' ';
        const status = isCompleted ? '✔' : isActive ? '●' : '○';
        const icon = step.icon || status;

        content = `${prefix} [${icon}] ${step.label}`;

        if (showDescriptions && step.description) {
          content += `\n    ${step.description}`;
        }
      }

      const stepElement = blessed.text({
        parent: this.el,
        content,
        top: isHorizontal ? 0 : index * (showDescriptions ? 2 : 1),
        left: isHorizontal ? (index * 20) : 2,
        height: showDescriptions ? 2 : 1,
        style: {
          fg: isActive ? this.theme.accent :
            isCompleted ? 'green' :
              this.theme.foreground,
        },
      });

      // Make step clickable if specified
      if (isClickable) {
        stepElement.enableMouse();
        stepElement.on('click', () => {
          if (this.props.onStepClick) {
            this.props.onStepClick(index);
          }
        });

        // Add hover effect
        stepElement.on('mouseover', () => {
          stepElement.style.fg = this.theme.accent;
          this.el.screen.render();
        });

        stepElement.on('mouseout', () => {
          const isActive = index === this.activeIndex;
          const isCompleted = step.completed;
          stepElement.style.fg = isActive ? this.theme.accent :
            isCompleted ? 'green' :
              this.theme.foreground;
          this.el.screen.render();
        });
      }

      this.stepElements.push(stepElement);
    });

    this.el.screen.render();
  }

  // Method to set active step
  setActive(index: number) {
    if (index >= 0 && index < this.steps.length) {
      this.activeIndex = index;
      this.renderSteps();
    }
  }

  // Method to get active step index
  getActiveIndex(): number {
    return this.activeIndex;
  }

  // Method to get active step
  getActiveStep(): Step | undefined {
    return this.steps[this.activeIndex];
  }

  // Method to go to next step
  next() {
    if (this.activeIndex < this.steps.length - 1) {
      this.setActive(this.activeIndex + 1);
    }
  }

  // Method to go to previous step
  previous() {
    if (this.activeIndex > 0) {
      this.setActive(this.activeIndex - 1);
    }
  }

  // Method to go to first step
  first() {
    this.setActive(0);
  }

  // Method to go to last step
  last() {
    this.setActive(this.steps.length - 1);
  }

  // Method to set steps
  setSteps(steps: Step[]) {
    this.steps = steps;
    this.activeIndex = Math.min(this.activeIndex, steps.length - 1);
    this.renderSteps();
  }

  // Method to add step
  addStep(step: Step) {
    this.steps.push(step);
    this.renderSteps();
  }

  // Method to remove step by index
  removeStep(index: number) {
    if (index >= 0 && index < this.steps.length) {
      this.steps.splice(index, 1);

      // Adjust active index
      if (this.activeIndex >= this.steps.length) {
        this.activeIndex = Math.max(0, this.steps.length - 1);
      }

      this.renderSteps();
    }
  }

  // Method to update step
  updateStep(index: number, step: Step) {
    if (index >= 0 && index < this.steps.length) {
      this.steps[index] = step;
      this.renderSteps();
    }
  }

  // Method to mark step as completed
  completeStep(index: number) {
    if (index >= 0 && index < this.steps.length) {
      this.steps[index].completed = true;
      this.renderSteps();
    }
  }

  // Method to mark step as incomplete
  uncompleteStep(index: number) {
    if (index >= 0 && index < this.steps.length) {
      this.steps[index].completed = false;
      this.renderSteps();
    }
  }

  // Method to set step label
  setStepLabel(index: number, label: string) {
    if (index >= 0 && index < this.steps.length) {
      this.steps[index].label = label;
      this.renderSteps();
    }
  }

  // Method to set step description
  setStepDescription(index: number, description: string) {
    if (index >= 0 && index < this.steps.length) {
      this.steps[index].description = description;
      this.renderSteps();
    }
  }

  // Method to set step icon
  setStepIcon(index: number, icon: string) {
    if (index >= 0 && index < this.steps.length) {
      this.steps[index].icon = icon;
      this.renderSteps();
    }
  }

  // Method to set orientation
  setOrientation(orientation: 'horizontal' | 'vertical') {
    this.props.orientation = orientation;
    this.renderSteps();
  }

  // Method to set show descriptions
  setShowDescriptions(show: boolean) {
    this.props.showDescriptions = show;
    this.renderSteps();
  }

  // Method to set clickable
  setClickable(clickable: boolean) {
    this.props.clickable = clickable;
    this.renderSteps();
  }

  // Method to get step count
  getStepCount(): number {
    return this.steps.length;
  }

  // Method to get completed step count
  getCompletedStepCount(): number {
    return this.steps.filter(step => step.completed).length;
  }

  // Method to get progress percentage
  getProgressPercentage(): number {
    if (this.steps.length === 0) return 0;
    return (this.getCompletedStepCount() / this.steps.length) * 100;
  }

  // Method to check if all steps completed
  isAllCompleted(): boolean {
    return this.steps.every(step => step.completed);
  }

  // Method to check if step is active
  isStepActive(index: number): boolean {
    return index === this.activeIndex;
  }

  // Method to check if step is completed
  isStepCompleted(index: number): boolean {
    return this.steps[index]?.completed || false;
  }

  // Static method to create stepper with specific configuration
  static create(props: StepperProps): Stepper {
    return new Stepper(props);
  }

  // Static method to create simple stepper
  static simple(steps: string[]): Stepper {
    const stepObjects = steps.map(label => ({ label }));
    return new Stepper({ steps: stepObjects });
  }

  // Static method to create horizontal stepper
  static horizontal(steps: Step[]): Stepper {
    return new Stepper({ steps, orientation: 'horizontal' });
  }
}


