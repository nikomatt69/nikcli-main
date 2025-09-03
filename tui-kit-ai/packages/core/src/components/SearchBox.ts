import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, computeBlessedStyle } from './BaseComponent';
import { resolveTheme } from '../theming/theme';

export type SearchBoxProps = BaseProps & {
  placeholder?: string;
  onChange?: (value: string) => void;
};

export class SearchBox implements Component<Widgets.TextboxElement> {
  el: Widgets.TextboxElement;
  theme: any;
  destroy: () => void;

  constructor(props: SearchBoxProps) {
    const theme = resolveTheme(props.theme);
    const el = blessed.textbox({ parent: props.parent, inputOnFocus: true, border: { type: 'line' }, style: computeBlessedStyle(theme, props), label: ' Search ' });
    if (props.placeholder) el.setValue(props.placeholder);
    if (props.onChange) el.on('keypress', () => props.onChange!(el.getValue() || ''));
    this.el = el;
    this.theme = theme;
    this.destroy = () => el.destroy();
  }
}
