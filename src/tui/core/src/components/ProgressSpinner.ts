import { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';
import { ComponentVariant, ComponentSize, ComponentState } from '../theming/design-tokens';

const bars = ['▁','▂','▃','▄','▅','▆','▇','█','▇','▆','▅','▄','▃','▂'];

export type ProgressSpinnerProps = BaseProps & { 
  text?: string; 
  intervalMs?: number;
  bars?: string[];
  barCount?: number;
};

export class ProgressSpinner implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private baseComponent: any;
  private props: ProgressSpinnerProps;
  private timer?: NodeJS.Timeout;
  private idx = 0;
  private bars: string[];
  private barCount: number;

  constructor(props: ProgressSpinnerProps) {
    this.props = props;
    this.bars = props.bars || bars;
    this.barCount = props.barCount || this.bars.length;
    
    const comp = createBoxBase<Widgets.BoxElement>({
      ...props,
      borderStyle: 'none',
    }, 'progress-spinner');

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

  start(text?: string, intervalMs = 80) {
    if (this.timer) {
      clearInterval(this.timer);
    }
    
    const interval = intervalMs;
    this.timer = setInterval(() => {
      this.idx = (this.idx + 1) % this.barCount;
      this.renderSpinner(text);
    }, interval);
  }

  private renderSpinner(text?: string) {
    const bar = this.bars[this.idx] || '';
    const content = `${bar} ${text || ''}`;
    this.el.setContent(content);
    this.el.screen.render();
  }

  // Method to set spinner text
  setText(text: string) {
    this.props.text = text;
    this.renderSpinner(text);
  }

  // Method to set custom bars
  setBars(bars: string[]) {
    this.bars = bars;
    this.barCount = bars.length;
    this.idx = 0;
    this.renderSpinner(this.props.text);
  }

  // Method to set bar count
  setBarCount(count: number) {
    this.barCount = count;
    this.idx = 0;
    this.renderSpinner(this.props.text);
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
    this.renderSpinner(this.props.text);
  }

  // Method to set custom spinner pattern
  setCustomPattern(pattern: string[]) {
    this.bars = pattern;
    this.barCount = pattern.length;
    this.idx = 0;
    this.renderSpinner(this.props.text);
  }

  // Method to get current bar index
  getCurrentBarIndex(): number {
    return this.idx;
  }

  // Method to get current bar
  getCurrentBar(): string {
    return this.bars[this.idx] || '';
  }

  // Method to check if running
  isRunning(): boolean {
    return this.timer !== undefined;
  }

  // Static method to create progress spinner with specific configuration
  static create(props: ProgressSpinnerProps): ProgressSpinner {
    return new ProgressSpinner(props);
  }

  // Static method to create simple spinner
  static simple(text?: string): ProgressSpinner {
    return new ProgressSpinner({ text, intervalMs: 80 });
  }

  // Static method to create fast spinner
  static fast(text?: string): ProgressSpinner {
    return new ProgressSpinner({ text, intervalMs: 50 });
  }

  // Static method to create slow spinner
  static slow(text?: string): ProgressSpinner {
    return new ProgressSpinner({ text, intervalMs: 150 });
  }
}


