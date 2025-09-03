import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, computeBlessedStyle } from './BaseComponent';
import { resolveTheme } from '../theming/theme';

export type PromptProps = BaseProps & { message: string; onSubmit: (value: string) => void };

export class Prompt implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private input: Widgets.TextboxElement;

  constructor(props: PromptProps) {
    const theme = resolveTheme(props.theme);
    const el = blessed.box({ parent: props.parent, width: '70%', height: 7, top: 'center', left: 'center', border: { type: 'line' }, style: computeBlessedStyle(theme, props), label: ' Prompt ' });
    blessed.text({ parent: el, top: 1, left: 2, content: props.message });
    const input = blessed.textbox({ parent: el, top: 3, left: 2, right: 2, height: 3, inputOnFocus: true, border: { type: 'line' } });
    input.key(['enter'], () => { props.onSubmit(input.getValue() || ''); this.destroy(); });
    this.el = el;
    this.input = input;
    this.theme = theme;
    this.destroy = () => el.destroy();
  }
}
