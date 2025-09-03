import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, computeBlessedStyle } from './BaseComponent';
import { resolveTheme } from '../theming/theme';

export type TextInputProps = BaseProps & {
  value?: string;
  placeholder?: string;
  onSubmit?: (value: string) => void;
  onChange?: (value: string) => void;
  secret?: boolean;
};

export class TextInput implements Component<Widgets.TextboxElement> {
  el: Widgets.TextboxElement;
  theme: any;
  destroy: () => void;

  constructor(props: TextInputProps) {
    const theme = resolveTheme(props.theme);
    const el = blessed.textbox({
      parent: props.parent,
      inputOnFocus: true,
      value: props.value || '',
      secret: props.secret ?? false,
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
      padding: undefined,
      label: props.label,
    });

    if (props.placeholder && !props.value) {
      el.setValue(props.placeholder);
      el.style.fg = 'gray';
      el.on('focus', () => {
        if (el.getValue() === props.placeholder) {
          el.setValue('');
          el.style.fg = theme.foreground;
          el.screen.render();
        }
      });
      el.on('blur', () => {
        if (!el.getValue()) {
          el.setValue(props.placeholder!);
          el.style.fg = 'gray';
        }
      });
    }

    if (props.onChange) {
      el.on('keypress', () => props.onChange!(el.getValue() || ''));
    }

    if (props.onSubmit) {
      el.on('submit', () => props.onSubmit!(el.getValue() || ''));
    }

    this.el = el;
    this.theme = theme;
    this.destroy = () => el.destroy();
  }
}
