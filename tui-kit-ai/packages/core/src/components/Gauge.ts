import blessed from 'blessed';
import { BaseProps, Component, computeBlessedStyle } from './BaseComponent';
import { resolveTheme } from '../theming/theme';

export type GaugeProps = BaseProps & {
  value?: number; // 0..100
  suffix?: string;
};

export class Gauge implements Component {
  el: any;
  theme: any;
  destroy: () => void;

  constructor(props: GaugeProps) {
    const theme = resolveTheme(props.theme);
    const el = blessed.gauge({
      parent: props.parent,
      style: computeBlessedStyle(theme, props),
      border: props.borderStyle && props.borderStyle !== 'none' ? { type: props.borderStyle } : undefined,
      top: props.top,
      left: props.left,
      right: props.right,
      bottom: props.bottom,
      width: props.width,
      height: props.height,
      label: props.label,
    });
    if (props.value !== undefined) el.setPercent(props.value);
    this.el = el;
    this.theme = theme;
    this.destroy = () => el.destroy();
  }

  setValue(value: number) {
    this.el.setPercent(Math.max(0, Math.min(100, value)));
    this.el.screen.render();
  }
}
