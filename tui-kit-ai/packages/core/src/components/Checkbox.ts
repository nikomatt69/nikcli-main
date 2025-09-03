import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, computeBlessedStyle } from './BaseComponent';
import { resolveTheme } from '../theming/theme';

export type CheckboxProps = BaseProps & {
  text?: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
};

export class Checkbox implements Component<Widgets.CheckboxElement> {
  el: Widgets.CheckboxElement;
  theme: any;
  destroy: () => void;

  constructor(props: CheckboxProps) {
    const theme = resolveTheme(props.theme);
    const el = blessed.checkbox({
      parent: props.parent,
      content: props.text,
      checked: props.checked ?? false,
      style: computeBlessedStyle(theme, props),
      mouse: props.mouse ?? true,
      keys: props.keys ?? true,
      top: props.top,
      left: props.left,
      right: props.right,
      bottom: props.bottom,
      width: props.width,
      height: props.height,
      label: props.label,
    });
    if (props.onChange) el.on('check', () => props.onChange!(true)).on('uncheck', () => props.onChange!(false));
    this.el = el;
    this.theme = theme;
    this.destroy = () => el.destroy();
  }
}
