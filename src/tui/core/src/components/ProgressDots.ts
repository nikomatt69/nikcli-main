import { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';
import { ComponentVariant, ComponentSize, ComponentState } from '../theming/design-tokens';

export type ProgressDotsProps = BaseProps & {
  text?: string;
  intervalMs?: number;
  dots?: string[];
  dotCount?: number;
};

export class ProgressDots implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private baseComponent: any;
  private props: ProgressDotsProps;
  private timer?: NodeJS.Timeout;
  private idx = 0;
  private dots: string[];
  private dotCount: number;

  constructor(props: ProgressDotsProps) {
    this.props = props;
    this.dots = props.dots || ['', '.', '..', '...'];
    this.dotCount = props.dotCount || this.dots.length;

    const comp = createBoxBase<Widgets.BoxElement>({
      ...props,
      borderStyle: 'none',
    }, 'progress-dots');

    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = () => {
      if (this.timer) {
        clearInterval(this.timer);
      }
      comp.destroy();
    };
    this.baseComponent = comp;

    this.start(props.text, props.intervalMs);
  }

  // Implement required methods by delegating to base component
  setVariant = (variant: ComponentVariant) => this.baseComponent.setVariant(variant);
  setSize = (size: ComponentSize) => this.baseComponent.setSize(size);
  setState = (state: ComponentState) => this.baseComponent.setState(state);
  getConfig = () => this.baseComponent.getConfig();
  update = (props: Partial<BaseProps>) => this.baseComponent.update(props);

  start(text?: string, intervalMs = 300) {
    if (this.timer) {
      clearInterval(this.timer);
    }

    const interval = intervalMs;
    this.timer = setInterval(() => {
      this.idx = (this.idx + 1) % this.dotCount;
      this.renderDots(text);
    }, interval);
  }

  private renderDots(text?: string) {
    const dots = this.dots[this.idx] || '';
    const content = `${text || ''}${dots}`;
    this.el.setContent(content);
    this.el.screen.render();
  }

  // Method to set progress text
  setText(text: string) {
    this.props.text = text;
    this.renderDots(text);
  }

  // Method to set dots pattern
  setDots(dots: string[]) {
    this.dots = dots;
    this.dotCount = dots.length;
    this.idx = 0;
    this.renderDots(this.props.text);
  }

  // Method to set dot count
  setDotCount(count: number) {
    this.dotCount = count;
    this.idx = 0;
    this.renderDots(this.props.text);
  }

  // Method to set interval
  setInterval(intervalMs: number) {
    this.props.intervalMs = intervalMs;
    this.start(this.props.text, intervalMs);
  }

  // Method to stop animation
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  // Method to pause animation
  pause() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  // Method to resume animation
  resume() {
    if (!this.timer) {
      this.start(this.props.text, this.props.intervalMs);
    }
  }

  // Method to reset animation
  reset() {
    this.idx = 0;
    this.renderDots(this.props.text);
  }

  // Method to set custom dots
  setCustomDots(dots: string[]) {
    this.dots = dots;
    this.dotCount = dots.length;
    this.idx = 0;
    this.renderDots(this.props.text);
  }

  // Method to get current dot index
  getCurrentDotIndex(): number {
    return this.idx;
  }

  // Method to get current dots
  getCurrentDots(): string {
    return this.dots[this.idx] || '';
  }

  // Method to check if running
  isRunning(): boolean {
    return this.timer !== undefined;
  }

  // Static method to create progress dots with specific configuration
  static create(props: ProgressDotsProps): ProgressDots {
    return new ProgressDots(props);
  }

  // Static method to create simple loading dots
  static loading(text?: string): ProgressDots {
    return new ProgressDots({ text, intervalMs: 300 });
  }

  // Static method to create fast loading dots
  static fast(text?: string): ProgressDots {
    return new ProgressDots({ text, intervalMs: 150 });
  }

  // Static method to create slow loading dots
  static slow(text?: string): ProgressDots {
    return new ProgressDots({ text, intervalMs: 500 });
  }
}


