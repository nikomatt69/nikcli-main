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
    const el = blessed.box({
      parent: props.parent,
      style: computeBlessedStyle(theme, props),
      border: props.borderStyle && props.borderStyle !== 'none' ? 'line' : undefined,
      top: props.top,
      left: props.left,
      right: props.right,
      bottom: props.bottom,
      width: props.width,
      height: props.height,
      label: props.label,
      tags: true,
    });
    if (props.value !== undefined) this.setValueInternal(el, props.value, props.suffix);
    this.el = el;
    this.theme = theme;
    this.destroy = () => el.destroy();
  }

  setValue(value: number) {
    this.setValueInternal(this.el, value);
  }
  private setValueInternal(el: any, value: number, suffix?: string) {
    const v = Math.max(0, Math.min(100, value));
    const width = typeof el.width === 'number' ? el.width : 30;
    const barWidth = Math.max(1, (width as number) - 4);
    const filled = Math.round((v / 100) * barWidth);
    const text = `[${'█'.repeat(filled)}${' '.repeat(Math.max(0, barWidth - filled))}] ${v}%${suffix ? ` ${suffix}` : ''}`;
    el.setContent(text);
    el.screen.render();
  }
}
