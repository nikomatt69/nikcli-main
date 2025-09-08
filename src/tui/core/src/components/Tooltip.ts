import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';
import { ComponentVariant, ComponentSize, ComponentState } from '../theming/design-tokens';

export type TooltipProps = BaseProps & { 
  content: string; 
  target: Widgets.BlessedElement;
  position?: 'top' | 'bottom' | 'left' | 'right';
  offset?: number;
  showDelay?: number;
  hideDelay?: number;
  maxWidth?: number;
  arrow?: boolean;
  // Back-compat alias
  text?: string;
};

export class Tooltip implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private baseComponent: any;
  private props: TooltipProps;
  private target: Widgets.BlessedElement;
  private showTimer?: NodeJS.Timeout;
  private hideTimer?: NodeJS.Timeout;
  private isVisible: boolean = false;

  constructor(props: TooltipProps) {
    this.props = props;
    this.target = props.target;
    
    const comp = createBoxBase<Widgets.BoxElement>({
      ...props,
      width: 'shrink',
      height: 'shrink',
      borderStyle: 'line',
    }, 'tooltip');

    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = () => {
      this.clearTimers();
      comp.destroy();
    };
    this.baseComponent = comp;

    const txt = props.content || props.text || '';
    this.el.setContent(` ${txt} `);
    this.setupTooltipBehavior();
    this.hide(); // Start hidden
  }

  // Implement required methods by delegating to base component
  setVariant = (variant: ComponentVariant) => this.baseComponent.setVariant(variant);
  setSize = (size: ComponentSize) => this.baseComponent.setSize(size);
  setState = (state: ComponentState) => this.baseComponent.setState(state);
  getConfig = () => this.baseComponent.getConfig();
  update = (props: Partial<BaseProps>) => this.baseComponent.update(props);

  private setupTooltipBehavior() {
    const { showDelay = 500, hideDelay = 100 } = this.props;

    // Show tooltip on mouse enter
    this.target.on('mouseover', () => {
      this.clearTimers();
      this.showTimer = setTimeout(() => {
        this.show();
      }, showDelay);
    });

    // Hide tooltip on mouse leave
    this.target.on('mouseout', () => {
      this.clearTimers();
      this.hideTimer = setTimeout(() => {
        this.hide();
      }, hideDelay);
    });

    // Hide tooltip when target is destroyed
    this.target.on('destroy', () => {
      this.destroy();
    });
  }

  private clearTimers() {
    if (this.showTimer) {
      clearTimeout(this.showTimer);
      this.showTimer = undefined;
    }
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = undefined;
    }
  }

  private calculatePosition() {
    const { position = 'top', offset = 1, arrow = true } = this.props;
    const targetTop = this.target.top as number;
    const targetLeft = this.target.left as number;
    const targetWidth = this.target.width as number;
    const targetHeight = this.target.height as number;
    const tooltipWidth = this.el.width as number;
    const tooltipHeight = this.el.height as number;

    let top: number;
    let left: number;

    switch (position) {
      case 'top':
        top = targetTop - tooltipHeight - offset;
        left = targetLeft + (targetWidth / 2) - (tooltipWidth / 2);
        break;
      case 'bottom':
        top = targetTop + targetHeight + offset;
        left = targetLeft + (targetWidth / 2) - (tooltipWidth / 2);
        break;
      case 'left':
        top = targetTop + (targetHeight / 2) - (tooltipHeight / 2);
        left = targetLeft - tooltipWidth - offset;
        break;
      case 'right':
        top = targetTop + (targetHeight / 2) - (tooltipHeight / 2);
        left = targetLeft + targetWidth + offset;
        break;
      default:
        top = targetTop - tooltipHeight - offset;
        left = targetLeft + (targetWidth / 2) - (tooltipWidth / 2);
    }

    // Add arrow indicator if enabled
    if (arrow) {
      let arrowContent = '';
      switch (position) {
        case 'top':
          arrowContent = ` ${this.props.content || this.props.text} ↓`;
          break;
        case 'bottom':
          arrowContent = ` ↑ ${this.props.content || this.props.text}`;
          break;
        case 'left':
          arrowContent = ` ${this.props.content || this.props.text} →`;
          break;
        case 'right':
          arrowContent = ` ← ${this.props.content || this.props.text}`;
          break;
      }
      this.el.setContent(arrowContent);
    }

    return { top, left };
  }

  // Method to show tooltip
  show() {
    if (this.isVisible) return;

    const { top, left } = this.calculatePosition();
    this.el.top = top;
    this.el.left = left;
    this.el.show();
    this.isVisible = true;
    this.el.screen.render();
  }

  // Method to hide tooltip
  hide() {
    if (!this.isVisible) return;

    this.el.hide();
    this.isVisible = false;
    this.el.screen.render();
  }

  // Method to set tooltip text
  setText(text: string) {
    this.props.content = text;
    this.el.setContent(` ${text} `);
    this.el.screen.render();
  }

  // Method to set tooltip position
  setPosition(position: 'top' | 'bottom' | 'left' | 'right') {
    this.props.position = position;
    if (this.isVisible) {
      this.show(); // Recalculate position
    }
  }

  // Method to set offset
  setOffset(offset: number) {
    this.props.offset = offset;
    if (this.isVisible) {
      this.show(); // Recalculate position
    }
  }

  // Method to set show delay
  setShowDelay(delay: number) {
    this.props.showDelay = delay;
    this.setupTooltipBehavior();
  }

  // Method to set hide delay
  setHideDelay(delay: number) {
    this.props.hideDelay = delay;
    this.setupTooltipBehavior();
  }

  // Method to set max width
  setMaxWidth(width: number) {
    this.props.maxWidth = width;
    const t = this.props.content || this.props.text || '';
    this.el.width = Math.min(width, t.length + 4);
    this.el.screen.render();
  }

  // Method to set arrow
  setArrow(arrow: boolean) {
    this.props.arrow = arrow;
    if (this.isVisible) {
      this.show(); // Recalculate position with new arrow setting
    }
  }

  // Method to set target
  setTarget(target: Widgets.BlessedElement) {
    // Remove old event listeners
    this.target.off('mouseover', () => {});
    this.target.off('mouseout', () => {});
    this.target.off('destroy', () => {});

    this.target = target;
    this.setupTooltipBehavior();
  }

  // Method to check if tooltip is visible
  isTooltipVisible(): boolean {
    return this.isVisible;
  }

  // Method to get tooltip text
  getText(): string {
    return this.props.content || this.props.text || '';
  }

  // Method to get tooltip position
  getPosition(): 'top' | 'bottom' | 'left' | 'right' {
    return this.props.position || 'top';
  }

  // Method to get tooltip offset
  getOffset(): number {
    return this.props.offset || 1;
  }

  // Method to get show delay
  getShowDelay(): number {
    return this.props.showDelay || 500;
  }

  // Method to get hide delay
  getHideDelay(): number {
    return this.props.hideDelay || 100;
  }

  // Method to force show tooltip
  forceShow() {
    this.clearTimers();
    this.show();
  }

  // Method to force hide tooltip
  forceHide() {
    this.clearTimers();
    this.hide();
  }

  // Method to toggle tooltip
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  // Static method to create tooltip with specific configuration
  static create(props: TooltipProps): Tooltip {
    return new Tooltip(props);
  }

  // Static method to create simple tooltip
  static simple(text: string, target: Widgets.BlessedElement): Tooltip {
    return new Tooltip({ content: text, target } as any);
  }

  // Static method to create tooltip with position
  static positioned(text: string, target: Widgets.BlessedElement, position: 'top' | 'bottom' | 'left' | 'right'): Tooltip {
    return new Tooltip({ content: text, target, position } as any);
  }
}
