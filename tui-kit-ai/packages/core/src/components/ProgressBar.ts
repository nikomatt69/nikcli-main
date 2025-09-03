import blessed from 'blessed';
import { BaseProps, Component, computeBlessedStyle } from './BaseComponent';
import { resolveTheme } from '../theming/theme';

export type ProgressBarProps = BaseProps & {
  value?: number; // 0..100
  orientation?: 'horizontal' | 'vertical';
};

export class ProgressBar implements Component {
  el: any;
  theme: any;
  destroy: () => void;

  constructor(props: ProgressBarProps) {
    const theme = resolveTheme(props.theme);
    const el = blessed.progressbar({
      parent: props.parent,
      orientation: props.orientation || 'horizontal',
      style: computeBlessedStyle(theme, props),
      border: props.borderStyle && props.borderStyle !== 'none' ? 'line' : undefined,
      top: props.top,
      left: props.left,
      right: props.right,
      bottom: props.bottom,
      width: props.width,
      height: props.height,
      keys: props.keys ?? true,
      mouse: props.mouse ?? true,
      label: props.label,
    });
    if (props.value !== undefined) el.setProgress(Math.max(0, Math.min(100, props.value)));
    this.el = el;
    this.theme = theme;
    this.destroy = () => el.destroy();
  }

  setValue(value: number) {
    const v = Math.max(0, Math.min(100, value));
    this.el.setProgress(v);
    this.el.screen.render();
  }
}
