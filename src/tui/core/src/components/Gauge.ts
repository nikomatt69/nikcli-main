import blessed from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';
import { ComponentVariant, ComponentSize, ComponentState } from '../theming/design-tokens';
import { resolveTheme } from '../theming/theme';

export type GaugeProps = BaseProps & {
  value?: number; // 0..100
  suffix?: string;
  showPercentage?: boolean;
  showBar?: boolean;
};

export class Gauge implements Component<any> {
  el: any;
  theme: any;
  destroy: () => void;
  private baseComponent: any;
  private props: GaugeProps;

  constructor(props: GaugeProps) {
    this.props = props;

    const comp = createBoxBase<any>({
      ...props,
      borderStyle: props.borderStyle && props.borderStyle !== 'none' ? 'line' : undefined,
    }, 'gauge');

    // Create gauge element
    const el = blessed.box({
      parent: comp.el,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: props.width,
      height: props.height,
      label: props.label,
      tags: true,
    });

    if (props.value !== undefined) {
      this.setValueInternal(el, props.value, props.suffix);
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

  setValue(value: number) {
    this.setValueInternal(this.el, value);
  }

  private setValueInternal(el: any, value: number, suffix?: string) {
    const v = Math.max(0, Math.min(100, value));
    const width = typeof el.width === 'number' ? el.width : 30;
    const barWidth = Math.max(1, (width as number) - 4);
    const filled = Math.round((v / 100) * barWidth);

    let text = '';

    if (this.props.showBar !== false) {
      text += `[${'█'.repeat(filled)}${' '.repeat(Math.max(0, barWidth - filled))}] `;
    }

    if (this.props.showPercentage !== false) {
      text += `${v}%`;
    }

    if (suffix) {
      text += ` ${suffix}`;
    }

    el.setContent(text);
    el.screen.render();
  }

  // Method to set suffix
  setSuffix(suffix: string) {
    this.props.suffix = suffix;
    if (this.props.value !== undefined) {
      this.setValueInternal(this.el, this.props.value, suffix);
    }
  }

  // Method to toggle percentage display
  setShowPercentage(show: boolean) {
    this.props.showPercentage = show;
    if (this.props.value !== undefined) {
      this.setValueInternal(this.el, this.props.value, this.props.suffix);
    }
  }

  // Method to toggle bar display
  setShowBar(show: boolean) {
    this.props.showBar = show;
    if (this.props.value !== undefined) {
      this.setValueInternal(this.el, this.props.value, this.props.suffix);
    }
  }

  // Method to get current value
  getValue(): number {
    return this.props.value || 0;
  }

  // Static method to create gauge with specific configuration
  static create(props: GaugeProps): Gauge {
    return new Gauge(props);
  }
}


