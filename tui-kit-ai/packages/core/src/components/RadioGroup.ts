import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, computeBlessedStyle } from './BaseComponent';
import { resolveTheme } from '../theming/theme';

export type RadioGroupProps = BaseProps & {
  options: string[];
  value?: number; // index
  onChange?: (index: number, value: string) => void;
};

export class RadioGroup implements Component<Widgets.RadiosetElement> {
  el: Widgets.RadiosetElement;
  theme: any;
  destroy: () => void;
  private buttons: Widgets.RadiobuttonElement[] = [];

  constructor(props: RadioGroupProps) {
    const theme = resolveTheme(props.theme);
    const el = blessed.radioset({
      parent: props.parent,
      style: computeBlessedStyle(theme, props),
      top: props.top,
      left: props.left,
      right: props.right,
      bottom: props.bottom,
      width: props.width,
      height: props.height,
      label: props.label,
    });
    this.el = el;
    this.theme = theme;
    this.destroy = () => el.destroy();

    props.options.forEach((opt, i) => {
      const rb = blessed.radiobutton({ parent: el, content: opt, top: i, left: 1, checked: i === (props.value ?? -1) });
      rb.on('check', () => {
        this.buttons.forEach((b, j) => { if (j !== i) b.checked = false; });
        if (props.onChange) props.onChange(i, opt);
      });
      this.buttons.push(rb);
    });
  }
}
